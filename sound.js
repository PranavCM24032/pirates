/**
 * MINECRAFT SOUND SYSTEM
 * Procedural UI sounds + low-volume ambient melody using Web Audio API.
 */

const SoundSystem = (() => {
    let audioCtx = null;
    let masterGain = null;
    let sfxGain = null;
    let ambientGain = null;
    let ambientStarted = false;
    let ambientTimer = null;
    let interactionsInitialized = false;
    let pointerSensitivity = 0.85;
    let lastMoveAt = 0;
    let lastX = 0;
    let lastY = 0;
    const AUTO_UI_BEEPS = false; // Keep ambient music, disable constant hover/click beeps

    const MELODY_NOTES = [329.63, 392.0, 440.0, 493.88, 440.0, 392.0, 329.63, 293.66];
    const SAFE_MIN_VOLUME = 0.0001;

    const initContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.30;
            masterGain.connect(audioCtx.destination);

            // Dedicated SFX bus so clicks/beeps stay quieter than background music.
            sfxGain = audioCtx.createGain();
            sfxGain.gain.value = 0.45;
            sfxGain.connect(masterGain);

            ambientGain = audioCtx.createGain();
            ambientGain.gain.value = 0.0;
            ambientGain.connect(masterGain);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    };

    const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

    const createTone = (frequency, type, startTime, duration, volume = 0.1, destination = sfxGain) => {
        if (!audioCtx || !destination || duration <= 0) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const safeVolume = clamp(volume, SAFE_MIN_VOLUME, 1.0);

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, startTime);

        gain.gain.setValueAtTime(safeVolume, startTime);
        gain.gain.exponentialRampToValueAtTime(SAFE_MIN_VOLUME, startTime + duration);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    const createNote = (frequency, startTime, duration, volume = 0.07, destination = sfxGain) => {
        if (!audioCtx || !destination) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, startTime);
        filter.Q.setValueAtTime(0.75, startTime);

        gain.gain.setValueAtTime(SAFE_MIN_VOLUME, startTime);
        gain.gain.exponentialRampToValueAtTime(clamp(volume, SAFE_MIN_VOLUME, 1), startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(SAFE_MIN_VOLUME, startTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
    };

    let audioWorker = null;

    const startAmbient = () => {
        initContext();
        if (ambientStarted || !audioCtx || !ambientGain) return;

        ambientStarted = true;
        const now = audioCtx.currentTime;
        ambientGain.gain.cancelScheduledValues(now);
        ambientGain.gain.setValueAtTime(0.0, now);
        ambientGain.gain.linearRampToValueAtTime(0.38, now + 0.7); // Softer fade in for calmer background music

        // Drone layer for subtle "cave/overworld" feel.
        const drone1 = audioCtx.createOscillator();
        const drone2 = audioCtx.createOscillator();
        const droneGain = audioCtx.createGain();
        const droneFilter = audioCtx.createBiquadFilter();

        drone1.type = 'sine'; // Softer than triangle
        drone2.type = 'sine';
        drone1.frequency.value = 65.41;
        drone2.frequency.value = 98.0;

        droneGain.gain.value = 0.025; // Slight boost since sine is quieter
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 320; // Lower cutoff for "murky" sound
        droneFilter.Q.value = 0.4;

        drone1.connect(droneGain);
        drone2.connect(droneGain);
        droneGain.connect(droneFilter);
        droneFilter.connect(ambientGain);

        drone1.start();
        drone2.start();

        // Use Web Worker for continuous triggers (Minecraft-style persistence)
        if (window.Worker) {
            try {
                audioWorker = new Worker('audio-worker.js');

                // Retrieve last played index for seamless cross-page continuity
                const savedIndex = parseInt(sessionStorage.getItem('ambient_melody_index') || '0');

                audioWorker.onmessage = (e) => {
                    // Sync state regardless of type if index is provided
                    if (e.data.currentIndex !== undefined) {
                        sessionStorage.setItem('ambient_melody_index', e.data.currentIndex);
                    }

                    if (e.data.type === 'play_note') {
                        if (!audioCtx) return;

                        /* 
                        // DSA Optimization REMOVED: Synchronization mismatch between Worker and Main thread timers caused all notes to drop.
                        // The worker's performance.now() starts from 0 when created, lagging behind main thread.
                        const now = performance.now();
                        if (e.data.timestamp && (now - e.data.timestamp > 150)) {
                            console.warn('Dropping stale background note to maintain website smoothness');
                            return;
                        }
                        */

                        const t = audioCtx.currentTime + 0.05;
                        const dur = e.data.duration / 1000;
                        const priority = e.data.priority || 1;

                        // Main Note Synth (Soft Sine/Triangle)
                        // MINECRAFT-STYLE PIANO SYNTH
                        // Layer 1: Sine (Fundamental - Soft)
                        const osc = audioCtx.createOscillator();
                        const g = audioCtx.createGain();
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(e.data.note, t);

                        // Layer 2: Triangle (Harmonics - "Tine" sound, lower volume)
                        const osc2 = audioCtx.createOscillator();
                        const g2 = audioCtx.createGain();
                        osc2.type = 'triangle';
                        osc2.frequency.setValueAtTime(e.data.note, t);
                        // Slight detune for analog warmth
                        osc2.detune.setValueAtTime(Math.random() * 6 - 3, t);

                        // Envelope: Percussive Attack, Long Decay (Piano-like)
                        const maxVol = priority === 2 ? 0.08 : 0.05;

                        // Main Body Envelope
                        g.gain.setValueAtTime(0, t);
                        g.gain.linearRampToValueAtTime(maxVol, t + 0.02); // Fast attack
                        g.gain.exponentialRampToValueAtTime(maxVol * 0.6, t + 0.3); // Decay to sustain level
                        g.gain.exponentialRampToValueAtTime(0.001, t + dur + 1.5); // Long release tail

                        // Harmonic Layer Envelope (fades faster)
                        g2.gain.setValueAtTime(0, t);
                        g2.gain.linearRampToValueAtTime(maxVol * 0.3, t + 0.02);
                        g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);

                        osc.connect(g);
                        osc2.connect(g2);

                        g.connect(ambientGain);
                        g2.connect(ambientGain);

                        osc.start(t);
                        osc2.start(t);

                        // Stop slightly later to allow tail to ring out
                        osc.stop(t + dur + 2.0);
                        osc2.stop(t + dur + 2.0);
                    }
                };
                audioWorker.postMessage({ action: 'start', index: savedIndex });

            } catch (err) {
                console.warn('Worker failed, fallback to interval');
                setupLegacyInterval();
            }
        } else {
            setupLegacyInterval();
        }
    };

    const setupLegacyInterval = () => {
        let i = 0;
        ambientTimer = window.setInterval(() => {
            if (!audioCtx) return;
            const t = audioCtx.currentTime + 0.02;
            const note = MELODY_NOTES[i % MELODY_NOTES.length];
            createNote(note, t, 0.9, 0.028, ambientGain);
            createNote(note * 0.5, t, 1.1, 0.014, ambientGain);
            i += 1;
        }, 1000);
    };

    const stopAmbient = () => {
        if (audioWorker) {
            audioWorker.postMessage({ action: 'stop' });
            audioWorker.terminate();
            audioWorker = null;
        }
        if (ambientTimer) {
            clearInterval(ambientTimer);
            ambientTimer = null;
        }
        if (audioCtx && ambientGain) {
            const now = audioCtx.currentTime;
            ambientGain.gain.cancelScheduledValues(now);
            ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
            ambientGain.gain.linearRampToValueAtTime(0.0, now + 0.5);
        }
        ambientStarted = false;
    };

    const sounds = {
        click: ({ intensity = 1 } = {}) => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            const vol = clamp(0.04 + (intensity * 0.06), 0.04, 0.12);
            createTone(293.66, 'square', now, 0.06, vol);
            createTone(220.0, 'triangle', now + 0.01, 0.08, vol * 0.8);
        },
        hover: ({ intensity = 1 } = {}) => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            const vol = clamp(0.015 + (intensity * 0.025), 0.012, 0.05);
            createTone(659.25, 'triangle', now, 0.045, vol);
        },
        success: () => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            createNote(392.0, now, 0.14, 0.07);
            createNote(493.88, now + 0.12, 0.14, 0.07);
            createNote(587.33, now + 0.24, 0.3, 0.08);
        },
        error: () => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            createTone(185.0, 'sawtooth', now, 0.12, 0.08);
            createTone(155.56, 'sawtooth', now + 0.1, 0.2, 0.07);
        },
        hurt: () => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            createTone(164.81, 'sawtooth', now, 0.16, 0.08);
            createTone(130.81, 'sawtooth', now + 0.05, 0.2, 0.07);
        },
        scan: () => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            createTone(783.99, 'sine', now, 0.06, 0.05);
            createTone(987.77, 'sine', now + 0.05, 0.09, 0.04);
        },
        level_up: () => {
            initContext();
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            [329.63, 392.0, 493.88, 659.25].forEach((f, i) => {
                createNote(f, now + (i * 0.12), 0.35, 0.09);
            });
        }
    };

    const play = (type, options = {}) => {
        try {
            if (!audioCtx) initContext();
            const fn = sounds[type];
            if (typeof fn === 'function') {
                fn(options);
            }
        } catch (e) {
            console.warn('Sound playback error:', e);
        }
    };

    const initInteractions = () => {
        if (interactionsInitialized) return;
        interactionsInitialized = true;

        const interactives = 'button, a, input[type="button"], input[type="submit"], .menu-btn, .choice-btn, .nav-btn, .action-btn, .otp-box, .scan-button, .pirate-submit, .mc-button';
        let lastHoverAt = 0;

        const unlockAndStart = () => {
            initContext();
            startAmbient();
        };

        const clickHandler = (e) => {
            unlockAndStart();
            const target = e.target && e.target.closest ? e.target.closest(interactives) : null;
            if (AUTO_UI_BEEPS && target) {
                play('click', { intensity: pointerSensitivity });
            }
        };

        const hoverHandler = (e) => {
            if (!AUTO_UI_BEEPS) return;
            const target = e.target && e.target.closest ? e.target.closest(interactives) : null;
            if (!target) return;
            const nowMs = Date.now();
            if (nowMs - lastHoverAt < 60) return;
            lastHoverAt = nowMs;
            play('hover', { intensity: pointerSensitivity });
        };

        const moveHandler = (e) => {
            const nowMs = Date.now();
            if (lastMoveAt) {
                const dt = Math.max(16, nowMs - lastMoveAt);
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                const speed = Math.sqrt((dx * dx) + (dy * dy)) / dt;
                pointerSensitivity = clamp((speed * 1.8), 0.4, 1.8);
            }
            lastMoveAt = nowMs;
            lastX = e.clientX;
            lastY = e.clientY;
        };

        document.addEventListener('click', clickHandler, { passive: true });
        document.addEventListener('mouseenter', hoverHandler, { passive: true, capture: true });
        document.addEventListener('mousemove', moveHandler, { passive: true });
        document.addEventListener('keydown', unlockAndStart, { passive: true });
        document.addEventListener('touchstart', unlockAndStart, { passive: true });

        window.addEventListener('beforeunload', () => {
            document.removeEventListener('click', clickHandler);
            document.removeEventListener('mouseenter', hoverHandler, true);
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('keydown', unlockAndStart);
            document.removeEventListener('touchstart', unlockAndStart);
            stopAmbient();
        });
    };

    // --- EXPORT TO WINDOW ---
    window.SoundSystem = {
        play,
        initInteractions,
        startAmbient,
        stopAmbient
    };

    return window.SoundSystem;
})();

// --- AUTO-RESUME SYSTEM ---
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.SoundSystem && window.SoundSystem.initInteractions) {
                window.SoundSystem.initInteractions();
                // Attempt auto-start if browser allows (already interacted on previous page)
                setTimeout(() => {
                    window.SoundSystem.startAmbient();
                }, 500);
            }
        });
    } else if (window.SoundSystem && window.SoundSystem.initInteractions) {
        window.SoundSystem.initInteractions();
        setTimeout(() => {
            window.SoundSystem.startAmbient();
        }, 500);
    }
} catch (err) {
    console.warn('Failed to initialize sound interactions:', err);
}


window.playSound = (type, options) => {
    try {
        if (window.SoundSystem && window.SoundSystem.play) {
            window.SoundSystem.play(type, options || {});
        }
    } catch (err) {
        console.warn('Error playing sound:', err);
    }
};
