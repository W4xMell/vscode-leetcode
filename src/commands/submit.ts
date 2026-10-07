// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";
import { getLeetCodeEndpoint } from "./plugin";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { isAcceptedSubmission, localSubmissionStore } from "../dailyPlan/LocalSubmissionStore";

export async function submitSolution(uri?: vscode.Uri): Promise<void> {
    if (!leetCodeManager.getUser()) {
        promptForSignIn();
        return;
    }

    const filePath: string | undefined = await getActiveFilePath(uri);
    if (!filePath) {
        return;
    }

    try {
        const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
        const site = getLeetCodeEndpoint();
        const id = root ? await getNodeIdFromFile(filePath) : undefined;
        const result: string = await leetCodeExecutor.submitSolution(filePath);
        leetCodeSubmissionProvider.show(result);
        if (root && id && isAcceptedSubmission(result)) {
            try { await localSubmissionStore.recordAccepted(root, site, id); } catch (error) {
                await vscode.window.showErrorMessage(`Submission accepted, but local progress could not be saved: ${error.message}`);
            }
        }
    } catch (error) {
        await promptForOpenOutputChannel("Failed to submit the solution. Please open the output channel for details.", DialogType.error);
        return;
    }

    await leetCodeTreeDataProvider.refresh();
}
