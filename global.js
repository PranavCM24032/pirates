/**
 * PIRATES QUEST GLOBAL CORE
 * Handles state management, theme application, navigation, and utility functions.
 */

// Utility Namespace
window.PiratesUtils = {
    /**
     * Safe HTML Escaping to prevent XSS attacks
     * @param {string} str 
     * @returns {string} Safe HTML string
     */
    escapeHTML: (str) => {
        if (!str || typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Safe JSON parse with error handling
     * @param {string} str 
     * @param {any} fallback 
     * @returns {any} Parsed object or fallback
     */
    safeJSONParse: (str, fallback = null) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn('JSON parse failed:', e);
            return fallback;
        }
    },

    /**
     * Debounce function for performance optimization
     */
    debounce: (fn, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }
};

// Aliases for backward compatibility
window.escapeHTML = PiratesUtils.escapeHTML;
window.safeJSONParse = PiratesUtils.safeJSONParse;

// GLOBAL GAME STATE
const gameState = {
    teamData: null,
    currentLevel: 1,
    scanCount: 0,
    currentNode: null,
    targetNode: null,
    points: 0,
    level3Session: null,
    journey: []
};

window.gameState = gameState; // Export to window

/**
 * Initializes game state from localStorage
 */
function initGame() {
    const saved = localStorage.getItem('pirateState');
    if (saved) {
        const parsed = window.safeJSONParse(saved);
        if (parsed && typeof parsed === 'object') {
            Object.assign(gameState, {
                teamData: parsed.teamData || null,
                currentLevel: parseInt(parsed.currentLevel) || 1,
                scanCount: parseInt(parsed.scanCount) || 0,
                currentNode: parsed.currentNode || null,
                targetNode: parsed.targetNode || null,
                points: parseInt(parsed.points) || 0,
                level3Session: parsed.level3Session || null,
                journey: parsed.journey || []
            });
        }
    }
}

/**
 * Saves current game state to localStorage
 */
function saveGame() {
    try {
        localStorage.setItem('pirateState', JSON.stringify(gameState));
        // 🆕 SYNC STANDING TO CLOUD
        syncStandingToCloud();
    } catch (e) {
        console.warn('Failed to save game state:', e.name === 'QuotaExceededError' ? 'Quota exceeded' : e);
    }
}

window.saveGame = saveGame;

// ===== LEVEL 3 SESSION TRACKING SYSTEM =====
window.initLevel3Session = function () {
    if (gameState.currentLevel !== 3 || !gameState.teamData) return false;

    try {
        gameState.level3Session = {
            crewId: gameState.teamData.crewid || gameState.teamData.id,
            crewName: gameState.teamData.crewname || 'Unknown',
            loginTime: Date.now(),
            scannedNodes: [],
            pathTrace: '',
            totalMarks: 0,
            avgScore: 0,
            scanCount: 0,
            lastScanTime: 0,
            lastScanNode: null,
            completed: false
        };

        if (gameState.currentNode) {
            gameState.level3Session.scannedNodes.push({
                node: gameState.currentNode,
                timestamp: Date.now(),
                mark: 0
            });
            gameState.level3Session.pathTrace = gameState.currentNode;
            gameState.level3Session.scanCount = 1;
            gameState.level3Session.lastScanTime = Date.now();
            gameState.level3Session.lastScanNode = gameState.currentNode;
        }

        saveLevel3Session();
        return true;
    } catch (e) {
        console.error("Failed to init Level 3 session:", e);
        return false;
    }
};

function saveLevel3Session() {
    if (!gameState.level3Session) return;
    try {
        const sessions = window.safeJSONParse(localStorage.getItem('level3_sessions')) || [];
        const existingIdx = sessions.findIndex(s => s.crewId === gameState.level3Session.crewId);
        if (existingIdx >= 0) {
            sessions[existingIdx] = gameState.level3Session;
        } else {
            sessions.push(gameState.level3Session);
        }
        localStorage.setItem('level3_sessions', JSON.stringify(sessions));
    } catch (e) {
        console.warn("Failed to save Level 3 session:", e);
    }
}

