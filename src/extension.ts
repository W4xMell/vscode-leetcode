// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { codeLensController } from "./codelens/CodeLensController";
import * as cache from "./commands/cache";
import { switchDefaultLanguage } from "./commands/language";
import * as plugin from "./commands/plugin";
import * as session from "./commands/session";
import * as show from "./commands/show";
import * as star from "./commands/star";
import * as submit from "./commands/submit";
import * as test from "./commands/test";
import { explorerNodeManager } from "./explorer/explorerNodeManager";
import { LeetCodeNode } from "./explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "./explorer/LeetCodeTreeDataProvider";
import { leetCodeTreeItemDecorationProvider } from "./explorer/LeetCodeTreeItemDecorationProvider";
import { leetCodeChannel } from "./leetCodeChannel";
import { leetCodeExecutor } from "./leetCodeExecutor";
import { leetCodeManager } from "./leetCodeManager";
import { leetCodeStatusBarController } from "./statusbar/leetCodeStatusBarController";
import { DialogType, promptForOpenOutputChannel } from "./utils/uiUtils";
import { leetCodePreviewProvider } from "./webview/leetCodePreviewProvider";
import { leetCodeSolutionProvider } from "./webview/leetCodeSolutionProvider";
import { leetCodeSubmissionProvider } from "./webview/leetCodeSubmissionProvider";
import { markdownEngine } from "./webview/markdownEngine";
import TrackData from "./utils/trackingUtils";
import { globalState } from "./globalState";
import { LazyInitialization } from "./utils/LazyInitialization";
import { TimerController } from "./timer/TimerController";
import { initializePersonalLists } from "./personalLists/PersonalListsProvider";
import { initializeDailyPlan } from "./dailyPlan/DailyPlanProvider";
import { localSubmissionStore } from "./dailyPlan/LocalSubmissionStore";

export async function activate(context: vscode.ExtensionContext): Promise<ReturnType<typeof initializeDailyPlan> & { timers: TimerController; personalLists: ReturnType<typeof initializePersonalLists> }> {
    globalState.initialize(context);
    localSubmissionStore.initialize(context);
    context.subscriptions.push(localSubmissionStore);
    const cli = new LazyInitialization(async () => {
        if (!await leetCodeExecutor.meetRequirements(context)) throw new Error("The environment doesn't meet requirements.");
        await leetCodeExecutor.switchEndpoint(plugin.getLeetCodeEndpoint());
    });
    leetCodeExecutor.setPreparation(() => cli.ensure());
    const remote = new LazyInitialization(async () => {
        await cli.ensure();
        await leetCodeManager.getLoginStatus();
    });
    const ensureRemote = (): Promise<void> => remote.ensure();
    const registerRemote = (name: string, handler: (...args: any[]) => any): vscode.Disposable =>
        vscode.commands.registerCommand(name, async (...args: any[]) => {
            try { await ensureRemote(); return await handler(...args); } catch (error) {
                leetCodeChannel.appendLine(error.toString());
                await promptForOpenOutputChannel("LeetCode operation failed. Please open output channel for details.", DialogType.error);
            }
        });
    const timers = new TimerController(context);
    const dailyPlan = initializeDailyPlan(context, timers, ensureRemote);
    const personalLists = initializePersonalLists(context, timers, ensureRemote);
    const statusChanged = (): void => {
        leetCodeStatusBarController.updateStatusBar(leetCodeManager.getStatus(), leetCodeManager.getUser());
        leetCodeTreeDataProvider.refresh().catch(() => undefined);
    };
    leetCodeManager.on("statusChanged", statusChanged);
    leetCodeTreeDataProvider.initialize(context, ensureRemote);
    context.subscriptions.push(
        leetCodeStatusBarController,
        leetCodeChannel,
        leetCodePreviewProvider,
        leetCodeSubmissionProvider,
        leetCodeSolutionProvider,
        leetCodeExecutor,
        markdownEngine,
        codeLensController,
        explorerNodeManager,
        vscode.window.registerFileDecorationProvider(leetCodeTreeItemDecorationProvider),
        vscode.window.createTreeView("leetCodeStudyPlanExplorer", { treeDataProvider: leetCodeTreeDataProvider, showCollapseAll: true }),
        registerRemote("leetcodeStudyPlan.deleteCache", () => cache.deleteCache()),
        registerRemote("leetcodeStudyPlan.toggleLeetCodeCn", () => plugin.switchEndpoint()),
        registerRemote("leetcodeStudyPlan.signin", () => leetCodeManager.signIn()),
        vscode.commands.registerCommand("leetcodeStudyPlan.signout", () => leetCodeManager.signOut()),
        registerRemote("leetcodeStudyPlan.manageSessions", () => session.manageSessions()),
        registerRemote("leetcodeStudyPlan.previewProblem", (input?: LeetCodeNode | vscode.Uri) => show.previewProblem(input)),
        registerRemote("leetcodeStudyPlan.openCurrentDescription", () => show.previewProblem()),
        registerRemote("leetcodeStudyPlan.showProblem", (node: LeetCodeNode) => show.showProblem(node)),
        registerRemote("leetcodeStudyPlan.pickOne", () => show.pickOne()),
        registerRemote("leetcodeStudyPlan.searchProblem", () => show.searchProblem()),
        registerRemote("leetcodeStudyPlan.showSolution", (input: LeetCodeNode | vscode.Uri) => show.showSolution(input)),
        registerRemote("leetcodeStudyPlan.refreshExplorer", () => leetCodeTreeDataProvider.refresh()),
        registerRemote("leetcodeStudyPlan.testSolution", (uri?: vscode.Uri) => {
            TrackData.report({
                event_key: `vscode_runCode`,
                type: "click",
                extra: JSON.stringify({
                    path: uri?.path,
                }),
            });
            return test.testSolution(uri);
        }),
        registerRemote("leetcodeStudyPlan.submitSolution", (uri?: vscode.Uri) => {
            TrackData.report({
                event_key: `vscode_submit`,
                type: "click",
                extra: JSON.stringify({
                    path: uri?.path,
                }),
            });
            return submit.submitSolution(uri);
        }),
        vscode.commands.registerCommand("leetcodeStudyPlan.switchDefaultLanguage", () => switchDefaultLanguage()),
        registerRemote("leetcodeStudyPlan.addFavorite", (node: LeetCodeNode) => star.addFavorite(node)),
        registerRemote("leetcodeStudyPlan.removeFavorite", (node: LeetCodeNode) => star.removeFavorite(node)),
        registerRemote("leetcodeStudyPlan.problems.sort", () => plugin.switchSortingStrategy())
    );

    context.subscriptions.push(
        { dispose: () => leetCodeManager.removeListener("statusChanged", statusChanged) },
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("leetcodeStudyPlan.nodePath") || event.affectsConfiguration("leetcodeStudyPlan.useWsl") || event.affectsConfiguration("leetcodeStudyPlan.endpoint")) {
                cli.invalidate();
                remote.invalidate();
            }
        }),
        vscode.window.registerUriHandler({ handleUri: async (uri) => { await ensureRemote(); await leetCodeManager.handleUriSignIn(uri); } })
    );
    return { ...dailyPlan, timers, personalLists };
}

export function deactivate(): void {
    // Do nothing.
}
