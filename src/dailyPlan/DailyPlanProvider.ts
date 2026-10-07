// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import { TimerController } from "../timer/TimerController";
import { IPracticeGroup } from "../timer/model";
import * as show from "../commands/show";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { localSubmissionStore, LocalSubmissionStore } from "./LocalSubmissionStore";
import { RefreshQueue } from "../utils/RefreshQueue";
import { parseProgress, IPlanDay, IPlanProblem, practiceKey, IProgressEntry, toLeetCodeProblem, validatePlan, workspacePath } from "./model";

export interface IDayElement { type: "day"; day: IPlanDay; problems: IProblemElement[]; }
export interface IProblemElement { type: "problem"; day: IPlanDay; problem: IPlanProblem; }
export type PlanElement = IDayElement | IProblemElement;

export class DailyPlanProvider implements vscode.TreeDataProvider<PlanElement>, vscode.Disposable {
    public root: string | undefined;
    public preferredRoot: string | undefined;
    private days: IDayElement[] = [];
    private progress = new Map<string, IProgressEntry>();
    private readonly changed = new vscode.EventEmitter<PlanElement | undefined>();
    public readonly onDidChangeTreeData = this.changed.event;

    constructor(private readonly submissions: LocalSubmissionStore = localSubmissionStore) { }

    public async refresh(): Promise<void> {
        // 完整读取成功后才替换当前视图，避免错误更新丢失已展示的题单。
        let days: IDayElement[] = [];
        let root: string | undefined;
        let progress = new Map<string, IProgressEntry>();
        const folders = [...vscode.workspace.workspaceFolders || []];
        folders.sort((a, b) => Number(b.uri.fsPath === this.preferredRoot) - Number(a.uri.fsPath === this.preferredRoot));
        for (const folder of folders) {
            if (folder.uri.scheme !== "file") continue;
            const relative = vscode.workspace.getConfiguration("leetcodeStudyPlan", folder.uri).get<string>("dailyPlan.path", "data/custom-plan.json");
            let filename = workspacePath(folder.uri.fsPath, relative);
            if (relative === "data/custom-plan.json" && !await fs.pathExists(filename)) {
                filename = workspacePath(folder.uri.fsPath, "data/notion-plan.json");
            }
            if (!await fs.pathExists(filename)) continue;
            const plan = validatePlan(await fs.readJson(filename));
            root = folder.uri.fsPath;
            days = plan.days.map((day) => ({ type: "day", day, problems: day.problems.map((problem) => ({ type: "problem", day, problem })) }));
            const progressFile = path.join(root, "PLAN.md");
            if (await fs.pathExists(progressFile)) {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.file(progressFile));
                progress = parseProgress(document.getText());
            }
            break;
        }
        this.root = root;
        this.days = days;
        this.progress = progress;
        this.changed.fire(undefined);
    }

    public getChildren(element?: PlanElement): PlanElement[] { return !element ? this.days : element.type === "day" ? element.problems : []; }
    public async refreshProgress(): Promise<void> {
        if (!this.root) return;
        const filename = path.join(this.root, "PLAN.md");
        const progress = await fs.pathExists(filename) ? parseProgress((await vscode.workspace.openTextDocument(vscode.Uri.file(filename))).getText()) : new Map<string, IProgressEntry>();
        this.progress = progress;
        this.changed.fire(undefined);
    }
    public getParent(element: PlanElement): PlanElement | undefined { return element.type === "problem" ? this.days.find((node) => node.day === element.day) : undefined; }
    public refreshSubmissionStatus(): void { this.changed.fire(undefined); }

    public getTreeItem(element: PlanElement): vscode.TreeItem {
        if (element.type === "day") {
            const completedCount = element.problems.filter((node) => this.isDone(node)).length;
            const dayItem = new vscode.TreeItem(element.day.title, vscode.TreeItemCollapsibleState.Collapsed);
            dayItem.id = `daily-day-${element.day.day}`;
            dayItem.description = `${completedCount}/${element.problems.length}`;
            dayItem.contextValue = "dailyPlanDay";
            dayItem.iconPath = new vscode.ThemeIcon("calendar");
            dayItem.tooltip = `${element.day.title}\nRight-click to open the source link.`;
            return dayItem;
        }
        const p = element.problem;
        const done = this.isDone(element);
        const accepted = this.isAccepted(element);
        const item = new vscode.TreeItem(p.kind === "leetcode" ? `[${p.leetcodeId}] ${p.title.replace(/^\d+[｜.]\s*/, "")}` : `Local exercise: ${p.title}`);
        item.id = `daily-day-${element.day.day}-problem-${p.order}`;
        item.contextValue = this.isPracticeCompleted(element) ? "dailyPlanProblemDone" : "dailyPlanProblem";
        item.description = p.kind === "custom" ? "Local exercise" : `${p.difficulty}${p.paidOnly ? " · Premium" : ""}${p.previousDays?.length ? " · Review" : ""}`;
        if (accepted) item.description += " · AC";
        item.iconPath = accepted ? new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed")) :
            new vscode.ThemeIcon(done ? "pass-filled" : p.kind === "custom" ? "beaker" : p.paidOnly ? "lock" : "circle-outline");
        item.command = { command: "leetcodeStudyPlan.dailyPlan.preview", title: "Preview Problem", arguments: [element] };
        item.tooltip = `${p.title}\n` + (p.kind === "leetcode" ? `${accepted ? "Accepted (AC) via this extension" : "No local accepted submission"}\n` : `${done ? "Practice completed" : "Practice pending"}\n`) +
            (p.kind === "leetcode" ? `${this.isPracticeCompleted(element) ? "Practice checked in PLAN.md" : "Practice unchecked in PLAN.md"}\n` : "") +
            (p.kind === "leetcode" ? "Click to preview; use Code Now to start solving." : "Click to open the local exercise template.") + (p.note ? `\n${p.note}` : "");
        return item;
    }

    public isDone(element: IProblemElement): boolean { return element.problem.kind === "leetcode" ? this.isAccepted(element) : this.isPracticeCompleted(element); }
    public isPracticeCompleted(element: IProblemElement): boolean { return this.progress.get(practiceKey(element.day.day, element.problem.order))?.done || false; }
    public dispose(): void { this.changed.dispose(); }

    private isAccepted(element: IProblemElement): boolean {
        return Boolean(this.root && element.problem.kind === "leetcode" && this.submissions.isAccepted(this.root, getLeetCodeEndpoint(), String(element.problem.leetcodeId)));
    }
}

