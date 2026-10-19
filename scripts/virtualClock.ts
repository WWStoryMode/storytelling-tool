import { type Clock } from "../src/game";

// Time only moves when you say so, so a 24-hour vote can close in a keystroke
export class VirtualClock implements Clock {
    private nextHandle = 0;
    private timers: { handle: number; at: number; callback: () => void }[] = [];

    constructor(private time = Date.now()) {}

    now = () => this.time;

    setTimeout = (callback: () => void, ms: number) => {
        const handle = ++this.nextHandle;
        this.timers.push({ handle, at: this.time + ms, callback });
        return handle;
    };

    clearTimeout = (handle: unknown) => {
        this.timers = this.timers.filter(timer => timer.handle !== handle);
    };

    advance(ms: number) {
        const end = this.time + ms;
        for (;;) {
            const due = this.timers.filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            this.clearTimeout(due.handle);
            this.time = due.at;
            due.callback();
        }
        this.time = end;
    }

    skip() {
        const next = [...this.timers].sort((a, b) => a.at - b.at)[0];
        if (!next) return false;
        this.advance(next.at - this.time);
        return true;
    }
}
