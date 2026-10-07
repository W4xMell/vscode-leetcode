// Licensed under the MIT license.

import * as vscode from "vscode";

// Local practice history belongs to the workspace, independent of the signed-in account.
export class LocalSubmissionStore implements vscode.Disposable {
    private state: vscode.Memento | undefined;
    private readonly changed = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.changed.event;

    public initialize(context: vscode.ExtensionContext): void { this.state = context.workspaceState; }

    public isAccepted(root: string, site: string, id: string): boolean {
        return this.state?.get<boolean>(this.key(root, site, id), false) === true;
    }

    public async recordAccepted(root: string, site: string, id: string): Promise<void> {
        if (!this.state || !id.trim() || this.isAccepted(root, site, id)) return;
        await this.state.update(this.key(root, site, id), true);
        this.changed.fire();
    }

    public dispose(): void { this.changed.dispose(); }

    private key(root: string, site: string, id: string): string {
        return `dailyPlan.localAC.${JSON.stringify([root, site, id.trim()])}`;
    }
}

export function isAcceptedSubmission(result: string): boolean {
    // Match the CLI verdict line, never an occurrence in stdout or an error message.
    const plain = result.replace(/\u001b\[[0-9;]*m/g, "");
    const verdict = plain.match(/^[ \t]*([√✔v×✘x])[ \t]+([^\r\n]*)/m);
    return Boolean(verdict && /^[√✔v]$/.test(verdict[1]) && /^Accepted$/i.test(verdict[2].trim()));
}

export const localSubmissionStore = new LocalSubmissionStore();
