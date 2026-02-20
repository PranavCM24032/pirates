/**
 * ULTRA-OPTIMIZED AMBIENT SCHEDULER (Worker-Side)
 * Enhanced for maximum performance and minimal CPU usage
 * Maintains 60fps on main thread while delivering smooth audio
 */

class AudioTask {
    constructor(note, duration, priority = 1, isRest = false) {
        this.note = note;
        this.duration = duration;
        this.priority = priority; // 1 = Normal, 2 = High (for accent notes)
        this.isRest = isRest;     // Silence period
    }
}

class BackgroundScheduler {
    constructor() {
        this.queue = [];
        this.isRunning = false;
        this.timer = null;
        this.currentIndex = 0;
        this.lastExecutionTime = 0;

        // Balanced Melody: low-volume, energetic, and less piercing loop
        // Minecraft-inspired Ambient Melody (C form of "Wet Hands" style / Calm 3)
        // A minor / C Major feel. Slower, more spacious.
        this.melody = [
            // Phrase 1
            new AudioTask(392.00, 2000, 1),  // G4
            new AudioTask(329.63, 2000, 1),  // E4

            // Phrase 2
            new AudioTask(261.63, 1500, 1),  // C4
            new AudioTask(293.66, 1500, 1),  // D4
            new AudioTask(196.00, 3000, 2),  // G3 (Deep root)

            // Breath
            new AudioTask(0, 1000, 1, true), // Rest

            // Phrase 3 (Resolution)
            new AudioTask(261.63, 1500, 1),  // C4
            new AudioTask(329.63, 1500, 1),  // E4
            new AudioTask(493.88, 2000, 2),  // B4 (Maj7 feel)
            new AudioTask(392.00, 3000, 1),  // G4

            // Long Rest for ambiance
            new AudioTask(0, 4000, 1, true)
        ];
    }

    /**
     * High-Performance Scheduling with Adaptive Timing
     * Uses setTimeout for reliability and battery efficiency
     */
    processNext() {
        if (!this.isRunning) return;

        const now = performance.now();
        const task = this.melody[this.currentIndex];

        // Only send message if it's not a rest
        if (!task.isRest) {
            const message = {
                type: 'play_note',
                note: task.note,
                duration: task.duration,
                priority: task.priority,
                timestamp: now,
                currentIndex: this.currentIndex
            };
            self.postMessage(message);
        } else {
            // Sync state for rest periods
            self.postMessage({
                type: 'sync_state',
                currentIndex: this.currentIndex
            });
        }

        // Advance index (Circular Queue)
        this.currentIndex = (this.currentIndex + 1) % this.melody.length;

        // Drift Correction Logic
        const expectedTime = this.lastExecutionTime + task.duration;
        const drift = now - this.lastExecutionTime; // Time unrelated to schedule, for stats

        // Calculate next delay based on *expected* time vs *now*
        // We want the NEXT note to start at: this.lastExecutionTime + task.duration
        // So we wait: (this.lastExecutionTime + task.duration) - now

        let nextDelay = (this.lastExecutionTime + task.duration) - now;

        // Safety for huge lags (if tab was backgrounded for minutes)
        if (nextDelay < 0) {
            // We are late. Catch up by playing immediately (or skip if too late? play immediate for now)
            nextDelay = 0;
            // Reset reference to avoid burst
            this.lastExecutionTime = now;
        } else {
            // Standard progression
            this.lastExecutionTime += task.duration;
        }

        // Clear any existing timer before setting new one
        if (this.timer) {
            clearTimeout(this.timer);
        }

        // Use setTimeout for better battery performance
        this.timer = setTimeout(() => this.processNext(), nextDelay);
    }

    start(startIndex = 0) {
        if (this.isRunning) return;
        this.currentIndex = startIndex % this.melody.length;
        this.isRunning = true;
        this.lastExecutionTime = performance.now();
        this.processNext();
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            currentIndex: this.currentIndex,
            uptime: this.isRunning ? performance.now() - this.lastExecutionTime : 0
        };
    }
}

// Instantiate the Optimized Engine
const SchedulerInstance = new BackgroundScheduler();

/**
 * Worker API - Optimized Multi-threaded Communication
 */
self.onmessage = function (e) {
    const { action, index } = e.data;

    switch (action) {
        case 'start':
            SchedulerInstance.start(index || 0);
            break;

        case 'stop':
            SchedulerInstance.stop();
            break;

        case 'sync':
            if (index !== undefined) {
                SchedulerInstance.currentIndex = index % SchedulerInstance.melody.length;
            }
            break;

        case 'get_status':
            self.postMessage({
                type: 'status_response',
                status: SchedulerInstance.getStatus()
            });
            break;

        case 'check_health':
            self.postMessage({
                type: 'health_check',
                status: 'optimal',
                timestamp: Date.now(),
                workerStatus: SchedulerInstance.getStatus()
            });
            break;
    }
};