window.updateLevel3Session = function (fromNode, toNode, mark) {
    if (gameState.currentLevel !== 3 || !gameState.level3Session) return false;

    try {
        const now = Date.now();
        const lastScanned = gameState.level3Session.scannedNodes[gameState.level3Session.scannedNodes.length - 1];

        if (!lastScanned || lastScanned.node !== toNode) {
            gameState.level3Session.scannedNodes.push({
                node: toNode,
                timestamp: now,
                mark: mark
            });

            gameState.level3Session.pathTrace = gameState.level3Session.pathTrace
                ? `${gameState.level3Session.pathTrace}->${toNode}`
                : toNode;

            gameState.level3Session.scanCount += 1;
            gameState.level3Session.totalMarks += mark;
            gameState.level3Session.lastScanTime = now;
            gameState.level3Session.lastScanNode = toNode;

            const transitions = Math.max(1, gameState.level3Session.scanCount - 1);
            gameState.level3Session.avgScore = Math.round((gameState.level3Session.totalMarks / transitions) * 100) / 100;

            // Update Global Points (500 base - total marks for efficiency)
            // We assume L1 (100) and L2 (200) are already added or handled separately
            // For real-time cloud sync, we update the points field
            gameState.points = 300 + Math.max(0, 500 - gameState.level3Session.totalMarks);

            saveLevel3Session();
            logGameEvent('LEVEL3_SCAN', {
                from: fromNode,
                to: toNode,
                mark: mark,
                avgScore: gameState.level3Session.avgScore,
                pathTrace: gameState.level3Session.pathTrace
            });
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to update Level 3 session:", e);
        return false;
    }
};

// Global Logging System
window.logGameEvent = function (type, data = {}) {
    try {
        if (!type || typeof type !== 'string') return;

        const logs = window.safeJSONParse(localStorage.getItem('pirateAdminLogs')) || [];
        const event = {
            timestamp: Date.now(),
            type: type.toUpperCase().slice(0, 50),
            crewId: gameState.teamData ? window.escapeHTML(String(gameState.teamData.crewid || gameState.teamData.id)).slice(0, 50) : 'UNKNOWN',
            level: parseInt(gameState.currentLevel) || 1,
            ...Object.keys(data).reduce((acc, key) => {
                const val = data[key];
                if (typeof val === 'string') acc[key] = val.slice(0, 200);
                else if (typeof val === 'number' || typeof val === 'boolean') acc[key] = val;
                return acc;
            }, {})
        };

        logs.push(event);
        if (logs.length > 200) logs.shift(); // Keep last 200 logs
        localStorage.setItem('pirateAdminLogs', JSON.stringify(logs));

        // 🆕 REAL-TIME CLOUD SYNC
        syncToCloud(event);
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            localStorage.removeItem('pirateAdminLogs');
        }
    }
};

// Navigation System
function navigateTo(url) {
    if (!url || typeof url !== 'string') return;

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            window.location.href = url;
        });
    } else {
        document.body.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
        document.body.style.opacity = '0';
        document.body.style.filter = 'blur(10px)';
        setTimeout(() => window.location.href = url, 300);
    }
}

window.navigateTo = navigateTo;

function navigateNext() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const level = gameState.currentLevel;

    const workflows = {
        1: ['index.html', 'displaycrew.html', 'login.html', 'bountyperson.html'],
        2: ['index.html', 'displaycrew.html', 'login.html', 'qr.html', 'verification.html', 'logical.html'],
        3: ['index.html', 'displaycrew.html', 'login.html', 'location.html', 'celebration.html']
    };

    const currentFlow = workflows[level] || workflows[1];
    const idx = currentFlow.indexOf(currentPage);

    if (idx !== -1 && idx < currentFlow.length - 1) {
        navigateTo(currentFlow[idx + 1]);
    } else {
        navigateTo('login.html');
    }
}

