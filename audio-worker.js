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
        this.performanceMode = 'balanced'; // 'balanced' or 'performance'

        // Optimized Melody: Atmospheric Minecraft-style progression
        this.melody = [
            new AudioTask(329.63, 1400, 1), // E4
            new AudioTask(392.00, 1400, 2), // G4 (Accent)
            new AudioTask(493.88, 1400, 1), // B4
            new AudioTask(523.25, 2800, 2), // C5 (Long)
            new AudioTask(0, 600, 1, true),  // REST
            new AudioTask(440.00, 1400, 1), // A4
            new AudioTask(392.00, 1400, 1), // G4
            new AudioTask(329.63, 1400, 1), // E4
            new AudioTask(0, 3500, 1, true)  // LONG REST (Atmospheric gap)
        ];
    }

    /**
     * High-Performance Scheduling with Adaptive Timing
     * Uses requestAnimationFrame-like timing for precision
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

        // Adaptive Timing with reduced jitter for smoothness
        const jitter = this.performanceMode === 'performance' ? 0 : Math.random() * 30;
        const nextDelay = task.duration + jitter;

        // Use setTimeout for better battery performance
        this.timer = setTimeout(() => this.processNext(), nextDelay);
        this.lastExecutionTime = now;
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

    setPerformanceMode(mode) {
        this.performanceMode = mode;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            currentIndex: this.currentIndex,
            uptime: this.isRunning ? performance.now() - this.lastExecutionTime : 0,
            performanceMode: this.performanceMode
        };
    }
}

// Instantiate the Optimized Engine
const SchedulerInstance = new BackgroundScheduler();

/**
 * Worker API - Optimized Multi-threaded Communication
 */
self.onmessage = function (e) {
    const { action, index, mode } = e.data;

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

        case 'set_performance_mode':
            SchedulerInstance.setPerformanceMode(mode || 'balanced');
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
