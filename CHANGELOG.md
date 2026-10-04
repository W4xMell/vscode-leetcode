# Changelog

Notable changes to LeetCode Study Plan are recorded here. Versions follow the extension manifest; changes are grouped by behavior.

## [0.2.1] - 2026-10-05

### Added

- Tag-triggered GitHub Release and Marketplace uploads using the same tested VSIX, with version checks, SHA-256 checksums, and source metadata.
- A manual release workflow for an existing version tag and a pinned local publish command.

### Fixed

- Match browser authorization callbacks and installation documentation to the registered Marketplace publisher, `Mafty43211`.

## [0.2.0] - 2026-10-04

### Added

- Reopen the current problem description from the command palette, editor title, or Description CodeLens while preserving code focus.
- Subscribe to ordinary LeetCode lists created by the signed-in user, preserve author order, retain valid cached data after failed refreshes, and track manual completion per workspace/account/list/problem.
- Run independent problem and group timers with manual controls, one-time expiry notifications, overtime, saved membership/order, and paused recovery.
- Build and install the current source version with `npm run install:extension`, including CLI/profile overrides and failure reporting.
- Dismiss the Personal Lists hint from the view toolbar and persist the preference.

### Changed

- Stop timer heartbeats while idle or paused, coalesce pending persistence snapshots, and update status bars only when their content changes.
- Debounce `PLAN.md` progress changes without reloading the plan structure; bound refresh work to one running and one pending request.
- Initialize CLI requirements and login state on first online use, reuse concurrent initialization, and reinitialize after relevant configuration changes.
- Consolidate documentation into bilingual READMEs and a plan/development guide with next-version performance TODOs.

### Fixed

- Preserve special display IDs throughout parsing, previews, template generation, CLI lookup, testing, and submission arguments.
- Clear in-memory credentials on logout and isolate personal lists/timers across accounts, including in-flight requests.
- Use current source membership for new timer attempts while retaining the scope of saved sessions; reject new attempts from removed sources.
- Pause the previous problem timer when switching between known local exercise editors.

## [0.1.0] - Standalone extension

### Added

- Independent extension ID, command/settings namespaces, views, authorization callback, and CLI data directory.
- Separate English and Chinese READMEs and a development guide.
- English difficulty labels with compatibility for imported Chinese plans.
- Identity, cache isolation, and coexistence checks.

## Earlier fork history

### [0.18.6] - Workspace study plans

- Added workspace JSON plans, native preview and Code Now, plan selection, manual Markdown completion, optional source links, and local exercises.
- Added portable example fixtures, native VS Code host tests, and CI VSIX artifacts.

Earlier upstream changes are documented in the [vscode-leetcode changelog](https://github.com/LeetCode-OpenSource/vscode-leetcode/blob/master/CHANGELOG.md).
