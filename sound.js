/**
 * PIRATES QUEST - ADVANCED PROCEDURAL AUDIO SYSTEM
 * Optimized for performance and Minecraft-like aesthetic.
 */

const SoundEngine = (() => {
    let audioCtx = null;
    let masterGain = null;
    let sfxGain = null;
    let ambientGain = null;
    let ambientStarted = false;
    let ambientTimer = null;
    let interactionsInitialized = false;

    const config = {
        masterVol: 0.35,
        sfxVol: 0.5,
        ambientVol: 0.1,
        pointerSensitivity: 0.85,
        autoBeeps: true
    };

    let lastState = { at: 0, x: 0, y: 0 };

    /**
     * Lazy Context Initialization
     */
    const init = async () => {
        if (audioCtx) {
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            return;
        }

        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });

            masterGain = audioCtx.createGain();
            masterGain.gain.value = config.masterVol;
            masterGain.connect(audioCtx.destination);

            sfxGain = audioCtx.createGain();
            sfxGain.gain.value = config.sfxVol;
            sfxGain.connect(masterGain);

            ambientGain = audioCtx.createGain();
            ambientGain.gain.value = config.ambientVol;
            ambientGain.connect(masterGain);

            setupInteractions();
            console.log('Audio Context Ready');
        } catch (e) {
            console.error('Audio initialization failed:', e);
        }
    };

    /**
     * Procedural Synthesis Utilities
     */
    const createTone = (freq, type, dur, vol, dest = sfxGain, decay = true) => {
        if (!audioCtx || audioCtx.state === 'suspended') return;

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(vol, now);
        if (decay) gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain).connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.1);
    };

    const createNoise = (dur, freq = 1200) => {
        if (!audioCtx) return null;
        const bufferSize = audioCtx.sampleRate * dur;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = freq;

        const gain = audioCtx.createGain();
        source.connect(filter).connect(gain).connect(sfxGain);

        return { source, gain };
    };

    /**
     * Sound Library
     */
    const library = {
        click: () => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1000 + Math.random() * 50, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            osc.connect(gain).connect(sfxGain);
            osc.start(now);
            osc.stop(now + 0.06);
        },
        hover: () => createTone(659.25, 'triangle', 0.05, 0.04),
        success: () => {
            const now = audioCtx.currentTime;
            [392.00, 493.88, 587.33].forEach((f, i) => {
                setTimeout(() => createTone(f, 'triangle', 0.15, 0.1, sfxGain, false), i * 120);
            });
        },
        error: () => {
            createTone(185, 'sawtooth', 0.15, 0.15);
            setTimeout(() => createTone(155, 'sawtooth', 0.25, 0.12), 100);
        },
        level_up: () => {
            [329, 392, 493, 659, 987].forEach((f, i) => {
                setTimeout(() => createTone(f, 'sine', 0.4, 0.1 - (i * 0.01)), i * 120);
            });
        },
        creeper: () => {
            const n = createNoise(1.5, 1500);
            if (!n) return;
            const now = audioCtx.currentTime;
            n.gain.gain.setValueAtTime(0, now);
            n.gain.gain.linearRampToValueAtTime(0.8, now + 1.2);
            n.gain.gain.linearRampToValueAtTime(0, now + 1.5);
            n.source.start(now);
        },
        entry: () => {
            createTone(40, 'sine', 1.0, 0.6);
            createTone(80, 'sawtooth', 0.4, 0.3);
            const n = createNoise(1.2, 800);
            if (n) {
                n.gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
                n.gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
                n.source.start(audioCtx.currentTime);
            }
        },
        orb: () => createTone(1200 + Math.random() * 800, 'sine', 0.15, 0.08)
    };

    /**
     * Interaction Handlers
     */
    const setupInteractions = () => {
        if (interactionsInitialized) return;
        interactionsInitialized = true;

        const triggerUI = (e) => {
            const target = e.target.closest('button, a, select, input, .clickable, .pirate-submit');
            if (target && config.autoBeeps) {
                library.click();
            }
        };

        const triggerHover = (e) => {
            const target = e.target.closest('button, a, select, input, .clickable');
            if (target && config.autoBeeps) {
                const now = Date.now();
                if (now - lastState.at > 60) {
                    library.hover();
                    lastState.at = now;
                }
            }
        };

        document.addEventListener('click', triggerUI, { passive: true });
        document.addEventListener('mouseover', triggerHover, { passive: true });

        // Auto-resume on any user gesture
        ['mousedown', 'keydown', 'touchstart'].forEach(type => {
            document.addEventListener(type, () => init(), { once: true, passive: true });
        });
    };

    /**
     * Ambient Logic
     */
    const startAmbient = () => {
        if (ambientStarted) return;
        // User request: ambient music deactivated for now, but infrastructure kept
        // ambientStarted = true;
    };

    return {
        init,
        play: (type) => {
            if (!audioCtx) init();
            if (library[type]) library[type]();
            else if (type === 'beep') library.click();
        },
        startAmbient,
        stopAmbient: () => { ambientStarted = false; }
    };
})();

// Global Aliases
window.playSound = SoundEngine.play;
window.SoundSystem = SoundEngine;

// Run Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SoundEngine.init());
} else {
    SoundEngine.init();
}