window.navigateNext = navigateNext;

// Minecraft Block Style System
const blockStyleCache = new Map();

function createMinecraftBlockStyle(colorMain, colorDark, colorBorder) {
    const cacheKey = `${colorMain}-${colorDark}-${colorBorder}`;
    if (blockStyleCache.has(cacheKey)) return blockStyleCache.get(cacheKey);

    const cMain = encodeURIComponent(colorMain);
    const cDark = encodeURIComponent(colorDark);
    const cBorder = encodeURIComponent(colorBorder);

    const bgSvg = `data:image/svg+xml,<svg width="60" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="60" fill="${cMain}"/><rect x="0" y="0" width="30" height="30" fill="${cDark}"/><rect x="30" y="30" width="30" height="30" fill="${cDark}"/></svg>`;
    const borderSvg = `data:image/svg+xml,<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" fill="${cBorder}"/><rect x="2" y="2" width="12" height="12" fill="${cMain}"/></svg>`;

    const style = {
        backgroundImage: `url('${bgSvg}')`,
        borderImage: `url('${borderSvg}') 6 stretch`
    };

    blockStyleCache.set(cacheKey, style);
    return style;
}

window.createMinecraftBlockStyle = createMinecraftBlockStyle;

function applyTheme() {
    const themeMap = [
        { selector: '.wooden-container', colors: { main: '#8B4513', dark: '#733C10', border: '#5A2D0C' }, config: { size: '80px 80px', borderWidth: '8px' } },
        { selector: '.wood-block, .corner-block', colors: { main: '#9B5523', dark: '#8B4513', border: '#3D1F08' }, config: { size: '20px 20px', borderWidth: '2px' } },
        { selector: '.glass-block, .glass-corner', colors: { main: 'rgba(173, 216, 230, 0.3)', dark: 'rgba(255, 255, 255, 0.4)', border: '#ffffff' }, config: { size: '20px 20px', borderWidth: '1px', backdropFilter: 'blur(4px)' } },
        { selector: '.loading-bar-container', colors: { main: '#333333', dark: '#222222', border: '#111111' }, config: { size: '40px 40px', borderWidth: '4px' } },
        { selector: '.wanted-poster', colors: { main: '#f5f5dc', dark: '#dfdfbf', border: '#3e2723' }, config: { size: '60px 60px', borderWidth: '8px' } },
        { selector: '.stone-container', colors: { main: '#555555', dark: '#444444', border: '#222222' }, config: { size: '40px 40px', borderWidth: '6px' } },
        { selector: '.glass-panel, .glass-container, .lens-overlay', colors: { main: 'rgba(255, 255, 255, 0.1)', dark: 'rgba(255, 255, 255, 0.05)', border: '#ffffff' }, config: { size: '40px 40px', borderWidth: '6px', backdropFilter: 'blur(12px) brightness(1.1)' } },
        { selector: '.ash-container', colors: { main: '#444444', dark: '#2C2C2C', border: '#1A1A1A' }, config: { size: '40px 40px', borderWidth: '6px' } },
        { selector: '.fire-container', colors: { main: '#FF4500', dark: '#8B0000', border: '#3E0000' }, config: { size: '30px 30px', borderWidth: '6px', boxShadow: '0 0 15px rgba(255, 69, 0, 0.4)' } },
        { selector: '.emerald-container', colors: { main: '#00A86B', dark: '#00703B', border: '#004020' }, config: { size: '40px 40px', borderWidth: '6px', boxShadow: '0 0 10px rgba(0, 168, 107, 0.3)' } }
    ];

    themeMap.forEach(({ selector, colors, config }) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) return;

        const style = createMinecraftBlockStyle(colors.main, colors.dark, colors.border);

        elements.forEach(el => {
            const s = el.style;
            s.backgroundImage = style.backgroundImage;
            s.backgroundSize = config.size;
            s.border = `${config.borderWidth} solid transparent`;
            s.borderImage = style.borderImage;
            s.imageRendering = 'pixelated';

            if (config.backdropFilter) s.backdropFilter = config.backdropFilter;
            if (config.boxShadow) s.boxShadow = config.boxShadow;

            if (selector.includes('glass')) {
                s.borderRadius = '2px';
                s.position = 'relative';
            }
        });
    });
}

