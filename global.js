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
        if (!str || typeof str !== 'string') return fallback;
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
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * Lightweight async defer that avoids blocking first paint.
     */
    defer: (cb, timeout = 1) => {
        if (typeof window.requestIdleCallback === 'function') {
            return window.requestIdleCallback(cb, { timeout });
        }
        return setTimeout(cb, timeout);
    }
};

// Aliases for backward compatibility
window.escapeHTML = PiratesUtils.escapeHTML;
window.safeJSONParse = PiratesUtils.safeJSONParse;

const DATA_CACHE_PREFIX = 'pirate_json_cache_v1:';
const inMemoryDataCache = new Map();
const inFlightJSONRefresh = new Map();
const PREFETCHED_URLS = new Set();
let hasAttachedSmartPrefetch = false;

function isNetworkConstrained() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const et = String(conn.effectiveType || '').toLowerCase();
    return et.includes('2g') || et === 'slow-2g';
}

function buildCacheKey(url) {
    return `${DATA_CACHE_PREFIX}${url}`;
}

function getCachedRecord(url) {
    const key = buildCacheKey(url);
    const mem = inMemoryDataCache.get(key);
    if (mem && mem.data !== undefined) return mem;

    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = window.safeJSONParse(raw, null);
    if (!parsed || typeof parsed !== 'object') return null;
    inMemoryDataCache.set(key, parsed);
    return parsed;
}

function setCachedRecord(url, data) {
    const record = { ts: Date.now(), data };
    const key = buildCacheKey(url);
    inMemoryDataCache.set(key, record);
    try {
        localStorage.setItem(key, JSON.stringify(record));
    } catch (e) {
        // Ignore storage quota errors and continue with memory cache.
    }
}

async function refreshJSONCache(url) {
    const inflight = inFlightJSONRefresh.get(url);
    if (inflight) return inflight;

    const req = fetch(url, { cache: 'force-cache' })
        .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setCachedRecord(url, data);
            return data;
        })
        .finally(() => {
            inFlightJSONRefresh.delete(url);
        });

    inFlightJSONRefresh.set(url, req);
    return req;
}

window.fetchJSONCached = async function (url, opts = {}) {
    const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : 5 * 60 * 1000;
    const forceRefresh = !!opts.forceRefresh;
    const cached = getCachedRecord(url);
    const now = Date.now();
    const isFresh = !!(cached && (now - cached.ts) <= ttlMs);

    // Serve cached data immediately for responsiveness, refresh in background if stale.
    if (!forceRefresh && cached) {
        if (!isFresh) {
            PiratesUtils.defer(() => {
                refreshJSONCache(url).catch(() => { /* keep stale cache */ });
            }, 50);
        }
        return cached.data;
    }

    try {
        return await refreshJSONCache(url);
    } catch (err) {
        if (cached && cached.data !== undefined) return cached.data;
        throw err;
    }
};

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    const scopeBase = window.BASE_PATH || '/';
    const swUrl = `${scopeBase}sw.js`;
    navigator.serviceWorker.register(swUrl, { scope: scopeBase }).catch((e) => {
        console.warn('SW registration failed:', e);
    });
}

function prefetchUrl(url) {
    if (isNetworkConstrained() || (typeof navigator.onLine === 'boolean' && !navigator.onLine)) return;
    if (!url || PREFETCHED_URLS.has(url)) return;
    PREFETCHED_URLS.add(url);

    try {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        link.as = url.endsWith('.json') ? 'fetch' : 'document';
        document.head.appendChild(link);
    } catch (e) {
        // Ignore prefetch link issues and fallback to fetch warm-up below.
    }

    fetch(url, { cache: 'force-cache', credentials: 'same-origin' }).catch(() => { /* warm-up only */ });
}

