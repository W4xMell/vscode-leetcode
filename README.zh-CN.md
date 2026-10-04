# LeetCode Study Plan

[![CI](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml/badge.svg)](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml)

独立的 VS Code 力扣练习插件，支持工作区自定义题单、网站自建题单，以及单题和整组计时。通过侧边栏预览题目，使用 Code Now 生成解题文件，再从编辑器测试和提交。

[English](README.md) · [题单格式与开发指南](docs/study-plan.md) · [版本变更](CHANGELOG.md) · [项目流程与 TODO](docs/project-workflow.zh-CN.md) · [示例工作区](examples/custom-plan)

## 功能

| 功能 | 行为 |
| --- | --- |
| 工作区题单 | JSON 有序分组、本地练习、来源链接，以及 `PLAN.md` 手动完成记录 |
| 网站自建题单 | 普通自建题单、作者顺序、账号隔离缓存，以及工作区完成记录 |
| 题目描述 | 在代码旁重新打开当前题目描述，保留编辑器焦点 |
| 做题计时 | 单题与整组独立计时、暂停与恢复、超时累计，以及会话范围保存 |
| 解题流程 | 原生预览、语言模板、Code Now、Test、Submit，以及 LCP 等完整显示题号 |
| 本地使用 | 本地题单、练习和计时器可直接使用；在线功能首次使用时初始化 CLI |

## 环境要求与安装

需要 **VS Code 1.57 或更新版本**，以及可访问的 Node.js。开发和打包使用 **Node.js 22**。VS Code 找不到 Node.js 时，设置 `leetcodeStudyPlan.nodePath`。

从源码安装：

```sh
git clone https://github.com/W4xMell/vscode-leetcode-study-plan.git
cd vscode-leetcode-study-plan
npm ci
npm run install:extension
```

修改源码后，重新运行 `npm run install:extension`。命令会构建新的 VSIX，再通过 VS Code CLI 使用 `--force` 覆盖安装；构建失败时停止安装。安装完成后，执行 `Developer: Reload Window`。

安装命令默认调用 `code`。指定其他 CLI 或配置文件：

```sh
npm run install:extension -- --code code-insiders
npm run install:extension -- --code "/absolute/path with spaces/bin/code"
npm run install:extension -- --profile "Practice"
```

也可通过 `VSCODE_EXECUTABLE` 指定 CLI。脚本支持 `--extensions-dir`、`--user-data-dir` 和 `--no-force`。macOS 找不到 `code` 时，在 VS Code 命令面板执行 `Shell Command: Install 'code' command in PATH`。

仅构建安装包时，执行 `npm run build`。通过 `Extensions: Install from VSIX...` 安装生成的 `.vsix`，或从 [GitHub Actions](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/workflows/build.yml) 下载 VSIX 构建产物。也可从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Mafty43211.vscode-leetcode-study-plan) 安装正式版本。

## 开始练习

1. 将 [examples/custom-plan](examples/custom-plan) 下的内容复制到练习工作区，在 VS Code 中打开该文件夹。
2. 打开活动栏的 LeetCode Study Plan，展开 Study Plans。
3. 使用在线题目时，按需执行 `LeetCode Study Plan: Switch Endpoint`、`Switch Default Language` 和 `Sign In`。账号需要在本插件中单独登录。
4. 点击题目打开预览，再选择 Code Now。题目行的代码操作可直接打开解题文件；本地练习打开已有工作区模板。
5. 在 `@lc code=start` 与 `@lc code=end` 之间编写解法，使用代码上方的 `Study Plan: Test` 和 `Study Plan: Submit`。
6. 右键题目，选择 `Toggle Practice Completion`，更新 `PLAN.md`。

