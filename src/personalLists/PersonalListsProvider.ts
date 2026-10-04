// Licensed under the MIT license.
import axios from "axios";
import * as vscode from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import * as show from "../commands/show";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { globalState } from "../globalState";
import { leetCodeManager } from "../leetCodeManager";
import { Endpoint, UserStatus } from "../shared";
import { IPracticeGroup } from "../timer/model";
import { TimerController } from "../timer/TimerController";
import { accountKey, completionKey, IPersonalList, IListProblem, PersonalListClient } from "./model";

export interface IListElement { type: "list"; list: IPersonalList; }
export interface IListProblemElement { type: "problem"; list: IPersonalList; problem: IListProblem; }
export type ListElement = IListElement | IListProblemElement;

export class PersonalListsProvider implements vscode.TreeDataProvider<ListElement>, vscode.Disposable {
    private readonly changed = new vscode.EventEmitter<ListElement | undefined>();
    public readonly onDidChangeTreeData = this.changed.event;
    private lists: IPersonalList[] = [];
    private epoch = 0;
    private pending = new Map<string, Promise<void>>();
    constructor(private readonly context: vscode.ExtensionContext, private readonly timers: TimerController) { }
    public identity(): string | undefined {
        const user = leetCodeManager.getUser();
        return leetCodeManager.getStatus() === UserStatus.SignedIn && user && user !== "Unknown" ? accountKey(getLeetCodeEndpoint(), user) : undefined;
    }
    public accountChanged(): void {
        this.epoch++;
        const identity = this.identity();
        const slugs = identity ? this.context.workspaceState.get<string[]>(`personalLists.subscriptions.${identity}`, []) : [];
        this.lists = identity ? slugs.map((slug) => this.context.globalState.get<IPersonalList>(this.cacheKey(identity, slug)))
            .filter((list): list is IPersonalList => Boolean(list)).map((list) => ({ ...list, cached: true })) : [];
        this.updateTimerSources();
        this.changed.fire(undefined);
    }
    public getChildren(element?: ListElement): ListElement[] {
        return !element ? this.lists.map((list) => ({ type: "list", list })) : element.type === "list" ? element.list.problems.map((problem) => ({ type: "problem", list: element.list, problem })) : [];
    }
    public getTreeItem(element: ListElement): vscode.TreeItem {
        const item = new vscode.TreeItem(element.type === "list" ? element.list.name : `[${element.problem.id}] ${element.problem.name}`,
            element.type === "list" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        const identity = this.identity() || "";
        if (element.type === "list") {
            item.id = `${identity}:${element.list.slug}`;
            item.contextValue = "personalList";
            item.description = `${element.list.problems.filter((problem) => this.done(element.list.slug, problem.internalId)).length}/${element.list.problems.length}${element.list.cached ? " · Cached" : ""}`;
            item.iconPath = new vscode.ThemeIcon("list-ordered");
            item.tooltip = `${element.list.name}\nUpdated: ${new Date(element.list.updatedAt).toLocaleString()}${element.list.cached ? "\nCached data" : ""}${element.list.error ? `\n${element.list.error}` : ""}`;
        } else {
            item.id = `${identity}:${element.list.slug}:${element.problem.internalId}`;
            item.contextValue = "personalListProblem";
            item.description = `${element.problem.difficulty}${element.problem.locked ? " · Premium" : ""}`;
            item.iconPath = new vscode.ThemeIcon(this.done(element.list.slug, element.problem.internalId) ? "pass-filled" : element.problem.locked ? "lock" : "circle-outline");
            item.command = { command: "leetcodeStudyPlan.personalLists.preview", title: "Preview Problem", arguments: [element] };
        }
        return item;
    }
    public group(list: IPersonalList): IPracticeGroup {
        return { key: `personal:${this.identity()}:${list.slug}`, title: list.name,
            members: list.problems.map((problem) => ({ key: problem.internalId, id: problem.id, title: `[${problem.id}] ${problem.name}` })) };
    }
    public done(slug: string, internalId: string): boolean {
        const identity = this.identity();
        return Boolean(identity && this.context.workspaceState.get<boolean>(`personalLists.done.${completionKey(identity, slug, internalId)}`, false));
    }
    public async toggle(element?: ListElement): Promise<void> {
        if (element?.type !== "problem") return;
        const identity = this.identity();
        if (!identity || !this.current(element)) return;
        await this.context.workspaceState.update(`personalLists.done.${completionKey(identity, element.list.slug, element.problem.internalId)}`, !this.done(element.list.slug, element.problem.internalId));
        this.changed.fire(undefined);
    }
    public async add(): Promise<void> {
        const identity = this.identity();
        const epoch = this.epoch;
        if (!identity) throw new Error("Sign in to this extension before adding your own lists.");
        const catalog = await this.client().created();
        if (!this.valid(identity, epoch)) return;
        const chosen = await vscode.window.showQuickPick(catalog.map((summary) => ({ label: summary.name, description: summary.slug, value: summary })), { placeHolder: "Select your own ordinary LeetCode list (private lists included)" });
        if (!chosen || !this.valid(identity, epoch)) return;
        const list = await this.client().load(chosen.value.slug);
        if (!this.valid(identity, epoch)) return;
        const slugs = this.context.workspaceState.get<string[]>(`personalLists.subscriptions.${identity}`, []);
        if (!slugs.includes(list.slug)) slugs.push(list.slug);
        await this.context.globalState.update(this.cacheKey(identity, list.slug), list);
        await this.context.workspaceState.update(`personalLists.subscriptions.${identity}`, slugs);
        if (!this.valid(identity, epoch)) return;
        this.lists = this.lists.filter((existing) => existing.slug !== list.slug).concat(list);
        this.updateTimerSources();
        this.changed.fire(undefined);
    }
    public async remove(element?: ListElement): Promise<void> {
        const identity = this.identity();
        if (!identity || element?.type !== "list" || !this.current(element)) return;
        const slugs = this.context.workspaceState.get<string[]>(`personalLists.subscriptions.${identity}`, []);
        await this.context.workspaceState.update(`personalLists.subscriptions.${identity}`, slugs.filter((slug) => slug !== element.list.slug));
        this.lists = this.lists.filter((list) => list.slug !== element.list.slug);
        this.updateTimerSources();
        this.changed.fire(undefined);
    }
    public async refresh(element?: ListElement): Promise<void> {
        for (const list of element ? [element.list] : [...this.lists]) await this.refreshList(list.slug);
    }
    public async refreshList(slug: string): Promise<void> {
        const identity = this.identity();
        const epoch = this.epoch;
        if (!identity) return;
        const key = `${epoch}:${identity}:${slug}`;
        const existing = this.pending.get(key);
        if (existing) return existing;
        const update = async (): Promise<void> => {
            try {
                const list = await this.client().load(slug);
                if (!this.valid(identity, epoch)) return;
                await this.context.globalState.update(this.cacheKey(identity, slug), list);
                if (!this.valid(identity, epoch)) return;
                this.lists = this.lists.map((old) => old.slug === slug ? list : old);
            } catch {
                if (!this.valid(identity, epoch)) return;
                this.lists = this.lists.map((old) => old.slug === slug ? { ...old, cached: true, error: "Refresh failed. Last valid data retained; check connection and sign-in." } : old);
            }
            this.updateTimerSources();
            this.changed.fire(undefined);
        };
        const promise = update().finally(() => this.pending.delete(key));
        this.pending.set(key, promise);
        return promise;
    }
    public async open(element?: ListElement, codeNow: boolean = false): Promise<void> {
        if (element?.type !== "problem" || !this.current(element)) return;
        this.timers.select(this.group(element.list), element.problem.internalId);
        if (codeNow) await show.showProblem(new LeetCodeNode(element.problem));
        else await show.previewProblem(element.problem);
    }
    public current(element: ListElement): boolean { return this.lists.some((list) => list === element.list); }
    public dispose(): void { this.changed.dispose(); }
    private updateTimerSources(): void {
        this.timers.updateGroupSources("personal:", this.lists.map((list) => this.group(list)));
    }
    private valid(identity: string, epoch: number): boolean { return identity === this.identity() && epoch === this.epoch; }
    private cacheKey(identity: string, slug: string): string { return `personalLists.cache.${completionKey(identity, slug, "")}`; }
    private client(): PersonalListClient {
        const identity = this.identity();
        const epoch = this.epoch;
        const site = getLeetCodeEndpoint();
        const cookie = globalState.getCookie();
        if (!identity || !cookie) throw new Error("Sign in again to load your own lists.");
        const base = site === Endpoint.LeetCodeCN ? "https://leetcode.cn" : "https://leetcode.com";
        return new PersonalListClient(async (query, variables) => {
            if (!this.valid(identity, epoch)) throw new Error("Account changed.");
            const csrf = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
            const response = await axios.post(`${base}/graphql/`, { query, variables }, { timeout: 15000,
                headers: { "cookie": cookie, "referer": `${base}/problem-list/`, "content-type": "application/json", ...(csrf ? { "x-csrftoken": csrf } : {}) } });
            if (!this.valid(identity, epoch)) throw new Error("Account changed.");
            if (response.data.errors?.length || !response.data.data) throw new Error("LeetCode list request failed. Check sign-in and site support.");
            return response.data.data;
        });
    }
}

export function initializePersonalLists(context: vscode.ExtensionContext, timers: TimerController, ensureRemote: () => Promise<void> = async () => undefined): PersonalListsProvider {
    const provider = new PersonalListsProvider(context, timers);
    const view = vscode.window.createTreeView("leetCodeStudyPlanPersonalLists", { treeDataProvider: {
        onDidChangeTreeData: provider.onDidChangeTreeData,
        getTreeItem: (element) => provider.getTreeItem(element),
        getChildren: async (element) => { await ensureRemote(); return provider.getChildren(element); }
    }, showCollapseAll: true });
    const hintDismissedKey = "personalLists.hintDismissed";
    const updateHint = (dismissed: boolean): void => {
        view.message = dismissed ? undefined : "Add an ordinary list you created on LeetCode. Sign in to this extension first.";
        vscode.commands.executeCommand("setContext", "leetcodeStudyPlan.personalLists.hintVisible", !dismissed);
    };
    const dismissHint = async (): Promise<void> => {
        await context.globalState.update(hintDismissedKey, true);
        updateHint(true);
    };
    updateHint(context.globalState.get<boolean>(hintDismissedKey, false));
    const guarded = (handler: (element?: ListElement) => Promise<void>) => async (element?: ListElement): Promise<void> => {
        try { await ensureRemote(); await handler(element); } catch (error) { await vscode.window.showErrorMessage(`Personal Lists: ${error.message}`); }
    };
    const accountChanged = (): void => { provider.accountChanged(); timers.accountChanged(); };
    leetCodeManager.on("statusChanged", accountChanged);
    context.subscriptions.push(provider, view,
        { dispose: () => leetCodeManager.removeListener("statusChanged", accountChanged) },
        view.onDidExpandElement((event) => { ensureRemote().then(() => provider.refresh(event.element)).catch(() => undefined); }),
        vscode.workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration("leetcodeStudyPlan.endpoint")) accountChanged(); }),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.add", guarded(() => provider.add())),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.refresh", guarded((element) => provider.refresh(element))),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.hideHint", dismissHint),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.remove", guarded((element) => provider.remove(element))),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.preview", guarded((element) => provider.open(element))),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.codeNow", guarded((element) => provider.open(element, true))),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.toggleDone", guarded((element) => provider.toggle(element))),
        vscode.commands.registerCommand("leetcodeStudyPlan.personalLists.startGroupTimer", guarded(async (element) => {
            if (element && provider.current(element)) await timers.startGroup(provider.group(element.list));
        }))
    );
    provider.accountChanged();
    return provider;
}
