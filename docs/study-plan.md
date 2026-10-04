# Study plan format and development

[README](../README.md) · [Chinese README](../README.zh-CN.md) · [Changelog](../CHANGELOG.md)

## Workspace plan format

```text
practice-workspace/
  data/custom-plan.json
  PLAN.md
  practice/unique.ts
  solutions/
```

The extension reads `data/custom-plan.json` by default. If that default file is missing, it falls back to `data/notion-plan.json`. Set `leetcodeStudyPlan.dailyPlan.path` or use **Select Study Plan JSON** to choose a workspace-relative file. A multi-root workspace uses the first matching folder, with a folder selected through the picker taking precedence.

The root object contains a `days` array. Each Day represents an ordered group of practice entries:

| Field | Type | Requirement |
| --- | --- | --- |
| `day` | Integer | Positive and unique across groups |
| `title` | String | Required display title |
| `problems` | Array | Required ordered entries |
| `sourceUrl` | String | Optional HTTPS source |
| `algorithmSourceUrl` | String | Optional HTTPS explanation |

Each practice entry uses the following fields:

| Field | Type | Requirement |
| --- | --- | --- |
| `order` | Integer | Positive and unique within its group |
| `title` | String | Required display title |
| `kind` | String | `leetcode` or `custom` |
| `leetcodeId` | Integer or string | Required for `leetcode`; positive numeric ID or a supported display ID such as `LCP 01`, `LCR 001`, or `Interview 01.01` |
| `difficulty` | String | Required for `leetcode`; `Easy`, `Medium`, or `Hard`; imported Chinese labels are accepted |
| `solutionPath` | String | Required for `custom`; relative path to an existing workspace template |
| `paidOnly` | Boolean | Optional Premium marker |
| `previousDays` | Integer array | Optional review group references |
| `note` | String | Optional practice annotation |
| `sourceUrl` | String | Optional HTTPS source |

The problem's own source link takes precedence over its group's explanation link and source link. Paths must remain inside the workspace. Local exercises open their existing templates and do not use LeetCode template generation or submission.

```json
{
  "days": [
    {
      "day": 1,
      "title": "Arrays and local practice",
      "problems": [
        { "order": 1, "title": "Two Sum", "kind": "leetcode", "leetcodeId": 1, "difficulty": "Easy" },
        { "order": 2, "title": "Remove duplicates", "kind": "custom", "solutionPath": "practice/unique.ts" }
      ]
    }
  ]
}
```

See [examples/custom-plan](../examples/custom-plan) for a complete workspace. Invalid plan updates leave the last successfully loaded view intact and display an error until recovery.

## Progress format

Create `PLAN.md` in the workspace root. A `## Day N` heading and numbered checkbox identify each practice occurrence:

```markdown
## Day 1 - Arrays

- [ ] 1. Two Sum
- [x] 2. Remove duplicates
```

Completion is keyed by `(day, order)`. Repeated LeetCode IDs may share a solution file while keeping separate completion records. Toggling completion changes only the checkbox character; CRLF and unsaved editor changes are supported. Missing progress entries do not prevent browsing or Code Now, but must be created before completion can be updated.

`PLAN.md` changes are debounced for 150 ms and update progress without rebuilding JSON groups or timer sources. Plan/configuration/workspace changes refresh the structure. A refresh queue retains one running request and at most one pending request; a structural refresh subsumes a progress-only refresh. Invalid progress preserves the previous valid completion state and recovers after correction.

## State and behavior contracts

A LeetCode problem is identified by its site and display ID. A practice entry is one occurrence of practicing a problem or local exercise. Practice completion is a learner's confirmation, separate from historical accepted submissions.

Personal-list membership and author order belong to the website. Local subscriptions and manual completion belong to the extension. Catalog queries include only lists created by the signed-in user and exclude smart lists. An incomplete catalog is rejected. Problem pagination must complete successfully before replacing cached data; duplicate, missing, or changing pages retain the last valid list.

Personal lists are cached by site/account. Subscriptions, completion records, and timer state are scoped to the workspace. Personal completion keys also include the list slug and stable internal problem ID. Account changes hide the previous account's lists, pause its clocks, and discard its in-flight responses.

