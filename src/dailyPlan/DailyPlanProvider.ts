// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import * as show from "../commands/show";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
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

    public async refresh(): Promise<void> {
        // 完整读取成功后才替换当前视图，避免错误更新丢失已展示的题单。
        let days: IDayElement[] = [];
        let root: string | undefined;
        let progress = new Map<string, IProgressEntry>();
        const folders = [...vscode.workspace.workspaceFolders || []];
        folders.sort((a, b) => Number(b.uri.fsPath === this.preferredRoot) - Number(a.uri.fsPath === this.preferredRoot));
        for (const folder of folders) {
            if (folder.uri.scheme !== "file") continue;
            const relative = vscode.workspace.getConfiguration("leetcode", folder.uri).get<string>("dailyPlan.path", "data/custom-plan.json");
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
    public getParent(element: PlanElement): PlanElement | undefined { return element.type === "problem" ? this.days.find((node) => node.day === element.day) : undefined; }

    public getTreeItem(element: PlanElement): vscode.TreeItem {
        if (element.type === "day") {
            const completedCount = element.problems.filter((node) => this.isDone(node)).length;
            const dayItem = new vscode.TreeItem(element.day.title, vscode.TreeItemCollapsibleState.Collapsed);
            dayItem.id = `daily-day-${element.day.day}`;
            dayItem.description = `${completedCount}/${element.problems.length}`;
            dayItem.contextValue = "dailyPlanDay";
            dayItem.iconPath = new vscode.ThemeIcon("calendar");
            dayItem.tooltip = `${element.day.title}\n右键查看题单来源。`;
            return dayItem;
        }
        const p = element.problem;
        const done = this.isDone(element);
        const item = new vscode.TreeItem(p.kind === "leetcode" ? `[${p.leetcodeId}] ${p.title.replace(/^\d+[｜.]\s*/, "")}` : `本地变式 · ${p.title}`);
        item.id = `daily-day-${element.day.day}-problem-${p.order}`;
        item.contextValue = done ? "dailyPlanProblemDone" : "dailyPlanProblem";
        item.description = p.kind === "custom" ? "本地练习" : `${p.difficulty}${p.paidOnly ? " · 会员" : ""}${p.previousDays?.length ? " · 复习" : ""}`;
        item.iconPath = new vscode.ThemeIcon(done ? "pass-filled" : p.kind === "custom" ? "beaker" : p.paidOnly ? "lock" : "circle-outline");
        item.command = { command: "leetcode.dailyPlan.preview", title: "Preview Problem", arguments: [element] };
        item.tooltip = `${p.title}\n${done ? "本次练习已完成" : "本次练习待完成"}\n` +
            (p.kind === "leetcode" ? "点击预览题目，使用 Code Now 开始编写。" : "点击打开本地变式模板。") + (p.note ? `\n${p.note}` : "");
        return item;
    }

    public isDone(element: IProblemElement): boolean { return this.progress.get(practiceKey(element.day.day, element.problem.order))?.done || false; }
    public dispose(): void { this.changed.dispose(); }
}

// 原插件缓存优先提供账号状态、标签和题名；离线题单也可独立展示。
export function resolveProblem(problem: IPlanProblem): LeetCodeNode {
    return explorerNodeManager.getNodeById(String(problem.leetcodeId)) || new LeetCodeNode(toLeetCodeProblem(problem));
}

export function initializeDailyPlan(context: vscode.ExtensionContext): { provider: DailyPlanProvider; ready: Promise<void>; refresh: () => Promise<void> } {
    const provider = new DailyPlanProvider();
    provider.preferredRoot = context.workspaceState.get<string>("dailyPlan.root");
    const view = vscode.window.createTreeView("leetCodeDailyPlan", { treeDataProvider: provider, showCollapseAll: true });
    let pendingRefresh = Promise.resolve();
    const refresh = (): Promise<void> => {
        pendingRefresh = pendingRefresh.catch(() => undefined).then(() => provider.refresh()).then(() => {
            view.message = undefined;
        }, (error) => {
            view.message = `题单读取失败：${error.message}`;
            throw error;
        });
        return pendingRefresh;
    };
    const backgroundRefresh = (): void => { refresh().catch(() => undefined); };
    const guarded = (handler: (element?: PlanElement) => Promise<any>) => async (element?: PlanElement): Promise<void> => {
        try { await handler(element); } catch (error) { await vscode.window.showErrorMessage(`自定义题单：${error.message}`); }
    };
    const openProblem = async (element: PlanElement | undefined, codeNow: boolean): Promise<void> => {
        if (!element || element.type !== "problem" || !provider.root) return;
        if (element.problem.kind === "custom") {
            const filename = workspacePath(provider.root, element.problem.solutionPath!);
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(filename)), { preview: false });
        } else if (codeNow) {
            await show.showProblem(resolveProblem(element.problem));
        } else {
            await show.previewProblem(resolveProblem(element.problem));
        }
    };
    const toggleDone = async (element?: PlanElement): Promise<void> => {
        if (!element || element.type !== "problem" || !provider.root) return;
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(provider.root, "PLAN.md")));
        const entry = parseProgress(document.getText()).get(practiceKey(element.day.day, element.problem.order));
        if (!entry) throw new Error("PLAN.md 中找不到该条目，无法更新完成状态。");
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(entry.offset), document.positionAt(entry.offset + 1)), entry.done ? " " : "x");
        if (!await vscode.workspace.applyEdit(edit) || !await document.save()) throw new Error("完成状态保存失败，请检查 PLAN.md。");
        await refresh();
    };
    const openSource = async (element?: PlanElement): Promise<void> => {
        if (!element) return;
        const url = element.type === "day" ? element.day.sourceUrl : element.problem.sourceUrl || element.day.algorithmSourceUrl || element.day.sourceUrl;
        if (!url) throw new Error("该条目没有配置来源链接。");
        const uri = vscode.Uri.parse(url);
        if (uri.scheme !== "https") throw new Error("题单来源链接必须使用 HTTPS。");
        await vscode.env.openExternal(uri);
    };
    const selectPlan = async (): Promise<void> => {
        const folders = vscode.workspace.workspaceFolders || [];
        if (!folders.length) throw new Error("请先打开练习工作区，再选择题单。");
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "题单 JSON": ["json"] }, defaultUri: folders[0].uri });
        if (!files?.length) return;
        const folder = vscode.workspace.getWorkspaceFolder(files[0]);
        if (!folder || files[0].scheme !== "file") throw new Error("请选择工作区内的题单 JSON 文件。");
        const relative = path.relative(folder.uri.fsPath, files[0].fsPath);
        workspacePath(folder.uri.fsPath, relative);
        validatePlan(await fs.readJson(files[0].fsPath));
        provider.preferredRoot = folder.uri.fsPath;
        await context.workspaceState.update("dailyPlan.root", folder.uri.fsPath);
        await vscode.workspace.getConfiguration("leetcode", folder.uri).update("dailyPlan.path", relative, vscode.ConfigurationTarget.WorkspaceFolder);
        await refresh();
    };
    let watchers: vscode.FileSystemWatcher[] = [];
    const updateWatchers = (): void => {
        for (const watcher of watchers) watcher.dispose();
        watchers = [vscode.workspace.createFileSystemWatcher("**/PLAN.md")];
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const relative = vscode.workspace.getConfiguration("leetcode", folder.uri).get<string>("dailyPlan.path", "data/custom-plan.json");
            try {
                workspacePath(folder.uri.fsPath, relative);
                watchers.push(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, relative)));
                if (relative === "data/custom-plan.json") watchers.push(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "data/notion-plan.json")));
            } catch { /* 路径错误由 refresh 显示，不影响原插件激活。 */ }
        }
        for (const watcher of watchers) {
            watcher.onDidChange(backgroundRefresh);
            watcher.onDidCreate(backgroundRefresh);
            watcher.onDidDelete(backgroundRefresh);
        }
    };
    context.subscriptions.push(provider, view,
        vscode.commands.registerCommand("leetcode.dailyPlan.refresh", guarded(refresh)),
        vscode.commands.registerCommand("leetcode.dailyPlan.preview", guarded((element) => openProblem(element, false))),
        vscode.commands.registerCommand("leetcode.dailyPlan.codeNow", guarded((element) => openProblem(element, true))),
        vscode.commands.registerCommand("leetcode.dailyPlan.toggleDone", guarded(toggleDone)),
        vscode.commands.registerCommand("leetcode.dailyPlan.openSource", guarded(openSource)),
        vscode.commands.registerCommand("leetcode.dailyPlan.openNotion", guarded(openSource)),
        vscode.commands.registerCommand("leetcode.dailyPlan.selectPlan", guarded(selectPlan)),
        vscode.workspace.onDidChangeWorkspaceFolders(() => { updateWatchers(); backgroundRefresh(); }),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("leetcode.dailyPlan.path")) { updateWatchers(); backgroundRefresh(); }
        }),
        vscode.workspace.onDidChangeTextDocument((event) => { if (provider.root && event.document.uri.fsPath === path.join(provider.root, "PLAN.md")) backgroundRefresh(); })
    );
    context.subscriptions.push({ dispose: () => { for (const watcher of watchers) watcher.dispose(); } });
    updateWatchers();
    const ready = refresh();
    ready.catch(() => undefined);
    return { provider, ready, refresh };
}
