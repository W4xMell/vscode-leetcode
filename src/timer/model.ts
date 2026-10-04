// Licensed under the MIT license.
export interface IPracticeMember { key: string; id: string; title: string; localPath?: string; }
export interface IPracticeGroup { key: string; title: string; members: IPracticeMember[]; sourceKey?: string; }
export interface IClock { allowance: number; elapsed: number; runningSince?: number; notified: boolean; }
export interface IGroupSession { group: IPracticeGroup; clock: IClock; problems: { [key: string]: IClock }; selected?: string; }
export interface ITimerState { sessions: { [key: string]: IGroupSession }; activeGroup?: string; selectedGroup?: string; }

// Time is sampled from an injected clock, so state transitions do not depend on interval cadence.
export class TimerModel {
    public state: ITimerState;
    constructor(private readonly now: () => number = Date.now, saved?: ITimerState) {
        this.state = saved ? JSON.parse(JSON.stringify(saved)) : { sessions: {} };
        for (const session of Object.values(this.state.sessions)) {
            session.clock.runningSince = undefined;
            for (const clock of Object.values(session.problems)) clock.runningSince = undefined;
        }
    }
    public elapsed(clock: IClock): number { return clock.elapsed + (clock.runningSince === undefined ? 0 : Math.max(0, this.now() - clock.runningSince)); }
    public remaining(clock: IClock): number { return clock.allowance - this.elapsed(clock); }
    public pause(clock: IClock): void { clock.elapsed = this.elapsed(clock); clock.runningSince = undefined; }
    public resume(clock: IClock): void { if (clock.runningSince === undefined) clock.runningSince = this.now(); }
    public pauseAll(): void {
        for (const session of Object.values(this.state.sessions)) {
            this.pause(session.clock);
            for (const clock of Object.values(session.problems)) this.pause(clock);
        }
    }
    public hasRunningClocks(): boolean {
        return Object.values(this.state.sessions).some((session) => session.clock.runningSince !== undefined ||
            Object.values(session.problems).some((clock) => clock.runningSince !== undefined));
    }
    public select(group: IPracticeGroup, memberKey: string): void {
        // A running/restorable session keeps its original membership and order.
        let session = this.state.sessions[group.key];
        if (!session) {
            session = { group: JSON.parse(JSON.stringify(group)), clock: this.createClock(0), problems: {} };
            this.state.sessions[group.key] = session;
        }
        if (!session.clock.allowance && !Object.keys(session.problems).length) session.group = JSON.parse(JSON.stringify(group));
        if (!session.group.members.some((member) => member.key === memberKey)) return;
        for (const other of Object.values(this.state.sessions)) {
            if (other.selected !== memberKey || other !== session) {
                for (const clock of Object.values(other.problems)) this.pause(clock);
            }
        }
        session.selected = memberKey;
        this.state.selectedGroup = group.key;
    }
    public startGroup(group: IPracticeGroup, minutes: number): void {
        this.pauseAll();
        const current = this.selectedSession();
        const selected = current && (current.group.key === group.key || current.group.key.startsWith(`${group.key}:outside:`)) ? current.selected : this.state.sessions[group.key]?.selected;
        const session: IGroupSession = { group: JSON.parse(JSON.stringify(group)), clock: this.createClock(minutes), problems: {}, selected };
        if (!group.members.some((member) => member.key === selected)) session.selected = undefined;
        this.state.sessions[group.key] = session;
        this.state.activeGroup = group.key;
        this.state.selectedGroup = group.key;
        this.resume(session.clock);
    }
    public startProblem(minutes: number): void {
        const session = this.selectedSession();
        if (!session?.selected) throw new Error("Select a problem first.");
        for (const other of Object.values(this.state.sessions)) for (const timer of Object.values(other.problems)) this.pause(timer);
        const clock = session.problems[session.selected] = this.createClock(minutes);
        this.resume(clock);
    }
    public selectedSession(): IGroupSession | undefined { return this.state.selectedGroup ? this.state.sessions[this.state.selectedGroup] : undefined; }
    public groupSession(): IGroupSession | undefined { return this.state.activeGroup ? this.state.sessions[this.state.activeGroup] : undefined; }
    public problemClock(): IClock | undefined {
        const session = this.selectedSession();
        return session?.selected ? session.problems[session.selected] : undefined;
    }
    public resumeGroup(key: string): void {
        for (const other of Object.values(this.state.sessions)) {
            if (other.group.key !== key) {
                this.pause(other.clock);
                for (const clock of Object.values(other.problems)) this.pause(clock);
            }
        }
        this.state.activeGroup = key;
        const session = this.state.sessions[key];
        if (session?.clock.allowance) this.resume(session.clock);
    }
    public tick(): string[] {
        const notices: string[] = [];
        for (const session of Object.values(this.state.sessions)) {
            const clocks: Array<{ clock: IClock; title: string }> = [{ clock: session.clock, title: session.group.title }];
            for (const key of Object.keys(session.problems)) clocks.push({ clock: session.problems[key], title: session.group.members.find((member) => member.key === key)?.title || key });
            for (const { clock, title } of clocks) {
                if (clock.runningSince !== undefined && clock.allowance > 0 && this.remaining(clock) <= 0 && !clock.notified) {
                    clock.notified = true;
                    notices.push(title);
                }
            }
        }
        return notices;
    }
    public snapshot(): ITimerState {
        const copy: ITimerState = JSON.parse(JSON.stringify(this.state));
        for (const key of Object.keys(copy.sessions)) {
            const session = copy.sessions[key];
            const source = this.state.sessions[key];
            session.clock.elapsed = this.elapsed(source.clock);
            session.clock.runningSince = undefined;
            for (const member of Object.keys(session.problems)) {
                session.problems[member].elapsed = this.elapsed(source.problems[member]);
                session.problems[member].runningSince = undefined;
            }
        }
        return copy;
    }
    private createClock(minutes: number): IClock {
        if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Invalid duration.");
        return { allowance: minutes * 60000, elapsed: 0, notified: false };
    }
}

export function formatTime(milliseconds: number): string {
    const seconds = Math.ceil(Math.abs(milliseconds) / 1000);
    return `${milliseconds < 0 ? "+" : ""}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