A group session captures membership and order when started. Refreshing a Day or website list changes the source for a new attempt; it never rewrites an existing session. A newly added source member may have a separate problem timer outside that saved group. Resuming/restoring a session preserves its original scope; starting a new attempt uses the latest available source and fails if that source was removed.

Elapsed time comes from wall-clock samples, independent of heartbeat cadence. Switching problems pauses the previous problem clock; a running group continues. Expiry notifies once and counts overtime. Idle/paused timers have no interval. Running timers checkpoint every second; slow storage keeps only the latest pending write and snapshots when it can write. Reloads restore paused clocks and exclude offline time.

## Runtime isolation and initialization

The extension ID is `W4xMell.vscode-leetcode-study-plan`; commands and settings use `leetcodeStudyPlan.*`. Extension state, views, and authorization callbacks are separate from the upstream extension.

`scripts/study-plan-cli.js` wraps `vsc-leetcode-cli` and redirects its data directory to `~/.leetcode-study-plan/`. First-run cleanup affects only that directory. `scripts/cli-compat.js` preserves full display IDs and resolves site-internal IDs for the bundled CLI. Existing `@lc` metadata and code boundary markers remain compatible with standard solution files.

Activation registers local views and commands without checking the CLI environment. First online use initializes requirements, configures the endpoint, and restores login state. Concurrent callers share initialization; failed initialization can be retried. Node path, WSL, and endpoint configuration changes invalidate the result and serialize subsequent initialization. Local plans, local exercise opening, progress updates, timer controls, and hint dismissal do not require online initialization.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/dailyPlan/` | Plan validation, progress parsing, tree view, picker, file watching, and local/online opening |
| `src/personalLists/` | Website GraphQL queries, catalog/pagination validation, caches, subscriptions, and completion |
| `src/timer/` | Deterministic clock transitions, session snapshots, status bars, and persistence |
| `src/utils/LazyInitialization.ts` | Shared initialization, retries, and invalidation |
| `src/utils/RefreshQueue.ts` | Bounded refresh scheduling and priority |
| `src/extension.ts` | Command registration and runtime lifecycle |
| `scripts/study-plan-cli.js`, `scripts/cli-compat.js` | Isolated CLI data and display-ID compatibility |
| `scripts/install-extension.js` | Install the repository's matching VSIX through the VS Code CLI |
| `examples/custom-plan/` | Portable fixtures for documentation and tests |

## Development and verification

Use Node.js 22. Install dependencies, then run the release checks:

```sh
npm ci
npm test
npm run lint
npm run build
```

`npm test` compiles TypeScript and runs Node tests for format/identity/isolation, credentials, CLI arguments, installer behavior, list pagination, timer transitions, editor changes, refresh coalescing, and lazy initialization. Tests use temporary or mocked boundaries; they do not submit solutions or install into the user's editor.

For native VS Code integration, run:

```sh
npm run test:host
```

Host tests require an installed VS Code CLI and graphical session. Set `VSCODE_EXECUTABLE` to specify the CLI. They create a temporary workspace/profile, stub network/CLI boundaries, and exercise the actual activation, tree views, preview, Code Now, editor focus, CodeLens, completion, plan selection, account isolation, and timer controls.

CI runs tests, lint, and packaging on Linux and Windows; it uploads VSIX artifacts. Packaging uses `@vscode/vsce` 4.0.0. To test changes manually, run `npm run install:extension` and reload VS Code. The installer builds first, uses the manifest's VSIX filename, passes arguments without a shell, and defaults to forced installation. See the [README](../README.md#requirements-and-installation) for CLI/profile options.

Before submitting, keep English and Chinese READMEs consistent, update the changelog, and verify local Markdown links. Commit source, tests, fixtures, and documentation; dependencies, compiled `out/`, VSIX files, and personal credentials stay out of Git.

## Verification limits

Automated host tests simulate website and CLI responses. Anonymous China-site public list queries have been checked; authenticated own/private lists, global-site equivalents, actual Test/Submit, and Windows/WSL still require live-environment verification. Local progress does not synchronize to Notion or infer completion from account history.

## Next-version TODO

Deferred Markdown/highlighting loading and hidden Webview memory work are tracked in the [project workflow and TODO plan (Chinese)](project-workflow.zh-CN.md). That document also defines the proposed contribution, release, and CI/CD process. These workflows and repository rules remain planned until their implementation tasks are completed.
