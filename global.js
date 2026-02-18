// GLOBAL GAME STATE & NAVIGATION (WORKFLOW)
const gameState = {
    teamData: null,
    currentLevel: 1,
    scanCount: 0,      // Number of scans for average calculation
    currentNode: null, // Current QR code scanned
    targetNode: null,  // Node chosen by user
    points: 0,         // Player score (Total Points)
};

function initGame() {
    const saved = localStorage.getItem('pirateState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(gameState, parsed);
        } catch (e) {
            console.error("Failed to parse game state", e);
            // Reset if corrupted
            localStorage.removeItem('pirateState');
        }
    }
}

function saveGame() {
    localStorage.setItem('pirateState', JSON.stringify(gameState));
}

// Workflow / Progression System
function navigateTo(url) {
    if (!url || typeof url !== 'string') return;

    // Support for View Transitions API (Chrome 111+)
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            window.location.href = url;
        });
    } else {
        // Fallback smooth transition - much faster
        document.body.style.transition = 'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), filter 0.4s ease';
        document.body.style.opacity = '0';
        document.body.style.filter = 'blur(5px) brightness(0.5)';

        setTimeout(() => {
            window.location.replace(url);
        }, 300);
    }
}

function navigateNext() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const level = gameState.currentLevel;

    // Updated Flow: Loader -> DisplayCrew -> Login -> Rest of the Game
    const workflows = {
        1: ['index.html', 'displaycrew.html', 'login.html', 'bountyperson.html'],
        2: ['index.html', 'displaycrew.html', 'login.html', 'qr.html', 'verification.html', 'logical.html'],
        3: ['index.html', 'displaycrew.html', 'login.html', 'qr.html', 'location.html', 'celebration.html']
    };

    const currentFlow = workflows[level];
    if (!currentFlow) {
        navigateTo('login.html');
        return;
    }

    const idx = currentFlow.indexOf(currentPage);
    if (idx !== -1 && idx < currentFlow.length - 1) {
        navigateTo(currentFlow[idx + 1]);
    } else {
        // Fallback or restart flow
        if (currentPage === 'login.html') {
            navigateTo(currentFlow[currentFlow.indexOf('login.html') + 1] || 'bountyperson.html');
        } else {
            navigateTo('login.html');
        }
    }
}

function setLevel(level) {
    gameState.currentLevel = parseInt(level);
    saveGame();
}

// Global Link Interceptor for smooth transitions
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (anchor && anchor.href && anchor.target !== '_blank' && !anchor.href.startsWith('javascript:')) {
        e.preventDefault();
        navigateTo(anchor.href);
    }
});

/**
 * Generates Minecraft-style block CSS (Background Texture + Pixel Border)
 * @param {string} colorMain - Main face color (e.g. #8B4513)
 * @param {string} colorDark - Darker texture/contrast color (e.g. #733C10)
 * @param {string} colorBorder - Darkest border/shadow color (e.g. #5A2D0C)
 * @returns {object} { backgroundImage, borderImage } CSS values
 */
function createMinecraftBlockStyle(colorMain, colorDark, colorBorder) {
    const cMain = encodeURIComponent(colorMain);
    const cDark = encodeURIComponent(colorDark);
    const cBorder = encodeURIComponent(colorBorder);

    // 1. Texture Pattern (60x60 checker-like)
    const bgSvg = `data:image/svg+xml,<svg width="60" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="60" fill="${cMain}"/><rect x="0" y="0" width="30" height="30" fill="${cDark}"/><rect x="30" y="30" width="30" height="30" fill="${cDark}"/></svg>`;

    // 2. Pixel Border (16x16 with 2px simulated width)
    const borderSvg = `data:image/svg+xml,<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" fill="${cBorder}"/><rect x="2" y="2" width="12" height="12" fill="${cMain}"/></svg>`;

    return {
        backgroundImage: `url('${bgSvg}')`,
        borderImage: `url('${borderSvg}') 6 stretch`
    };
}