function prefetchLikelyNextResources() {
    if (document.hidden) return;
    const currentPage = getCurrentPage();
    const nextByPage = {
        'index.html': ['displaycrew.html', 'crew.json', 'images/display.jpeg'],
        'displaycrew.html': ['login.html', 'crew.json', 'images/login.jpeg'],
        'login.html': ['qr.html', 'location.html', 'crew.json', 'graph.json', 'logical.json', 'meme.json'],
        'qr.html': ['verification.html', 'location.html', 'meme.html', 'logical.html', 'meme.json', 'logical.json', 'graph.json'],
        'verification.html': ['meme.html', 'logical.html', 'meme.json', 'logical.json'],
        'logical.html': ['qr.html', 'logical.json'],
        'location.html': ['celebration.html', 'graph.json']
    };

    const targets = nextByPage[currentPage] || [];
    targets.forEach(prefetchUrl);
}

function attachSmartLinkPrefetch() {
    if (hasAttachedSmartPrefetch) return;
    hasAttachedSmartPrefetch = true;

    const handler = (event) => {
        if (isNetworkConstrained()) return;
        const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        if (anchor.target === '_blank') return;
        if (anchor.origin !== window.location.origin) return;
        prefetchUrl(anchor.href);
    };

    document.addEventListener('mouseover', handler, { passive: true });
    document.addEventListener('touchstart', handler, { passive: true });
}

// GLOBAL GAME STATE
const gameState = {
    teamData: null,
    currentLevel: 1,
    scanCount: 0,
    currentNode: null,
    targetNode: null,
    points: 0,
    level3Session: null,
    journey: [],
    jumps: []
};

window.gameState = gameState; // Export to window

const BASE_STATE_KEY = 'pirateState';
const CREW_STATE_PREFIX = 'pirateState:crew:';

function getCrewIdFromState(stateObj = gameState) {
    const team = stateObj && stateObj.teamData ? stateObj.teamData : null;
    const raw = team ? (team.crewid || team.crewID || team.id) : '';
    return String(raw || '').trim();
}

function getCrewStateKey(crewId) {
    const clean = String(crewId || '').trim();
    return clean ? `${CREW_STATE_PREFIX}${clean}` : '';
}

const CLIENT_META_KEYS = {
    deviceId: 'pirate_device_id',
    sessionId: 'pirate_session_id'
};

function getOrCreateClientMeta() {
    let deviceId = localStorage.getItem(CLIENT_META_KEYS.deviceId);
    if (!deviceId) {
        deviceId = `DV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
        localStorage.setItem(CLIENT_META_KEYS.deviceId, deviceId);
    }

    let sessionId = sessionStorage.getItem(CLIENT_META_KEYS.sessionId);
    if (!sessionId) {
        sessionId = `SS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
        sessionStorage.setItem(CLIENT_META_KEYS.sessionId, sessionId);
    }

    return { deviceId, sessionId };
}

const clientMeta = getOrCreateClientMeta();
window.PiratesClientMeta = clientMeta;

/**
 * Initializes game state from localStorage
 */
function initGame() {
    const saved = localStorage.getItem(BASE_STATE_KEY);
    if (saved) {
        const parsed = window.safeJSONParse(saved);
        if (parsed && typeof parsed === 'object') {
            Object.assign(gameState, {
                teamData: parsed.teamData || null,
                currentLevel: parseInt(parsed.currentLevel, 10) || 1,
                scanCount: parseInt(parsed.scanCount, 10) || 0,
                currentNode: parsed.currentNode || null,
                targetNode: parsed.targetNode || null,
                points: parseInt(parsed.points, 10) || 0,
                level3Session: parsed.level3Session || null,
                journey: parsed.journey || [],
                jumps: parsed.jumps || []
            });
        }
    }

    // Prefer crew-scoped state once identity is available.
    const crewId = getCrewIdFromState(gameState);
    if (!crewId) return;
    const crewKey = getCrewStateKey(crewId);
    if (!crewKey) return;

    const crewSaved = localStorage.getItem(crewKey);
    if (!crewSaved) return;
    const crewParsed = window.safeJSONParse(crewSaved);
    if (!crewParsed || typeof crewParsed !== 'object') return;

    Object.assign(gameState, {
        teamData: crewParsed.teamData || gameState.teamData || null,
        currentLevel: parseInt(crewParsed.currentLevel, 10) || gameState.currentLevel || 1,
        scanCount: parseInt(crewParsed.scanCount, 10) || 0,
        currentNode: crewParsed.currentNode || null,
        targetNode: crewParsed.targetNode || null,
        points: parseInt(crewParsed.points, 10) || 0,
        level3Session: crewParsed.level3Session || null,
        journey: Array.isArray(crewParsed.journey) ? crewParsed.journey : [],
        jumps: Array.isArray(crewParsed.jumps) ? crewParsed.jumps : []
    });
}

