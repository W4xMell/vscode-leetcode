# Study plan format and development

[Back to README](../README.md)

## Workspace layout

```text
practice-workspace/
  data/custom-plan.json
  PLAN.md
  practice/unique.ts
  solutions/
```

The default plan is `data/custom-plan.json`. When that default file is missing, `data/notion-plan.json` is supported for existing imported plans. Set `leetcodeStudyPlan.dailyPlan.path` or use **Select Study Plan JSON** to choose another workspace-relative path. In a multi-root workspace, the first matching folder is used unless a folder has been selected through the plan picker.

## JSON fields

The root object contains a `days` array. Each group contains:

| Field | Required | Meaning |
| --- | --- | --- |
| `day` | Yes | Unique positive integer identifying the group |
| `title` | Yes | Display title for a day, topic, or review stage |
| `problems` | Yes | Ordered array of practice entries |
| `sourceUrl` | No | HTTPS source link for the group |
| `algorithmSourceUrl` | No | HTTPS explanation link for its problems |

Every problem has a unique positive `order` within the group, a `title`, and a `kind`:

- `leetcode`: requires a positive integer `leetcodeId` and `difficulty` (`Easy`, `Medium`, or `Hard`). Legacy Chinese difficulty labels from imported snapshots are also accepted.
- `custom`: requires `solutionPath`, pointing to an existing local exercise template inside the workspace. It does not use the LeetCode template or submission flow.

Optional fields include `paidOnly`, `previousDays`, `note`, and a per-problem HTTPS `sourceUrl`. Source links are optional. A problem's own link takes precedence over the group's explanation or source link.

```json
{
  "days": [
    {
      "day": 1,
      "title": "Arrays and Local Practice",
      "problems": [
        { "order": 1, "title": "Two Sum", "kind": "leetcode", "leetcodeId": 1, "difficulty": "Easy" },
        { "order": 2, "title": "Remove Duplicates", "kind": "custom", "solutionPath": "practice/unique.ts" }
      ]
    }
  ]
}
```

Invalid JSON or invalid entries do not replace the last successfully loaded view. The view displays the loading error and can recover when the file is corrected.

## Progress format

The workspace root `PLAN.md` identifies practices using a `## Day N` heading and numbered checkboxes:

```markdown
## Day 1 - Arrays

- [ ] 1. Two Sum
- [x] 2. Remove Duplicates
```

Completion updates replace only the checkbox character. CRLF files and unsaved editor changes are supported. Repeated problems use separate group/order keys. If the progress file or an entry is missing, problem browsing and Code Now remain available, but completion cannot be updated until the entry is created.

## Extension isolation

This extension uses `W4xMell.vscode-leetcode-study-plan`, `leetcodeStudyPlan.*` commands/settings, dedicated view IDs, and a separate URI callback. VS Code stores its extension state separately from the upstream extension.

`scripts/study-plan-cli.js` wraps the bundled `vsc-leetcode-cli` and redirects its home directory to `~/.leetcode-study-plan/`. This isolates CLI configuration, endpoint selection, account data, and caches without modifying the upstream package or overriding the user's home environment. First-run cleanup applies only to this extension's cache directory.

Sign in through **LeetCode Study Plan: Sign In**. Account sessions from another extension are not imported. The browser authorization callback targets this extension; the cookie login option remains available if web authorization is unavailable.

The standard `@lc` file metadata and code boundary markers are retained. Both extensions can work with these solution files. This extension labels its CodeLens actions **Study Plan: Test** and **Study Plan: Submit** to distinguish them from upstream actions.

## Implementation

- `src/dailyPlan/model.ts`: validation, progress parsing, workspace paths, and native problem parameters.
- `src/dailyPlan/DailyPlanProvider.ts`: tree view, JSON picker, file watching, native problem opening, and completion updates.
- `src/extension.ts`: standalone activation and command registration.
- `scripts/study-plan-cli.js`: isolated CLI state.
- `examples/custom-plan/`: portable example data for documentation and tests.

## Build and verify

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:host
```

Use Node.js 22 for development. Packaging uses the fixed official `@vscode/vsce` 4.0.0 version. `npm run test:host` additionally requires VS Code, the `code` command, and a graphical session. Set `VSCODE_EXECUTABLE` to use a different CLI path.

Host tests create a temporary workspace and VS Code profile. They stub network/CLI boundaries while using the actual activation, views, native preview, Code Now, editor, and CodeLens implementation. They verify command isolation from upstream IDs, progress updates, local exercises, plan selection by configuration, and legacy snapshot fallback. No solution is submitted.

CI builds on Linux and Windows, runs compilation/tests/linting, packages a VSIX, and uploads artifacts. A manual workflow dispatch is available for rebuilding the default branch.
