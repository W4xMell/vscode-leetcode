# LeetCode Study Plan

[![CI](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml/badge.svg)](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml)

A standalone VS Code extension for practicing LeetCode problems with workspace study plans, your own website lists, and problem/group timers. Preview a problem, generate a solution with **Code Now**, then test and submit from the editor.

[Chinese documentation](README.zh-CN.md) · [Plan format and development](docs/study-plan.md) · [Changelog](CHANGELOG.md) · [Project workflow (Chinese)](docs/project-workflow.zh-CN.md) · [Example workspace](examples/custom-plan)

## Features

| Feature | Behavior |
| --- | --- |
| Workspace study plans | Ordered JSON groups, local exercises, source links, and manual progress in `PLAN.md` |
| Personal LeetCode lists | Ordinary lists you created, author order, account-specific caching, and per-workspace completion |
| Problem descriptions | Reopen the current description beside the code while keeping editor focus |
| Timed practice | Separate problem/group clocks, pause/resume, overtime, and saved session scope |
| Problem workflow | Native previews, language templates, Code Now, Test, Submit, and full display IDs such as `LCP 01` |
| Local use | Browse local plans and use local exercises/timers without initializing the CLI; online features initialize on first use |

## Requirements and installation

Use VS Code **1.57 or later** and an accessible Node.js executable. Development and packaging use **Node.js 22**. Set `leetcodeStudyPlan.nodePath` if VS Code cannot find Node.js.

Install from source:

```sh
git clone https://github.com/W4xMell/vscode-leetcode-study-plan.git
cd vscode-leetcode-study-plan
npm ci
npm run install:extension
```

After editing source, run `npm run install:extension` again. It builds a fresh VSIX and installs it through the VS Code CLI with `--force`; a failed build stops installation. Run **Developer: Reload Window** after installation.

The command defaults to `code`. Select a different executable or profile with:

```sh
npm run install:extension -- --code code-insiders
npm run install:extension -- --code "/absolute/path with spaces/bin/code"
npm run install:extension -- --profile "Practice"
```

`VSCODE_EXECUTABLE` can also specify the CLI. The script accepts `--extensions-dir`, `--user-data-dir`, and `--no-force`. On macOS, enable `code` with **Shell Command: Install 'code' command in PATH**.

To build without installing, run `npm run build`. Install the resulting `.vsix` with **Extensions: Install from VSIX...**, or download a VSIX artifact from [GitHub Actions](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml). Install the published extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Mafty43211.vscode-leetcode-study-plan).

## Start practicing

1. Copy the contents of [examples/custom-plan](examples/custom-plan) into a practice workspace and open that folder in VS Code.
2. Open **LeetCode Study Plan** in the activity bar and expand **Study Plans**.
3. For online problems, run **LeetCode Study Plan: Switch Endpoint**, **Switch Default Language**, and **Sign In** as needed. Sign in separately in this extension.
4. Click a problem to preview it, then choose **Code Now**. The row's code action opens the solution directly. Local exercises open their existing workspace templates.
5. Write the solution between `@lc code=start` and `@lc code=end`. Use **Study Plan: Test** and **Study Plan: Submit** above the code.
6. Right-click a plan entry and select **Toggle Practice Completion** to update `PLAN.md`.