function applyTheme() {
    // 1. Pirate Wood Theme (Login)
    const woodElements = document.querySelectorAll('.wooden-container');
    if (woodElements.length > 0) {
        const woodStyle = createMinecraftBlockStyle('#8B4513', '#733C10', '#5A2D0C');
        woodElements.forEach(el => {
            el.style.backgroundImage = woodStyle.backgroundImage;
            el.style.border = '8px solid transparent'; // Improved border width
            el.style.borderImage = woodStyle.borderImage;
            el.style.backgroundSize = '80px 80px';
            el.style.imageRendering = 'pixelated';
            el.style.position = 'relative';
        });
    }

    // NEW: Apply pixelated textures to decorative WOOD blocks
    const woodDecorationBlocks = document.querySelectorAll('.wood-block, .corner-block');
    woodDecorationBlocks.forEach(el => {
        const style = createMinecraftBlockStyle('#9B5523', '#8B4513', '#3D1F08');
        el.style.backgroundImage = style.backgroundImage;
        el.style.backgroundSize = '20px 20px';
        el.style.imageRendering = 'pixelated';
        el.style.border = '2px solid rgba(0,0,0,0.3)';
    });

    // NEW: Apply pixelated textures to decorative GLASS blocks
    const glassDecorationBlocks = document.querySelectorAll('.glass-block, .glass-corner');
    glassDecorationBlocks.forEach(el => {
        // High-clarity light blue/white glass
        const style = createMinecraftBlockStyle('rgba(173, 216, 230, 0.3)', 'rgba(255, 255, 255, 0.4)', '#ffffff');
        el.style.backgroundImage = style.backgroundImage;
        el.style.backgroundSize = '20px 20px';
        el.style.imageRendering = 'pixelated';
        el.style.border = '1px solid rgba(255, 255, 255, 0.5)';
        el.style.backdropFilter = 'blur(4px)';
    });

    // 2. Deepslate/Stone Theme (Loading Bar on Index)
    const loadingContainers = document.querySelectorAll('.loading-bar-container');
    if (loadingContainers.length > 0) {
        const stoneStyle = createMinecraftBlockStyle('#333333', '#222222', '#111111');
        loadingContainers.forEach(el => {
            el.style.backgroundImage = stoneStyle.backgroundImage;
            el.style.border = '4px solid transparent';
            el.style.borderImage = stoneStyle.borderImage;
            el.style.backgroundSize = '40px 40px';
        });
    }

    // 3. Wanted Poster (Paper/Parchment Style)
    const posters = document.querySelectorAll('.wanted-poster');
    if (posters.length > 0) {
        const paperStyle = createMinecraftBlockStyle('#f5f5dc', '#dfdfbf', '#3e2723');
        posters.forEach(el => {
            el.style.backgroundImage = paperStyle.backgroundImage;
            el.style.border = '8px solid transparent';
            el.style.borderImage = paperStyle.borderImage;
            el.style.backgroundSize = '60px 60px';
            el.style.imageRendering = 'pixelated';
        });
    }

    // 4. Ancient Stone Theme (for Logical Riddles/Buttons)
    const stoneContainers = document.querySelectorAll('.stone-container');
    if (stoneContainers.length > 0) {
        const stoneStyle = createMinecraftBlockStyle('#555555', '#444444', '#222222');
        stoneContainers.forEach(el => {
            el.style.backgroundImage = stoneStyle.backgroundImage;
            el.style.border = '6px solid transparent';
            el.style.borderImage = stoneStyle.borderImage;
            el.style.backgroundSize = '40px 40px';
            el.style.imageRendering = 'pixelated';
        });
    }

    // 5. Pixelated Glass Theme (for Scanner, Lenses, Overlays)
    const glassElements = document.querySelectorAll('.glass-panel, .glass-container, .lens-overlay');
    if (glassElements.length > 0) {
        // Minecraft Crystal/Stained Glass Look (Light Alpha + White Pixel Border)
        const glassStyle = createMinecraftBlockStyle('rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)', '#ffffff');
        glassElements.forEach(el => {
            el.style.backgroundImage = glassStyle.backgroundImage;
            el.style.border = '6px solid transparent';
            el.style.borderImage = glassStyle.borderImage;
            el.style.backgroundSize = '40px 40px';
            el.style.backdropFilter = 'blur(12px) brightness(1.1)';
            el.style.imageRendering = 'pixelated';
            el.style.borderRadius = '2px'; // Square blocky look for Minecraft
            el.style.position = 'relative';
        });
    }

    // 6. Ash/Basalt Theme (Dark Grey/Charcoal)
    const ashElements = document.querySelectorAll('.ash-container');
    if (ashElements.length > 0) {
        const ashStyle = createMinecraftBlockStyle('#444444', '#2C2C2C', '#1A1A1A');
        ashElements.forEach(el => {
            el.style.backgroundImage = ashStyle.backgroundImage;
            el.style.border = '6px solid transparent';
            el.style.borderImage = ashStyle.borderImage;
            el.style.backgroundSize = '40px 40px';
            el.style.imageRendering = 'pixelated';
        });
    }

    // 7. Fire/Magma Theme (Glowing Orange/Red)
    const fireElements = document.querySelectorAll('.fire-container');
    if (fireElements.length > 0) {
        const fireStyle = createMinecraftBlockStyle('#FF4500', '#8B0000', '#3E0000');
        fireElements.forEach(el => {
            el.style.backgroundImage = fireStyle.backgroundImage;
            el.style.border = '6px solid transparent';
            el.style.borderImage = fireStyle.borderImage;
            el.style.backgroundSize = '30px 30px';
            el.style.imageRendering = 'pixelated';
            el.style.boxShadow = '0 0 15px rgba(255, 69, 0, 0.4)';
        });
    }

    // 8. Emerald/Gem Theme (Vibrant Green)
    const emeraldElements = document.querySelectorAll('.emerald-container');
    if (emeraldElements.length > 0) {
        const emeraldStyle = createMinecraftBlockStyle('#00A86B', '#00703B', '#004020');
        emeraldElements.forEach(el => {
            el.style.backgroundImage = emeraldStyle.backgroundImage;
            el.style.border = '6px solid transparent';
            el.style.borderImage = emeraldStyle.borderImage;
            el.style.backgroundSize = '40px 40px';
            el.style.imageRendering = 'pixelated';
            el.style.boxShadow = '0 0 10px rgba(0, 168, 107, 0.3)';
        });
    }
}