/**
 * Saves current game state to localStorage
 */
function saveGame() {
    try {
        const crewId = getCrewIdFromState(gameState);
        const crewKey = getCrewStateKey(crewId);

        localStorage.setItem(BASE_STATE_KEY, JSON.stringify({
            teamData: gameState.teamData || null,
            currentLevel: parseInt(gameState.currentLevel, 10) || 1
        }));

        if (crewKey) {
            localStorage.setItem(crewKey, JSON.stringify(gameState));
        } else {
            localStorage.setItem(BASE_STATE_KEY, JSON.stringify(gameState));
        }
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
            // Push latest L3 standing immediately (debounced downstream)
            syncStandingToCloud();
            return true;
        }
        return false;
    } catch (e) {
        console.error("Failed to update Level 3 session:", e);
        return false;
    }
};

window.completeLevel3Session = function () {
    if (!gameState.level3Session || gameState.level3Session.completed) return false;
    gameState.level3Session.completed = true;
    gameState.level3Session.completedAt = Date.now();
    saveLevel3Session();
    return true;
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
            deviceId: clientMeta.deviceId,
            sessionId: clientMeta.sessionId,
            page: (window.location.pathname.split('/').pop() || 'unknown').slice(0, 60),
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
        document.body.style.transition = 'opacity 0.12s ease, filter 0.12s ease';
        document.body.style.opacity = '0';
        document.body.style.filter = 'blur(3px)';
        setTimeout(() => window.location.href = url, 120);
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
    const themeGroups = [
        {
            selectors: '.wooden-container',
            colors: { main: '#8B4513', dark: '#733C10', border: '#5A2D0C' },
            config: { size: '80px 80px', borderWidth: '8px' }
        },
        {
            selectors: '.wood-block, .corner-block',
            colors: { main: '#9B5523', dark: '#8B4513', border: '#3D1F08' },
            config: { size: '20px 20px', borderWidth: '2px' }
        },
        {
            selectors: '.glass-block, .glass-corner',
            colors: { main: 'rgba(173, 216, 230, 0.3)', dark: 'rgba(255, 255, 255, 0.4)', border: '#ffffff' },
            config: { size: '20px 20px', borderWidth: '1px', backdropFilter: 'blur(4px)' }
        },
        {
            selectors: '.loading-bar-container',
            colors: { main: '#333333', dark: '#222222', border: '#111111' },
            config: { size: '40px 40px', borderWidth: '4px' }
        },
        {
            selectors: '.wanted-poster',
            colors: { main: '#f5f5dc', dark: '#dfdfbf', border: '#3e2723' },
            config: { size: '60px 60px', borderWidth: '8px' }
        },
        {
            selectors: '.stone-container',
            colors: { main: '#555555', dark: '#444444', border: '#222222' },
            config: { size: '40px 40px', borderWidth: '6px' }
        },
        {
            selectors: '.glass-panel, .glass-container, .lens-overlay',
            colors: { main: 'rgba(255, 255, 255, 0.1)', dark: 'rgba(255, 255, 255, 0.05)', border: '#ffffff' },
            config: { size: '40px 40px', borderWidth: '6px', backdropFilter: 'blur(12px) brightness(1.1)' }
        },
        {
            selectors: '.ash-container',
            colors: { main: '#444444', dark: '#2C2C2C', border: '#1A1A1A' },
            config: { size: '40px 40px', borderWidth: '6px' }
        },
        {
            selectors: '.fire-container',
            colors: { main: '#FF4500', dark: '#8B0000', border: '#3E0000' },
            config: { size: '30px 30px', borderWidth: '6px', boxShadow: '0 0 15px rgba(255, 69, 0, 0.4)' }
        },
        {
            selectors: '.emerald-container',
            colors: { main: '#00A86B', dark: '#00703B', border: '#004020' },
            config: { size: '40px 40px', borderWidth: '6px', boxShadow: '0 0 10px rgba(0, 168, 107, 0.3)' }
        }
    ];

    themeGroups.forEach(({ selectors, colors, config }) => {
        const elements = document.querySelectorAll(selectors);
        if (elements.length === 0) return;

        const isGlass = selectors.includes('glass');
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

            if (isGlass) {
                s.borderRadius = '2px';
                s.position = 'relative';
            }
        });
    });
}