Plans default to `data/custom-plan.json`, with `data/notion-plan.json` as a fallback when the default file is absent. Use **Select Study Plan JSON** or `leetcodeStudyPlan.dailyPlan.path` to choose a workspace-relative file. See the [format guide](docs/study-plan.md#workspace-plan-format) to create a plan.

## Personal lists

Sign in, expand **Personal LeetCode Lists**, and use **Add Personal LeetCode List** to select an ordinary list you created. Expanding a list refreshes it; manual refresh is also available. The website controls membership and author order. Failed refreshes keep the last valid data and show **Cached** with its timestamp. There is no periodic polling.

Completion is manual and keyed by workspace, site, account, list, and stable internal problem ID. Reordering or removing and re-adding a problem preserves its history. **Remove Local List Subscription** removes the local subscription while retaining the website list and practice history. Account changes hide the previous account's lists and pause its personal timers.

Dismiss the introductory hint with its toolbar action; the preference persists across windows. Smart lists, lists collected from other authors, and official study plans are outside this version's scope.

## Timers and descriptions

Right-click a Day or personal list and start its group timer. Select a problem and use **Problem Timer** in the status bar to start its separate clock. Opening an entry does not start a timer. Defaults are **30 minutes per problem** and **120 minutes per group**, adjustable when starting or through timer settings.

The status bars provide start, pause, resume, and reset actions. Switching problems, including known local exercise editors, pauses the previous problem clock while the group continues. Starting another group pauses the old group and its problem clocks. At zero, one notification appears and overtime continues. Reset affects timers only.

Each group session captures its original members and order. A new attempt uses the latest source; resuming or restoring a saved session keeps its original scope. **Restore saved group** restores it paused, and **Open session problem** opens a captured member. Reloaded sessions stay paused until resumed. Running clocks save checkpoints every second; idle/paused clocks have no heartbeat. Abrupt termination may lose time since the last successful checkpoint, and closed-window time is excluded.

With a solution active, run **LeetCode Study Plan: Open Current Problem Description**, use the editor title book icon, or click **Description** CodeLens. The description tab is reused to the right while code keeps focus. If customized shortcuts omit this action, add `description` to `leetcodeStudyPlan.editor.shortcuts`.

## Configuration and isolation

```json
{
  "leetcodeStudyPlan.endpoint": "leetcode-cn",
  "leetcodeStudyPlan.defaultLanguage": "typescript",
  "leetcodeStudyPlan.workspaceFolder": "/absolute/path/to/practice",
  "leetcodeStudyPlan.filePath": {
    "default": { "folder": "solutions", "filename": "${id}.${ext}" }
  }
}
```

| Setting | Purpose / default |
| --- | --- |
| `leetcodeStudyPlan.dailyPlan.path` | Workspace-relative JSON / `data/custom-plan.json` |
| `leetcodeStudyPlan.nodePath` | Runtime Node.js executable / `node` |
| `leetcodeStudyPlan.timer.problemMinutes` | Problem allowance / `30` |
| `leetcodeStudyPlan.timer.groupMinutes` | Group allowance / `120` |
| `leetcodeStudyPlan.editor.shortcuts` | Editor actions / `submit`, `test`, `description` |

The extension ID is `Mafty43211.vscode-leetcode-study-plan`; commands and settings use `leetcodeStudyPlan.*`. CLI account/configuration/cache live in `~/.leetcode-study-plan/`, and the default solution directory is `~/.leetcode-study-plan-solutions/`. The upstream extension can remain installed: settings, credentials, and caches are separate. Browser authorization and Cookie login are supported.

## Development and limitations

Run `npm test`, `npm run lint`, and `npm run build` before submitting changes. `npm run test:host` additionally requires a VS Code CLI and graphical session; it creates an isolated workspace/profile and mocks network/CLI responses. CI runs tests, lint, and packaging on Linux and Windows. See [development and verification](docs/study-plan.md#development-and-verification) for source boundaries and the next-version TODO.

Local plans work offline. Fetching online descriptions/templates, testing, and submission require network access; account and Premium restrictions still apply. Completion is manual. There is no Notion API synchronization or progress write-back.

China-site public list queries have been checked anonymously. Authenticated private lists, global-site equivalents, live Test/Submit, and Windows/WSL behavior still need live-environment verification. An incomplete personal-list catalog is reported as an error rather than silently importing a partial catalog.

Report reproducible problems in [GitHub Issues](https://github.com/W4xMell/vscode-leetcode-study-plan/issues), including extension/VS Code versions, site, relevant settings, reproduction steps, and output logs with credentials removed.

## License and attribution

Based on [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) and its bundled `vsc-leetcode-cli` dependency. Original copyright notices, the [MIT license](LICENSE), [contributor acknowledgements](ACKNOWLEDGEMENTS.md), and [third-party notices](thirdpartynotice.txt) are retained.