// Global Sound Loader
(async function () {
    try {
        const sc = document.createElement('script');
        sc.src = 'sound.js';
        sc.onerror = () => console.warn('Failed to load sound.js');
        document.head.appendChild(sc);
    } catch (err) {
        console.error('Error initializing sound system:', err);
    }
})();

function showAchievement(title, desc, icon) {
    if (window.playSound) playSound('success');
    // Implementation placeholder 
}

// --- Global HUD Layout System ---
function injectGlobalHUD() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const excludedPages = ['index.html', 'displaycrew.html', 'login.html'];

    // Only inject on target internal pages
    if (excludedPages.includes(currentPage)) return;
    if (document.querySelector('.global-hud')) return;

    const hud = document.createElement('div');
    hud.className = 'global-hud';

    // Logo (Top Left)
    const logoLink = document.createElement('a');
    logoLink.href = "login.html"; // Default back to login/home
    logoLink.innerHTML = `<img src="images/logo.png" alt="Bounty Pirates" class="tv-logo">`;

    // Timer Container (Top Right - handled by initClientTimer)
    const timerSlot = document.createElement('div');
    timerSlot.id = 'hud-timer-slot';

    hud.appendChild(logoLink);
    hud.appendChild(timerSlot);
    document.body.appendChild(hud);
}

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    applyTheme();
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const excludedPages = ['index.html', 'displaycrew.html', 'login.html'];

    injectGlobalHUD();

    // Only init timer if we are NOT on excluded pages or admin timer
    if (!excludedPages.includes(currentPage) && !window.location.pathname.includes('timer.html')) {
        initClientTimer();
    }

    // --- Interactive 3D Camera Parallax (Refined) ---
    // --- Interactive 3D Camera Parallax (Refined & Optimized) ---
    // Cache targets to avoid querying DOM on every frame
    const bgTargets = document.querySelectorAll('.bg-layer, .bg-moving, .ocean-bg, .scenery-bg, .bg-image, .background-layer, .bg-logical');
    const contentTargets = document.querySelectorAll('.content-wrapper, .wooden-container, .minecraft-panel, .logical-container');

    // Only add listener if not mobile (optimization)
    if (window.matchMedia("(pointer: fine)").matches) {
        let isTicking = false;
        const moveHandler = (e) => {
            if (isTicking) return;
            isTicking = true;
            requestAnimationFrame(() => {
                const x = (e.clientX / window.innerWidth - 0.5);
                const y = (e.clientY / window.innerHeight - 0.5);

                const bgTransform = `translate3d(${x * -20}px, ${y * -20}px, 0)`; // use translate3d for GPU accel
                bgTargets.forEach(el => el.style.transform = bgTransform);

                const contentTransform = `perspective(1000px) rotateX(${y * -5}deg) rotateY(${x * 5}deg) translateZ(10px)`;
                contentTargets.forEach(el => el.style.transform = contentTransform);

                isTicking = false;
            });
        };
        document.addEventListener('mousemove', moveHandler, { passive: true });
    }
});