const EXCLUDED_HUD_PAGES = new Set(['index.html', 'admin.html', 'timer.html', 'meme.html']);
const getCurrentPage = () => window.location.pathname.split('/').pop() || 'index.html';

// Global HUD
function injectGlobalHUD() {
    const currentPage = getCurrentPage();
    if (EXCLUDED_HUD_PAGES.has(currentPage) || document.querySelector('.global-hud')) return;

    const crewId = gameState.teamData ? (gameState.teamData.crewid || gameState.teamData.id) : null;
    const crewHtml = crewId ? `<div class="crew-hud-id">ID: ${crewId}</div>` : '';

    const hud = document.createElement('div');
    hud.className = 'global-hud';
    hud.innerHTML = `
        <div class="hud-left">
            <a href="login.html"><img src="images/logo.png" alt="Bounty Pirates" class="tv-logo"></a>
        </div>
        <div class="hud-middle">
            ${crewHtml}
        </div>
        <div id="hud-timer-slot" class="hud-right"></div>
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
    const fmt = n => n.toString().padStart(2, '0');
    let timerId = null;
    let cloudPollId = null;
    let lastDisplayTime = null;
    let lastMode = '';
    let cloudState = null;
    let cloudInFlight = false;

    function getTimerCloudEndpoint() {
        try {
            const configured = (localStorage.getItem('google_sheet_url') || '').trim();
            if (configured) return configured;
        } catch (e) { }
        return CLOUD_CONFIG.endpoint;
    }

    function asTimerState(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const state = {
            remaining: Math.max(0, Number(raw.remaining) || 0),
            isRunning: !!raw.isRunning,
            isFinished: !!raw.isFinished,
            timestamp: Number(raw.timestamp) || 0,
            remoteTimestamp: Number(raw.remoteTimestamp) || 0 // Added to track server-side freshness
        };
        if (!state.timestamp) return null;
        return state;
    }

    function getBestTimerState(localState, remoteState) {
        if (localState && remoteState) return (localState.timestamp >= remoteState.timestamp) ? localState : remoteState;
        return localState || remoteState || null;
    }

    async function pollCloudTimerState() {
        if (cloudInFlight) return;
        cloudInFlight = true;
        try {
            const response = await fetch(getTimerCloudEndpoint(), {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store'
            });
            if (!response.ok) return;
            const payload = await response.json();
            const remote = asTimerState(payload && payload.timerState);
            const serverNow = Number(payload.serverNow) || (payload.timestamp ? new Date(payload.timestamp).getTime() : 0);

            if (!remote || !serverNow) return;
            cloudState = remote;

            // DRIFT COMPENSATION:
            // Instead of just storing remote, we convert it to a local snapshot.
            // This ensures all users see the same 'remaining' time regardless of their own system clock.
            const elapsedSinceCapture = Math.floor((serverNow - remote.timestamp) / 1000);
            const correctedRemaining = Math.max(0, remote.remaining - (remote.isRunning ? elapsedSinceCapture : 0));

            const localSnapshot = {
                ...remote,
                remaining: correctedRemaining,
                timestamp: Date.now() // Use CURRENT client time for the new snapshot
            };

            const local = asTimerState(window.safeJSONParse(localStorage.getItem('pirate_timer_state'), null));
            // Only update if it's a newer state from the cloud than what we have locally
            if (!local || remote.timestamp > (local.remoteTimestamp || 0)) {
                // We store the original server timestamp as remoteTimestamp to track 'freshness'
                localSnapshot.remoteTimestamp = remote.timestamp;
                localStorage.setItem('pirate_timer_state', JSON.stringify(localSnapshot));
            }
        } catch (e) {
            // Keep local timer active when cloud fetch fails.
        } finally {
            cloudInFlight = false;
        }
    }

    const updateUI = () => {
        const rawState = localStorage.getItem('pirate_timer_state');
        const localState = asTimerState(window.safeJSONParse(rawState, null));
        const state = getBestTimerState(localState, cloudState);
        if (!state) return;

        try {
            const now = Date.now();
            let displayTime = state.remaining;

            if (state.isRunning) {
                const elapsed = Math.floor((now - state.timestamp) / 1000);
                displayTime = Math.max(0, state.remaining - elapsed);
            }

            if (displayTime > 0 || state.isFinished) timerDisplay.style.display = 'block';

            if (state.isFinished || (displayTime === 0 && state.isRunning)) {
                if (lastMode !== 'TIME_UP') {
                    timerDisplay.innerHTML = "TIME UP";
                    timerDisplay.style.color = "#FF5555";
                    timerDisplay.style.animation = 'none';
                    lastMode = 'TIME_UP';
                }
                return;
            }

            // Restore spans if innerHTML was changed to "TIME UP"
            if (!document.getElementById('ct-h')) {
                timerDisplay.innerHTML = `<span id="ct-h"></span>:<span id="ct-m"></span>:<span id="ct-s"></span>`;
                spans.h = null;
                spans.m = null;
                spans.s = null;
            }

            spans.h = spans.h || document.getElementById('ct-h');
            spans.m = spans.m || document.getElementById('ct-m');
            spans.s = spans.s || document.getElementById('ct-s');

            if (spans.h && displayTime !== lastDisplayTime) {
                spans.h.textContent = fmt(Math.floor(displayTime / 3600));
                spans.m.textContent = fmt(Math.floor((displayTime % 3600) / 60));
                spans.s.textContent = fmt(displayTime % 60);
                lastDisplayTime = displayTime;
            }

            const nextMode = displayTime <= 59 ? 'DANGER' : 'NORMAL';
            if (nextMode !== lastMode) {
                timerDisplay.style.color = displayTime <= 59 ? '#FF4500' : '#FFD700';
                timerDisplay.style.animation = displayTime <= 59 ? 'pulse 1s infinite' : 'none';
                lastMode = nextMode;
            }
        } catch (e) { console.error("Timer update failed", e); }
    };

    timerId = setInterval(updateUI, 500);
    cloudPollId = setInterval(pollCloudTimerState, 1500); // Faster polling for better sync
    pollCloudTimerState();
    updateUI();

    // Listen for storage changes from other tabs to sync immediately
    window.addEventListener('storage', (e) => {
        if (e.key === 'pirate_timer_state') {
            updateUI();
        }
    });

    const cleanup = () => {
        if (timerId) clearInterval(timerId);
        if (cloudPollId) clearInterval(cloudPollId);
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    injectGlobalHUD();
    PiratesUtils.defer(() => applyTheme(), 60);

    const currentPage = getCurrentPage();
    if (gameState.teamData && currentPage !== 'admin.html') {
        syncStandingToCloud();
        startPresenceHeartbeat();
    }

    if (!EXCLUDED_HUD_PAGES.has(currentPage) && !window.location.pathname.includes('timer.html')) {
        initClientTimer();
    }

    // Sound Loader (deferred to reduce first paint blocking on low-end devices)
    setTimeout(() => {
        const sc = document.createElement('script');
        sc.src = 'sound.js';
        sc.async = true;
        document.head.appendChild(sc);
    }, 180);

    // Enable static caching on GitHub Pages / HTTPS contexts.
    setTimeout(registerServiceWorker, 250);
    setTimeout(() => {
        prefetchLikelyNextResources();
        attachSmartLinkPrefetch();
    }, 320);

    // Parallax
    const allowParallax = window.matchMedia("(pointer: fine)").matches &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        !isNetworkConstrained() &&
        window.innerWidth >= 900;

    if (allowParallax) {
        const bgTargets = document.querySelectorAll('.bg-layer, .bg-moving, .ocean-bg, .scenery-bg, .bg-image, .background-layer, .bg-logical');
        const contentTargets = document.querySelectorAll('.content-wrapper, .wooden-container, .minecraft-panel, .logical-container');
        const hasParallaxTargets = bgTargets.length > 0 || contentTargets.length > 0;

        let ticking = false;
        if (hasParallaxTargets) {
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
    endpoint: 'https://script.google.com/macros/s/AKfycbyNvbI4OHpyb6cd2hIURICcCeAWdjZEGJvqia4cRYd4FbImW2dNtJgVhKKan7vh_ca2/exec',
    maxRetries: 3,
    retryDelay: 2000, // Start with 2s delay
    logFlushInterval: 4000,
    maxBatchSize: 50,
    maxQueuedLogs: 500
};

const CLOUD_EVENT_QUEUE_KEY = 'pirateCloudEventQueue';
let cloudFlushTimer = null;
let cloudFlushInFlight = false;
let lastStandingSignature = '';
let lastStandingSentAt = 0;
let heartbeatTimer = null;

function getCloudEndpoint() {
    try {
        const configured = (localStorage.getItem('google_sheet_url') || '').trim();
        return configured || CLOUD_CONFIG.endpoint;
    } catch (e) {
        return CLOUD_CONFIG.endpoint;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robust fetch with exponential backoff for high concurrency
 */
async function reliableFetch(payload, attempt = 1) {
    const endpoint = getCloudEndpoint();
    if (!endpoint) return;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const resultText = (await response.text() || '').trim();
        if (/server busy|unknown action|^error[:\s]/i.test(resultText)) {
            throw new Error(resultText || 'Cloud rejected request');
        }
        return true;
    } catch (e) {
        if (attempt <= CLOUD_CONFIG.maxRetries) {
            const delay = CLOUD_CONFIG.retryDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
            console.warn(`Cloud sync busy (Attempt ${attempt}). Retrying in ${delay}ms...`);
            await sleep(delay + (Math.random() * 500)); // Add jitter
            return reliableFetch(payload, attempt + 1);
        } else {
            console.error('Cloud sync failed after max retries. Data queued locally.');
            return false;
        }
    }
}

function getQueuedCloudEvents() {
    const queue = window.safeJSONParse(localStorage.getItem(CLOUD_EVENT_QUEUE_KEY), []);
    return Array.isArray(queue) ? queue : [];
}

function setQueuedCloudEvents(events) {
    localStorage.setItem(CLOUD_EVENT_QUEUE_KEY, JSON.stringify(events));
}

function enqueueCloudEvent(event) {
    const queue = getQueuedCloudEvents();
    queue.push(event);
    if (queue.length > CLOUD_CONFIG.maxQueuedLogs) {
        queue.splice(0, queue.length - CLOUD_CONFIG.maxQueuedLogs);
    }
    setQueuedCloudEvents(queue);
}

function scheduleCloudFlush(force = false) {
    if (force) {
        flushCloudEventQueue();
        return;
    }
    if (cloudFlushTimer || cloudFlushInFlight) return;
    cloudFlushTimer = setTimeout(() => {
        cloudFlushTimer = null;
        flushCloudEventQueue();
    }, CLOUD_CONFIG.logFlushInterval);
}

async function flushCloudEventQueue() {
    if (cloudFlushInFlight) return;
    const queue = getQueuedCloudEvents();
    if (queue.length === 0) return;

    cloudFlushInFlight = true;
    try {
        const batch = queue.slice(0, CLOUD_CONFIG.maxBatchSize).map(event => ({
            Timestamp: new Date(event.timestamp).toLocaleString(),
            Type: event.type,
            Category: event.crewId,
            Device_ID: event.deviceId || clientMeta.deviceId,
            Session_ID: event.sessionId || clientMeta.sessionId,
            Page: event.page || (window.location.pathname.split('/').pop() || 'unknown'),
            Raw: JSON.stringify(event)
        }));

        const ok = await reliableFetch({
            action: 'BATCH_EVENTS',
            events: batch
        });

        if (ok) {
            const remaining = getQueuedCloudEvents().slice(batch.length);
            setQueuedCloudEvents(remaining);
        }
    } finally {
        cloudFlushInFlight = false;
        if (getQueuedCloudEvents().length > 0) {
            scheduleCloudFlush();
        }
    }
}

function syncToCloud(event) {
    enqueueCloudEvent(event);
    scheduleCloudFlush();
}

function startPresenceHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        if (!gameState.teamData) return;
        logGameEvent('HEARTBEAT', { page: window.location.pathname.split('/').pop() || 'unknown' });
        syncStandingToCloud();
    }, 25000);
}

const syncStandingToCloud = PiratesUtils.debounce(() => {
    if (!gameState.teamData) return;

    // Gather L1 data from localStorage
    let l1Timestamp = '-';
    try {
        const l1Data = window.safeJSONParse(localStorage.getItem('pirateLevel1Data'), {});
        const crewId = gameState.teamData.crewid;
        if (l1Data && l1Data[crewId]) l1Timestamp = l1Data[crewId];
    } catch (e) { /* ignore */ }

    // Gather L2 data from logs
    let l2Status = '-';
    try {
        const logs = window.safeJSONParse(localStorage.getItem('pirateAdminLogs'), []);
        const crewId = gameState.teamData.crewid || gameState.teamData.id;
        if (Array.isArray(logs)) {
            const hasSuccess = logs.some(l => l.crewId === crewId && l.type === 'VERIFY' && l.action === 'SUCCESS');
            if (hasSuccess) l2Status = 'COMPLETE';
        }
    } catch (e) { /* ignore */ }

    // Gather L3 session data
    const session = gameState.level3Session || {};
    let pathTrace = session.pathTrace || '-';

    // Fallback if session path is missing but journey exists
    if (pathTrace === '-' && Array.isArray(gameState.journey) && gameState.journey.length > 0) {
        pathTrace = gameState.journey[0];
        const jumps = Array.isArray(gameState.jumps) ? gameState.jumps : [];
        for (let i = 1; i < gameState.journey.length; i++) {
            const wasJump = jumps[i - 1] === true;
            pathTrace += (wasJump ? ',' : '-') + gameState.journey[i];
        }
    }

    const scanCount = session.scanCount || (gameState.journey ? gameState.journey.length : 0);
    const lastScanNode = session.lastScanNode || gameState.currentNode || 'START';
    const lastScanTime = session.lastScanTime ? new Date(session.lastScanTime).toLocaleTimeString() : new Date().toLocaleTimeString();

    const standing = {
        Rank: "-",
        CrewID: gameState.teamData.crewid,
        Name: gameState.teamData.crewname,
        Device_ID: clientMeta.deviceId,
        Session_ID: clientMeta.sessionId,
        Status: gameState.currentLevel >= 3 ? 'LEVEL_3_RACE' : (gameState.currentLevel === 2 ? 'LEVEL_2_CERTIFIED' : 'ACTIVE'),
        Score_L1: l1Timestamp,
        Score_L2: l2Status,
        Score_L3: (session.totalMarks || 0),
        Internal_Marks: (session.totalMarks || 0),
        Total_Points: (gameState.points || 0).toFixed(2),
        Last_Seen: new Date().toLocaleTimeString(),
        Last_Scan: lastScanNode,
        Last_Scan_Time: lastScanTime,
        Path_Trace: pathTrace,
        Scan_Count: scanCount,
        Journey: gameState.journey ? gameState.journey.join(',') : '-'
    };

    const signature = JSON.stringify(standing);
    const now = Date.now();
    if (signature === lastStandingSignature && (now - lastStandingSentAt) < 15000) return;

    lastStandingSignature = signature;
    lastStandingSentAt = now;

    reliableFetch({
        action: 'UPDATE_CREW',
        crewData: standing
    });
}, 5000); // Increased debounce to 5s to reduce load

window.addEventListener('pagehide', () => {
    scheduleCloudFlush(true);
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && gameState.teamData) {
        syncStandingToCloud();
        scheduleCloudFlush(true);
    }
});