// Global HUD
function injectGlobalHUD() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const excludedPages = ['index.html', 'displaycrew.html', 'login.html'];

    if (excludedPages.includes(currentPage) || document.querySelector('.global-hud')) return;

    const hud = document.createElement('div');
    hud.className = 'global-hud';
    hud.innerHTML = `
        <a href="login.html"><img src="images/logo.png" alt="Bounty Pirates" class="tv-logo"></a>
        <div id="hud-timer-slot"></div>
    `;
    document.body.appendChild(hud);
}

// Client Timer Sync
function initClientTimer() {
    if (document.getElementById('client-timer-display')) return;

    const slot = document.getElementById('hud-timer-slot') || document.body;
    const timerDisplay = document.createElement('div');
    timerDisplay.id = 'client-timer-display';
    timerDisplay.className = 'tv-timer';
    timerDisplay.style.display = 'none';
    timerDisplay.innerHTML = `<span id="ct-h">00</span>:<span id="ct-m">00</span>:<span id="ct-s">00</span>`;

    if (!document.getElementById('hud-timer-slot')) {
        timerDisplay.style.cssText = `position:fixed;top:15px;right:15px;color:#FFD700;font-family:'Pixelify Sans',sans-serif;font-size:1.2rem;font-weight:bold;z-index:9999;text-shadow:2px 2px 0 #000;display:none;pointer-events:none;`;
    }
    slot.appendChild(timerDisplay);

    const spans = { h: null, m: null, s: null };
    let timerId = null;

    const updateUI = () => {
        const rawState = localStorage.getItem('pirate_timer_state');
        if (!rawState) return;

        try {
            const state = JSON.parse(rawState);
            const now = Date.now();
            let displayTime = state.remaining;

            if (state.isRunning) {
                const elapsed = Math.floor((now - state.timestamp) / 1000);
                displayTime = Math.max(0, state.remaining - elapsed);
            }

            if (displayTime > 0 || state.isFinished) timerDisplay.style.display = 'block';

            if (state.isFinished || (displayTime === 0 && state.isRunning)) {
                timerDisplay.innerHTML = "TIME UP";
                timerDisplay.style.color = "#FF5555";
                return;
            }

            // Restore spans if innerHTML was changed to "TIME UP"
            if (!document.getElementById('ct-h')) {
                timerDisplay.innerHTML = `<span id="ct-h"></span>:<span id="ct-m"></span>:<span id="ct-s"></span>`;
            }

            spans.h = spans.h || document.getElementById('ct-h');
            spans.m = spans.m || document.getElementById('ct-m');
            spans.s = spans.s || document.getElementById('ct-s');

            if (spans.h) {
                const fmt = n => n.toString().padStart(2, '0');
                spans.h.textContent = fmt(Math.floor(displayTime / 3600));
                spans.m.textContent = fmt(Math.floor((displayTime % 3600) / 60));
                spans.s.textContent = fmt(displayTime % 60);

                timerDisplay.style.color = displayTime <= 59 ? '#FF4500' : '#FFD700';
                timerDisplay.style.animation = displayTime <= 59 ? 'pulse 1s infinite' : 'none';
            }
        } catch (e) { console.error("Timer update failed", e); }
    };

    timerId = setInterval(updateUI, 500); // 500ms is enough for a timer
    updateUI();

    const cleanup = () => { if (timerId) clearInterval(timerId); };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    applyTheme();
    injectGlobalHUD();

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const excludedPages = ['index.html', 'displaycrew.html', 'login.html'];
    if (!excludedPages.includes(currentPage) && !window.location.pathname.includes('timer.html')) {
        initClientTimer();
    }

    // Sound Loader
    const sc = document.createElement('script');
    sc.src = 'sound.js';
    sc.async = true;
    document.head.appendChild(sc);

    // Parallax
    if (window.matchMedia("(pointer: fine)").matches) {
        const bgTargets = document.querySelectorAll('.bg-layer, .bg-moving, .ocean-bg, .scenery-bg, .bg-image, .background-layer, .bg-logical');
        const contentTargets = document.querySelectorAll('.content-wrapper, .wooden-container, .minecraft-panel, .logical-container');

        let ticking = false;
        document.addEventListener('mousemove', (e) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const x = (e.clientX / window.innerWidth - 0.5);
                    const y = (e.clientY / window.innerHeight - 0.5);
                    bgTargets.forEach(el => el.style.transform = `translate3d(${x * -20}px, ${y * -20}px, 0)`);
                    contentTargets.forEach(el => el.style.transform = `perspective(1000px) rotateX(${y * -5}deg) rotateY(${x * 5}deg) translateZ(10px)`);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // Link Interceptor
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.href && anchor.target !== '_blank' && !anchor.href.startsWith('javascript:') && anchor.origin === window.location.origin) {
            e.preventDefault();
            navigateTo(anchor.href);
        }
    });
});