// --- Client Timer Sync Logic ---
function initClientTimer() {
    // strict mode check if timer element exists
    if (document.getElementById('client-timer-display')) return;

    const slot = document.getElementById('hud-timer-slot');
    const timerContainer = document.createElement('div');
    timerContainer.id = 'client-timer-display';
    timerContainer.className = 'tv-timer';
    timerContainer.style.display = 'none'; // Hidden until active
    timerContainer.innerHTML = `<span id="ct-h">00</span>:<span id="ct-m">00</span>:<span id="ct-s">00</span>`;

    if (slot) {
        slot.appendChild(timerContainer);
    } else {
        // Fallback for centered pages that might still want a timer
        timerContainer.style.cssText = `
            position: fixed;
            top: 15px;
            right: 15px;
            background: transparent;
            border: none;
            color: #FFD700;
            padding: 0;
            font-family: 'Pixelify Sans', sans-serif;
            font-size: 1.2rem;
            font-weight: bold;
            z-index: 9999;
            text-shadow: 2px 2px 0 #000;
            display: none;
            pointer-events: none;
            user-select: none;
        `;
        document.body.appendChild(timerContainer);
    }

    const spans = {
        h: document.getElementById('ct-h'),
        m: document.getElementById('ct-m'),
        s: document.getElementById('ct-s'),
        box: timerContainer
    };

    function updateClientTimer() {
        const rawState = localStorage.getItem('pirate_timer_state');
        if (!rawState) return;

        try {
            const state = JSON.parse(rawState);
            const now = Date.now();
            let displayTime = state.remaining;

            // If running, estimate current time based on drift
            if (state.isRunning) {
                const elapsed = Math.floor((now - state.timestamp) / 1000);
                displayTime = Math.max(0, state.remaining - elapsed);
            }

            // Update UI Visibility
            if (displayTime > 0 || state.isFinished) {
                spans.box.style.display = 'block';
            }

            const fmt = n => n.toString().padStart(2, '0');
            const h = Math.floor(displayTime / 3600);
            const m = Math.floor((displayTime % 3600) / 60);
            const s = displayTime % 60;

            // HANDLE STATE: FINISHED vs RUNNING
            if (state.isFinished || (displayTime === 0 && state.isRunning)) {
                if (spans.box.innerHTML !== "TIME UP") {
                    spans.box.innerHTML = "TIME UP";
                    spans.box.style.color = "#FF5555"; // Red text for Time Up is still good
                }
                return;
            }

            // If we are NOT finished, ensure the DOM structure is correct
            // (It might be currently showing "TIME UP" if we just reset)
            if (!document.getElementById('ct-h')) {
                spans.box.innerHTML = `<span id="ct-h"></span>:<span id="ct-m"></span>:<span id="ct-s"></span>`;
                // Re-bind references
                spans.h = document.getElementById('ct-h');
                spans.m = document.getElementById('ct-m');
                spans.s = document.getElementById('ct-s');
            }

            // Now safely update the text
            spans.h.textContent = fmt(h);
            spans.m.textContent = fmt(m);
            spans.s.textContent = fmt(s);

            // Urgency Logic (Red if <= 59s)
            if (displayTime <= 59) {
                spans.box.style.color = '#FF4500'; // Orange-Red warning
                spans.box.style.animation = 'pulse 1s infinite';
            } else {
                spans.box.style.color = '#FFD700'; // Gold normal
                spans.box.style.animation = 'none';
            }

        } catch (e) {
            console.error("Timer sync error", e);
        }
    }

    // Sync efficiently (250ms is enough for a ticking clock to feel live)
    const timerId = setInterval(updateClientTimer, 250);
    updateClientTimer(); // Initial call

    // Cleanup timer on unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        if (timerId) clearInterval(timerId);
    });
}
