// Licensed under the MIT license.
import * as path from "path";
import * as vscode from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { leetCodeManager } from "../leetCodeManager";
import { accountKey } from "../personalLists/model";
import { UserStatus } from "../shared";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { formatTime, IClock, IPracticeGroup, ITimerState, TimerModel } from "./model";

export class TimerController implements vscode.Disposable {
    public readonly model: TimerModel;
    private readonly problemBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    private readonly groupBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    private interval: NodeJS.Timeout | undefined;
    private writes = Promise.resolve();
    private saveRequested = false;
    private saving = false;
    private disposed = false;
    private editorVersion = 0;
    private readonly sources = new Map<string, IPracticeGroup>();
    constructor(private readonly context: vscode.ExtensionContext) {
        this.model = new TimerModel(Date.now, context.workspaceState.get<ITimerState>("timedPractice.v1"));
        this.problemBar.command = "leetcodeStudyPlan.timer.problem";
        this.groupBar.command = "leetcodeStudyPlan.timer.group";
        context.subscriptions.push(this,
            vscode.commands.registerCommand("leetcodeStudyPlan.timer.problem", () => this.guarded(() => this.problemMenu())),
            vscode.commands.registerCommand("leetcodeStudyPlan.timer.group", () => this.guarded(() => this.groupMenu())),
            vscode.window.onDidChangeActiveTextEditor((editor) => { this.editorChanged(editor).catch(() => undefined); })
        );
        this.accountChanged();
        this.editorChanged(vscode.window.activeTextEditor).catch(() => undefined);
    }
    public updateGroupSources(prefix: string, groups: IPracticeGroup[]): void {
        for (const key of this.sources.keys()) if (key.startsWith(prefix)) this.sources.delete(key);
        for (const group of groups) this.sources.set(group.key, group);
    }
    public select(group: IPracticeGroup, memberKey: string): void {
        if (!this.allowed(group.key)) return;
        const saved = this.model.state.sessions[group.key];
        // Selecting a captured session member must not replace the current source.
        if (group !== saved?.group && !group.sourceKey) this.sources.set(group.key, group);
        const member = group.members.find((entry) => entry.key === memberKey);
        if (!member) return;
        if (saved && (saved.clock.allowance || Object.keys(saved.problems).length) &&
            !saved.group.members.some((entry) => entry.key === memberKey && entry.id === member.id)) {
            // A newly added source member can have a single timer without altering the saved session.
            group = { key: `${group.key}:outside:${memberKey}`, sourceKey: group.key, title: group.title, members: [member] };
        }
        this.model.select(group, memberKey);
        this.checkpoint();
    }
    public async startGroup(group: IPracticeGroup): Promise<void> {
        const sourceKey = this.groupSourceKey(group);
        if (!this.allowed(sourceKey)) return;
        if (!group.sourceKey && group !== this.model.state.sessions[group.key]?.group) this.sources.set(group.key, group);
        const minutes = await this.duration("group", 120);
        if (minutes === undefined || !this.allowed(sourceKey)) return;
        const source = this.sources.get(sourceKey);
        if (!source) throw new Error("This group is no longer available. Select a current Day/list entry first.");
        if (!source.members.length) throw new Error("This group has no practice entries.");
        this.model.startGroup(source, minutes);
        this.checkpoint();
    }
    public accountChanged(): void {
        let changed = false;
        for (const session of Object.values(this.model.state.sessions)) {
            if (!this.allowed(session.group.key)) {
                changed = changed || session.clock.runningSince !== undefined || Object.values(session.problems).some((clock) => clock.runningSince !== undefined);
                this.model.pause(session.clock);
                for (const clock of Object.values(session.problems)) this.model.pause(clock);
            }
        }
        if (this.model.state.activeGroup && !this.allowed(this.model.state.activeGroup)) { this.model.state.activeGroup = undefined; changed = true; }
        if (this.model.state.selectedGroup && !this.allowed(this.model.state.selectedGroup)) { this.model.state.selectedGroup = undefined; changed = true; }
        if (changed) this.checkpoint();
        else this.render();
    }
    public async flush(): Promise<void> { await this.writes; }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.interval) clearInterval(this.interval);
        this.model.pauseAll();
        this.save();
        this.problemBar.dispose();
        this.groupBar.dispose();
    }
    private allowed(key: string): boolean {
        if (!key.startsWith("personal:")) return true;
        const user = leetCodeManager.getUser();
        return leetCodeManager.getStatus() === UserStatus.SignedIn && Boolean(user) && key.startsWith(`personal:${accountKey(getLeetCodeEndpoint(), user!)}:`);
    }
    private groupSourceKey(group: IPracticeGroup): string {
        // Older saved outside-member sessions did not persist their parent source key.
        return group.sourceKey || [...this.sources.keys()].find((key) => group.key === `${key}:outside:${group.members[0]?.key}`) || group.key;
    }
    private async guarded(action: () => Promise<void>): Promise<void> {
        try { await action(); } catch (error) { await vscode.window.showErrorMessage(`Practice Timer: ${error.message}`); }
    }
    private async editorChanged(editor?: vscode.TextEditor): Promise<void> {
        const version = ++this.editorVersion;
        if (!editor || editor.document.uri.scheme !== "file") return;
        const active = this.model.groupSession();
        const selected = this.model.selectedSession();
        const fileKey = (inputPath: string): string => process.platform === "win32" ? path.resolve(inputPath).toLowerCase() : path.resolve(inputPath);
        const filename = fileKey(editor.document.uri.fsPath);
        const groups = [selected?.group, active?.group, ...this.sources.values(), ...Object.values(this.model.state.sessions).map((session) => session.group)];
        for (const group of groups) {
            if (!group || !this.allowed(group.key)) continue;
            const local = group.members.find((entry) => entry.localPath && fileKey(entry.localPath) === filename);
            if (local) { this.select(group, local.key); return; }
        }
        const marker = editor.document.getText().match(/@lc\s+app=\S+\s+id=(.*?)\s+lang=\S+/);
        const basename = path.basename(editor.document.uri.fsPath);
        const legacyId = basename.match(/^((?:LCP|LCR|LCS|面试题|Interview)\s+\d+(?:\.\d+)?|\d+)(?:\.|$)/)?.[1];
        const id = marker?.[1].trim() || legacyId;
        if (!id) return; // Ordinary files do not end group practice or select a problem.
        if (version !== this.editorVersion) return;
        if (selected?.group.members.find((entry) => entry.key === selected.selected)?.id === id) return;
        const member = active?.group.members.find((entry) => entry.id === id);
        if (active && member && this.allowed(active.group.key)) this.select(active.group, member.key);
        else this.select({ key: `problem:${getLeetCodeEndpoint()}:${id}`, title: `[${id}]`, members: [{ key: id, id, title: `[${id}]` }] }, id);
    }
    private async duration(kind: string, fallback: number): Promise<number | undefined> {
        const value = await vscode.window.showInputBox({ prompt: `${kind === "group" ? "Group" : "Problem"} duration in minutes`,
            value: String(vscode.workspace.getConfiguration("leetcodeStudyPlan").get<number>(`timer.${kind}Minutes`, fallback)),
            validateInput: (input) => Number.isFinite(Number(input)) && Number(input) > 0 && Number(input) <= 10080 ? undefined : "Enter a number greater than 0 and at most 10080." });
        return value === undefined ? undefined : Number(value);
    }
    private async problemMenu(): Promise<void> {
        const choice = await vscode.window.showQuickPick(["Start", "Pause", "Resume", "Reset"], { placeHolder: "Single problem timer" });
        if (!choice) return;
        if (!this.model.selectedSession()?.selected) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) throw new Error("Open a LeetCode solution or select a practice entry first.");
            const id = await getNodeIdFromFile(editor.document.uri.fsPath);
            if (!/^(?:\d+|(?:LCP|LCR|LCS|面试题|Interview)\s+\d+(?:\.\d+)?)$/.test(id)) throw new Error("This file has no recognized LeetCode problem ID.");
            this.select({ key: `problem:${getLeetCodeEndpoint()}:${id}`, title: `[${id}]`, members: [{ key: id, id, title: `[${id}]` }] }, id);
        }
        const session = this.model.selectedSession()!;
        if (choice === "Start") {
            const minutes = await this.duration("problem", 30);
            if (minutes !== undefined && this.allowed(session.group.key) && session === this.model.selectedSession()) this.model.startProblem(minutes);
        } else {
            const clock = this.model.problemClock();
            if (clock && choice === "Pause") this.model.pause(clock);
            if (clock && choice === "Resume") {
                for (const other of Object.values(this.model.state.sessions)) for (const timer of Object.values(other.problems)) this.model.pause(timer);
                this.model.resume(clock);
            }
            if (choice === "Reset" && session.selected) delete session.problems[session.selected];
        }
        this.checkpoint();
    }
    private async groupMenu(): Promise<void> {
        const choice = await vscode.window.showQuickPick(["Start selected group", "Pause", "Resume", "Reset", "Restore saved group", "Open session problem"], { placeHolder: "Group timer — start a Day or list from its context menu" });
        if (!choice) return;
        const session = this.model.groupSession();
        if (choice === "Start selected group") {
            const selected = this.model.selectedSession();
            if (!selected || selected.group.key.startsWith("problem:")) throw new Error("Select a Day/list entry, or use its Start Group Timer menu.");
            const source = this.sources.get(this.groupSourceKey(selected.group));
            if (!source) throw new Error("This group is no longer available. Select a current Day/list entry first.");
            await this.startGroup(source);
        } else if (choice === "Restore saved group") {
            const sessions = Object.values(this.model.state.sessions).filter((saved) => saved.clock.allowance > 0 && this.allowed(saved.group.key));
            const pick = await vscode.window.showQuickPick(sessions.map((saved) => ({ label: saved.group.title, description: formatTime(this.model.remaining(saved.clock)), value: saved })), { placeHolder: "Choose a saved group; its original membership will be restored" });
            if (pick && this.allowed(pick.value.group.key)) {
                this.model.pauseAll();
                this.model.state.activeGroup = pick.value.group.key;
                this.model.state.selectedGroup = pick.value.group.key;
            }
        } else if (session) {
            if (choice === "Pause") this.model.pause(session.clock);
            if (choice === "Resume") this.model.resumeGroup(session.group.key);
            if (choice === "Reset") {
                this.model.pause(session.clock);
                for (const clock of Object.values(session.problems)) this.model.pause(clock);
                delete this.model.state.sessions[session.group.key];
                this.model.state.activeGroup = undefined;
                if (this.model.state.selectedGroup === session.group.key) this.model.state.selectedGroup = undefined;
            }
            if (choice === "Open session problem") {
                const pick = await vscode.window.showQuickPick(session.group.members.map((member) => ({ label: member.title, value: member })), { placeHolder: "Problems captured when this session started" });
                if (pick && this.allowed(session.group.key)) {
                    this.select(session.group, pick.value.key);
                    if (pick.value.localPath) await vscode.window.showTextDocument(vscode.Uri.file(pick.value.localPath), { preview: false });
                    else if (!pick.value.id.startsWith("local:")) await vscode.commands.executeCommand("leetcodeStudyPlan.previewProblem", {
                        id: pick.value.id, name: pick.value.title, difficulty: "", passRate: "", locked: false, state: 3, isFavorite: false, tags: [], companies: []
                    });
                }
            }
        }
        this.checkpoint();
    }
    private checkpoint(): void {
        if (this.disposed) return;
        const notices = this.model.tick();
        this.save();
        for (const title of notices) vscode.window.showInformationMessage(`Time is up: ${title}. Overtime is now being counted.`);
        this.render();
        if (this.model.hasRunningClocks()) {
            if (!this.interval) this.interval = setInterval(() => { this.checkpoint(); }, 1000);
        } else if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }
    private save(): void {
        // Slow storage retains only one pending request; snapshot the latest state when it can be written.
        this.saveRequested = true;
        if (this.saving) return;
        this.saving = true;
        this.writes = Promise.resolve().then(async () => {
            try {
                while (this.saveRequested) {
                    this.saveRequested = false;
                    const snapshot = this.model.snapshot();
                    try { await this.context.workspaceState.update("timedPractice.v1", snapshot); } catch { /* A later checkpoint retries with the latest state. */ }
                }
            } finally { this.saving = false; }
        });
    }
    private render(): void {
        const problem = this.model.problemClock();
        const selected = this.model.selectedSession();
        const group = this.model.groupSession();
        this.renderBar(this.problemBar, "Problem", problem, selected?.group.members.find((member) => member.key === selected.selected)?.title);
        this.renderBar(this.groupBar, "Group", group?.clock.allowance ? group.clock : undefined, group?.group.title);
    }
    private renderBar(bar: vscode.StatusBarItem, label: string, clock?: IClock, title?: string): void {
        const text = `$(watch) ${label}${clock ? ` ${formatTime(this.model.remaining(clock))}${clock.runningSince === undefined ? " $(debug-pause)" : ""}` : " Timer"}`;
        const tooltip = title ? `${title}\nClick to start, pause, resume, or reset.` : `Click to manage the ${label.toLowerCase()} timer.`;
        if (bar.text !== text) { bar.text = text; bar.show(); }
        if (bar.tooltip !== tooltip) bar.tooltip = tooltip;
    }
}