默认读取 `data/custom-plan.json`；默认文件不存在时，兼容读取 `data/notion-plan.json`。通过 `Select Study Plan JSON` 或 `leetcodeStudyPlan.dailyPlan.path` 选择工作区内的 JSON 文件。创建题单时，参考[题单格式](docs/study-plan.md#workspace-plan-format)。

## 网站自建题单

登录后展开 Personal LeetCode Lists，使用 Add Personal LeetCode List 选择自己创建的普通题单。展开题单时刷新，也可手动刷新。网站维护题目成员和作者顺序；刷新失败保留最后一次有效数据，并显示 Cached 标记及更新时间。插件不定时轮询网站。

完成记录由用户手动确认，按工作区、站点、账号、题单和稳定的题目内部 ID 保存。调整顺序、删题后重新加入，不改变历史记录归属。Remove Local List Subscription 只移除本地订阅，保留网站题单及练习历史。换账号后隐藏旧账号题单，并暂停其题单计时。

首次使用提示可通过视图工具栏关闭，关闭偏好跨窗口保留。本版本支持普通自建题单；智能筛选题单、收藏的他人题单和官方学习计划不在支持范围内。

## 计时与题目描述

右键 Day 或网站题单，启动整组计时；选择题目后，通过状态栏的 Problem Timer 启动独立单题计时。打开条目不会自动开始计时。默认**单题 30 分钟、整组 120 分钟**，可在开始时修改，或通过计时设置调整。

状态栏提供开始、暂停、恢复和重置操作。切换题目时，包括切换已识别的本地练习编辑器，暂停上一题的计时，整组继续运行。开始另一题组时，暂停原题组及其单题计时。到零只提醒一次，之后继续累计超时。Reset 只影响计时状态。

整组会话保留开始时的成员和顺序。新一轮使用最新题单；继续或恢复旧会话时保留原范围。Restore saved group 将旧会话恢复为暂停状态，Open session problem 可打开原范围中的题目。重载后需手动 Resume。运行中每秒保存检查点，空闲或全部暂停时停止心跳；异常退出可能丢失最后一次成功保存之后的耗时，关闭窗口期间不累计。

解题文件处于活动状态时，执行 `LeetCode Study Plan: Open Current Problem Description`，点击标题栏的书本图标，或使用 Description CodeLens。描述在代码右侧复用已有标签页，键盘焦点保留在代码。已有自定义快捷设置缺少该入口时，在 `leetcodeStudyPlan.editor.shortcuts` 中加入 `description`。

## 配置与账号隔离

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

| 设置 | 用途与默认值 |
| --- | --- |
| `leetcodeStudyPlan.dailyPlan.path` | 工作区相对路径；默认 `data/custom-plan.json` |
| `leetcodeStudyPlan.nodePath` | 运行时 Node.js 路径；默认 `node` |
| `leetcodeStudyPlan.timer.problemMinutes` | 单题时长；默认 `30` 分钟 |
| `leetcodeStudyPlan.timer.groupMinutes` | 整组时长；默认 `120` 分钟 |
| `leetcodeStudyPlan.editor.shortcuts` | 编辑器操作；默认 `submit`、`test`、`description` |

扩展 ID 为 `Mafty43211.vscode-leetcode-study-plan`，命令与设置使用 `leetcodeStudyPlan.*`。CLI 账号、配置和缓存保存在 `~/.leetcode-study-plan/`，默认解题目录为 `~/.leetcode-study-plan-solutions/`。可以与原版插件同时安装，设置、凭据和缓存分别保存。支持网页授权及 Cookie 登录。

## 开发与使用限制

提交变更前，执行 `npm test`、`npm run lint` 和 `npm run build`。`npm run test:host` 还需要 VS Code CLI 和图形环境；测试使用隔离工作区与用户配置，并模拟网络和 CLI 响应。CI 在 Linux 和 Windows 上运行测试、lint 和打包。源码职责、验证说明及下版本 TODO 见[开发指南](docs/study-plan.md#development-and-verification)。

本地题单可以离线使用。在线题目描述、模板、测试和提交需要网络；账号权限和会员限制仍适用。完成记录需手动确认，不自动同步 Notion，也不向来源页面回写进度。

中国站公开题单请求已匿名核对。真实账号私有题单、全球站对应接口、实际 Test／Submit，以及 Windows／WSL 行为仍需真实环境验收。自建题单目录返回不完整时，插件报错，避免静默导入部分目录。

问题反馈使用 [GitHub Issues](https://github.com/W4xMell/vscode-leetcode-study-plan/issues)，附扩展和 VS Code 版本、站点、相关设置、复现步骤及输出日志；提交前移除凭据。

## 许可与致谢

基于 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 及其 `vsc-leetcode-cli` 依赖，保留原作者版权声明、[MIT 许可](LICENSE)、[贡献者致谢](ACKNOWLEDGEMENTS.md)和[第三方依赖声明](thirdpartynotice.txt)。
