// Licensed under the MIT license.

// One running refresh plus one pending refresh. Higher priority subsumes lower priority work.
export class RefreshQueue {
    private pending = 0;
    private running: Promise<void> | undefined;
    constructor(private readonly refresh: (priority: number) => Promise<void>) { }
    public request(priority: number): Promise<void> {
        this.pending = Math.max(this.pending, priority);
        if (!this.running) {
            this.running = Promise.resolve().then(async () => {
                let failure: Error | undefined;
                let failurePriority = 0;
                try {
                    while (this.pending) {
                        const next = this.pending;
                        this.pending = 0;
                        try {
                            await this.refresh(next);
                            if (next >= failurePriority) { failure = undefined; failurePriority = 0; }
                        } catch (error) {
                            if (next >= failurePriority) { failure = error; failurePriority = next; }
                        }
                    }
                    if (failure) throw failure;
                } finally { this.running = undefined; }
            });
        }
        return this.running;
    }
}