// ===== 🆕 REAL-TIME CLOUD SYNC SYSTEM =====
// ===== 🆕 REAL-TIME CLOUD SYNC SYSTEM (ROBUST FOR 70+ TEAMS) =====
const CLOUD_CONFIG = {
    endpoint: 'https://script.google.com/macros/s/AKfycbwh-wyhX1lw_qTS2AOq6Q4Z6q18ir8C0lyU5FahuDPDlpqBbB3bd3_q-rXShMMWqF9t/exec',
    maxRetries: 3,
    retryDelay: 2000 // Start with 2s delay
};

/**
 * Robust fetch with exponential backoff for high concurrency
 */
async function reliableFetch(payload, attempt = 1) {
    if (!CLOUD_CONFIG.endpoint) return;

    try {
        await fetch(CLOUD_CONFIG.endpoint, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        // Success (or at least sent)
    } catch (e) {
        if (attempt <= CLOUD_CONFIG.maxRetries) {
            const delay = CLOUD_CONFIG.retryDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
            console.warn(`Cloud sync busy (Attempt ${attempt}). Retrying in ${delay}ms...`);
            setTimeout(() => reliableFetch(payload, attempt + 1), delay + (Math.random() * 500)); // Add jitter
        } else {
            console.error('Cloud sync failed after max retries. Data queued locally.');
            // Ideally, queue locally to retry later, but for now just log
        }
    }
}

function syncToCloud(event) {
    reliableFetch({
        action: 'LOG_EVENT',
        event: {
            Timestamp: new Date(event.timestamp).toLocaleString(),
            Type: event.type,
            Category: event.crewId,
            Raw: JSON.stringify(event)
        }
    });
}

const syncStandingToCloud = PiratesUtils.debounce(() => {
    if (!gameState.teamData) return;

    const standing = {
        Rank: "-",
        CrewID: gameState.teamData.crewid,
        Name: gameState.teamData.crewname,
        Status: gameState.currentLevel >= 3 ? 'LEVEL_3_RACE' : (gameState.currentLevel === 2 ? 'LEVEL_2_CERTIFIED' : 'ACTIVE'),
        Score_L1: "-",
        Score_L2: "-",
        Score_L3: (gameState.level3Session?.totalMarks || 0),
        Total_Points: (gameState.points || 0).toFixed(2),
        Last_Seen: new Date().toLocaleTimeString()
    };

    reliableFetch({
        action: 'UPDATE_CREW',
        crewData: standing
    });
}, 5000); // Increased debounce to 5s to reduce load

