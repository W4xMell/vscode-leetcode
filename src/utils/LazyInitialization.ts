// Licensed under the MIT license.

// Share initialization across concurrent callers, and allow retry after a failure or configuration change.
export class LazyInitialization {
    private previous = Promise.resolve();
    private pending: Promise<void> | undefined;
    constructor(private readonly initialize: () => Promise<void>) { }
    public ensure(): Promise<void> {
        if (!this.pending) {
            const attempt = this.previous.catch(() => undefined).then(this.initialize);
            this.previous = attempt;
            this.pending = attempt;
            attempt.catch(() => { if (this.pending === attempt) this.pending = undefined; });
        }
        return this.pending;
    }
    public invalidate(): void { this.pending = undefined; }
}
