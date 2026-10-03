# LeetCode Study Plan

[![CI](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml/badge.svg)](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml)

A standalone VS Code extension for solving LeetCode problems from custom study plans. Organize problems in a workspace JSON file, open a problem from the sidebar, and use the familiar **Code Now**, **Test**, and **Submit** workflow.

[Chinese documentation](README.zh-CN.md) · [Plan format and development guide](docs/study-plan.md) · [Example workspace](examples/custom-plan)

This project is a fork of [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode). It preserves the upstream problem-solving workflow and MIT license while using its own extension identity and state.

## Features

- Ordered study groups in a dedicated **LeetCode Study Plan** sidebar.
- Workspace JSON selection and automatic refresh when the plan changes.
- Native problem previews, language templates, Code Now, testing, and submission.
- Per-practice completion checkboxes in `PLAN.md`, including separate review entries for repeated problems.
- Optional source links and local exercises that open workspace templates.
- Offline plan browsing and compatibility with imported `data/notion-plan.json` snapshots.

## Installation

The extension is distributed as a VSIX and has not been published to the VS Code Marketplace. Download a VSIX artifact from a successful [GitHub Actions run](https://github.com/W4xMell/vscode-leetcode-study-plan/actions), or build it locally:

```sh
git clone https://github.com/W4xMell/vscode-leetcode-study-plan.git
cd vscode-leetcode-study-plan
npm ci
npm test
npm run lint
npm run build
code --install-extension vscode-leetcode-study-plan-0.1.0.vsix
```

Use Node.js 22 for development and packaging. The extension requires VS Code 1.57 or later and an accessible Node.js executable at runtime. After installation, run **Developer: Reload Window**.

## Quick start

1. Copy the contents of [`examples/custom-plan/`](examples/custom-plan) into your practice workspace.
2. Open the **LeetCode Study Plan** activity bar entry, then expand **Study Plans**.
3. Run **LeetCode Study Plan: Switch Endpoint** and **LeetCode Study Plan: Switch Default Language** to select your site and language. Run **LeetCode Study Plan: Sign In** before account-dependent operations.
4. Click a problem to open its preview, then select **Code Now**. The code icon on a plan row also opens the solution directly.
5. Implement the solution between the generated `@lc code=start` and `@lc code=end` markers. Use **Study Plan: Test** and **Study Plan: Submit** above the code.
6. Right-click the plan entry and choose **Toggle Practice Completion** to update `PLAN.md`.

Use the folder button in the Study Plans view, or **LeetCode Study Plan: Select Study Plan JSON**, to choose another JSON file inside the workspace. Plans use `data/custom-plan.json` by default. If that file is absent, the extension falls back to `data/notion-plan.json`.

## Define a plan

```json
{
  "days": [
    {
      "day": 1,
      "title": "Day 1 - Arrays",
      "problems": [
        {
          "order": 1,
          "title": "Two Sum",
          "kind": "leetcode",
          "leetcodeId": 1,
          "difficulty": "Easy"
        }
      ]
    }
  ]
}
```

Create the corresponding progress entries in the workspace root:

```markdown
## Day 1 - Arrays

- [ ] 1. Two Sum
```

Group and problem numbers identify practice entries. Titles can describe days, topics, or review stages. Repeated LeetCode IDs share a solution file but keep separate completion records. See the [plan format guide](docs/study-plan.md) for local exercises and optional fields.

## Independent extension

| Component | Identifier or location |
| --- | --- |
| Extension ID | `W4xMell.vscode-leetcode-study-plan` |
| Commands and settings | `leetcodeStudyPlan.*` |
| Activity bar container | `leetcode-study-plan` |
| Problem and plan views | `leetCodeStudyPlanExplorer`, `leetCodeStudyPlanDailyPlan` |
| CLI account, configuration, and cache | `~/.leetcode-study-plan/` |
| Default solution directory | `~/.leetcode-study-plan-solutions/` |

The upstream extension can remain installed. This VSIX does not replace `LeetCode.vscode-leetcode`, reuse its settings, or read and delete its CLI cache. Sign in separately in this extension. Browser authorization uses this extension's callback ID; cookie login is also available.

Both extensions understand standard `@lc` solution files and may offer their own editor actions. This extension prefixes its Test and Submit CodeLens labels with **Study Plan** so the destination is clear.

Configure this extension through its own user settings. For example:

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

Use `leetcodeStudyPlan.nodePath` if VS Code cannot find Node.js. The plan path setting, `leetcodeStudyPlan.dailyPlan.path`, is workspace scoped; most upstream-derived runtime settings remain user scoped.

## Verification and limitations

`npm test` covers plan validation, progress parsing, extension identity, and CLI cache isolation. `npm run test:host` uses an isolated VS Code profile and tests previews, Code Now, CodeLens, progress updates, plan switching, and legacy snapshot compatibility. It requires the `code` CLI and a graphical environment; `VSCODE_EXECUTABLE` can specify the executable path.

GitHub Actions runs compilation, tests, linting, and VSIX packaging on Linux and Windows, then uploads build artifacts. Plans can be browsed offline; problem retrieval, testing, and submission require network access and the appropriate account permissions. Premium problems depend on your account subscription.

Plans are local files. The extension does not synchronize with Notion or write progress back to source pages. Completion is recorded manually rather than inferred from account history.

## Attribution

Based on [vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) and its bundled `vsc-leetcode-cli` dependency. Original copyright notices and the [MIT license](LICENSE) are retained. See [thirdpartynotice.txt](thirdpartynotice.txt) for dependency notices.