// 原插件缓存优先提供账号状态、标签和题名；离线题单也可独立展示。
export function resolveProblem(problem: IPlanProblem): LeetCodeNode {
    return explorerNodeManager.getNodeById(String(problem.leetcodeId)) || new LeetCodeNode(toLeetCodeProblem(problem));
}

export function initializeDailyPlan(context: vscode.ExtensionContext, timers?: TimerController, ensureRemote: () => Promise<void> = async () => undefined): { provider: DailyPlanProvider; ready: Promise<void>; refresh: () => Promise<void> } {
    const provider = new DailyPlanProvider();
    provider.preferredRoot = context.workspaceState.get<string>("dailyPlan.root");
    const view = vscode.window.createTreeView("leetCodeStudyPlanDailyPlan", { treeDataProvider: provider, showCollapseAll: true });
    let debounce: NodeJS.Timeout | undefined;
    let scheduled = 0;
    let disposed = false;
    let failurePriority = 0;
    const queue = new RefreshQueue(async (priority) => {
        if (disposed) return;
        try {
            if (priority === 2) {
                await provider.refresh();
                timers?.updateGroupSources("day:", provider.getChildren().map((element) => group(element.day)));
            } else await provider.refreshProgress();
            if (priority >= failurePriority) { view.message = undefined; failurePriority = 0; }
        } catch (error) {
            if (priority >= failurePriority) {
                view.message = `Failed to load study plan: ${error.message}`;
                failurePriority = priority;
            }
            throw error;
        }
    });
    const requestRefresh = (priority: number): Promise<void> => {
        if (debounce) clearTimeout(debounce);
        debounce = undefined;
        const requested = Math.max(priority, scheduled);
        scheduled = 0;
        return queue.request(requested);
    };
    const refresh = (): Promise<void> => requestRefresh(2);
    const backgroundRefresh = (priority: number = 2): void => {
        if (disposed) return;
        scheduled = Math.max(scheduled, priority);
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => { requestRefresh(scheduled).catch(() => undefined); }, 150);
    };
    const guarded = (handler: (element?: PlanElement) => Promise<any>) => async (element?: PlanElement): Promise<void> => {
        try { await handler(element); } catch (error) { await vscode.window.showErrorMessage(`Study Plan: ${error.message}`); }
    };
    const group = (day: IPlanDay): IPracticeGroup => ({
        key: `day:${provider.root}:${vscode.workspace.getConfiguration("leetcodeStudyPlan", provider.root ? vscode.Uri.file(provider.root) : undefined).get<string>("dailyPlan.path", "data/custom-plan.json")}:${day.day}`,
        title: day.title,
        members: day.problems.map((problem) => ({ key: String(problem.order), id: problem.kind === "custom" ? `local:${problem.solutionPath}` : String(problem.leetcodeId), title: problem.title, localPath: problem.kind === "custom" && provider.root ? workspacePath(provider.root, problem.solutionPath!) : undefined }))
    });
    const openProblem = async (element: PlanElement | undefined, codeNow: boolean): Promise<void> => {
        if (!element || element.type !== "problem" || !provider.root) return;
        timers?.select(group(element.day), String(element.problem.order));
        if (element.problem.kind === "custom") {
            const filename = workspacePath(provider.root, element.problem.solutionPath!);
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(filename)), { preview: false });
        } else {
            await ensureRemote();
            if (codeNow) await show.showProblem(resolveProblem(element.problem));
            else await show.previewProblem(resolveProblem(element.problem));
        }
    };
    const toggleDone = async (element?: PlanElement): Promise<void> => {
        if (!element || element.type !== "problem" || !provider.root) return;
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(provider.root, "PLAN.md")));
        const entry = parseProgress(document.getText()).get(practiceKey(element.day.day, element.problem.order));
        if (!entry) throw new Error("No matching entry in PLAN.md; completion cannot be updated.");
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(entry.offset), document.positionAt(entry.offset + 1)), entry.done ? " " : "x");
        if (!await vscode.workspace.applyEdit(edit) || !await document.save()) throw new Error("Could not save completion. Check PLAN.md.");
        await requestRefresh(1);
    };
    const openSource = async (element?: PlanElement): Promise<void> => {
        if (!element) return;
        const url = element.type === "day" ? element.day.sourceUrl : element.problem.sourceUrl || element.day.algorithmSourceUrl || element.day.sourceUrl;
        if (!url) throw new Error("This entry has no source link.");
        const uri = vscode.Uri.parse(url);
        if (uri.scheme !== "https") throw new Error("Source links must use HTTPS.");
        await vscode.env.openExternal(uri);
    };
    const selectPlan = async (): Promise<void> => {
        const folders = vscode.workspace.workspaceFolders || [];
        if (!folders.length) throw new Error("Open a practice workspace before selecting a plan.");
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Study Plan JSON": ["json"] }, defaultUri: folders[0].uri });
        if (!files?.length) return;
        const folder = vscode.workspace.getWorkspaceFolder(files[0]);
        if (!folder || files[0].scheme !== "file") throw new Error("Select a study plan JSON file inside the workspace.");
        const relative = path.relative(folder.uri.fsPath, files[0].fsPath);
        workspacePath(folder.uri.fsPath, relative);
        validatePlan(await fs.readJson(files[0].fsPath));
        provider.preferredRoot = folder.uri.fsPath;
        await context.workspaceState.update("dailyPlan.root", folder.uri.fsPath);
        await vscode.workspace.getConfiguration("leetcodeStudyPlan", folder.uri).update("dailyPlan.path", relative, vscode.ConfigurationTarget.WorkspaceFolder);
        await refresh();
    };
    let watchers: vscode.FileSystemWatcher[] = [];
    const statusChanged = (): void => provider.refreshSubmissionStatus();
    const updateWatchers = (): void => {
        for (const watcher of watchers) watcher.dispose();
        watchers = [vscode.workspace.createFileSystemWatcher("**/PLAN.md")];
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const relative = vscode.workspace.getConfiguration("leetcodeStudyPlan", folder.uri).get<string>("dailyPlan.path", "data/custom-plan.json");
            try {
                workspacePath(folder.uri.fsPath, relative);
                watchers.push(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, relative)));
                if (relative === "data/custom-plan.json") watchers.push(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "data/notion-plan.json")));
            } catch { /* 路径错误由 refresh 显示，不影响原插件激活。 */ }
        }
        for (const watcher of watchers) {
            const changed = (uri: vscode.Uri): void => {
                if (path.basename(uri.fsPath) === "PLAN.md") {
                    if (provider.root && uri.fsPath === path.join(provider.root, "PLAN.md")) backgroundRefresh(1);
                } else backgroundRefresh();
            };
            watcher.onDidChange(changed);
            watcher.onDidCreate(changed);
            watcher.onDidDelete(changed);
        }
    };
    context.subscriptions.push(provider, view,
        localSubmissionStore.onDidChange(statusChanged),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.startGroupTimer", guarded(async (element) => { if (element) await timers?.startGroup(group(element.day)); })),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.refresh", guarded(refresh)),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.preview", guarded((element) => openProblem(element, false))),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.codeNow", guarded((element) => openProblem(element, true))),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.toggleDone", guarded(toggleDone)),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.openSource", guarded(openSource)),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.openNotion", guarded(openSource)),
        vscode.commands.registerCommand("leetcodeStudyPlan.dailyPlan.selectPlan", guarded(selectPlan)),
        vscode.workspace.onDidChangeWorkspaceFolders(() => { updateWatchers(); backgroundRefresh(); }),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("leetcodeStudyPlan.dailyPlan.path")) { updateWatchers(); backgroundRefresh(); }
            if (event.affectsConfiguration("leetcodeStudyPlan.endpoint")) statusChanged();
        }),
        vscode.workspace.onDidChangeTextDocument((event) => { if (provider.root && event.document.uri.fsPath === path.join(provider.root, "PLAN.md")) backgroundRefresh(1); })
    );
    context.subscriptions.push({ dispose: () => { disposed = true; if (debounce) clearTimeout(debounce); for (const watcher of watchers) watcher.dispose(); } });
    updateWatchers();
    const ready = refresh();
    ready.catch(() => undefined);
    return { provider, ready, refresh };
}
