# LeetCode Study Plan

独立的 VS Code 力扣练习插件。通过工作区 JSON 定义题单，在侧边栏按顺序练习，并使用原插件的 Code Now、测试和提交流程。

[English](README.md) · [题单格式与开发说明](docs/daily-plan.zh-CN.md) · [示例工作区](examples/custom-plan)

本项目基于 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 开发，保留原有解题流程和 MIT 许可，使用独立的扩展标识、配置及缓存。

## 功能

- 在独立的 LeetCode Study Plan 侧边栏中按分组显示题单。
- 选择工作区内的 JSON 文件，并在题单变化后自动刷新。
- 复用原生题目预览、Code Now、语言模板、测试和提交。
- 将每次练习的完成记录保存到 `PLAN.md`；同一题的复习记录分别保存。
- 打开可选的来源链接，或在本地模板中练习自定义变式。
- 离线查看题单，并兼容已导入的 `data/notion-plan.json` 快照。

## 安装

当前通过 VSIX 安装，尚未发布到 VS Code Marketplace。可从成功的 [GitHub Actions 构建](https://github.com/W4xMell/vscode-leetcode-study-plan/actions) 下载 VSIX 产物，也可以本地构建：

```sh
git clone https://github.com/W4xMell/vscode-leetcode-study-plan.git
cd vscode-leetcode-study-plan
npm ci
npm test
npm run lint
npm run build
code --install-extension vscode-leetcode-study-plan-0.1.0.vsix
```

开发与打包使用 Node.js 22。插件需要 VS Code 1.57 或更新版本，以及可访问的 Node.js。安装后执行 `Developer: Reload Window`。

## 开始做题

1. 将 `examples/custom-plan/` 下的内容复制到练习工作区。
2. 打开活动栏的 LeetCode Study Plan，展开 Study Plans。
3. 执行 `LeetCode Study Plan: Switch Endpoint` 和 `LeetCode Study Plan: Switch Default Language` 选择站点与语言。需要账号的操作先执行 `LeetCode Study Plan: Sign In`。
4. 点击题目打开预览，再点击 Code Now；题目行右侧的代码图标也可直接打开解题文件。
5. 在 `@lc code=start` 与 `@lc code=end` 之间实现解法，使用代码上方的 `Study Plan: Test` 和 `Study Plan: Submit`。
6. 右键题目选择 Toggle Practice Completion，保存本次完成记录。

通过题单视图顶部的文件夹按钮或 `LeetCode Study Plan: Select Study Plan JSON` 选择工作区内的其他题单。默认读取 `data/custom-plan.json`；该文件不存在时兼容读取 `data/notion-plan.json`。

## 题单与进度

```json
{
  "days": [
    {
      "day": 1,
      "title": "Day 1 · 数组",
      "problems": [
        { "order": 1, "title": "两数之和", "kind": "leetcode", "leetcodeId": 1, "difficulty": "Easy" }
      ]
    }
  ]
}
```

在工作区根目录创建对应的 `PLAN.md`：

```markdown
## Day 1 · 数组

- [ ] 1. 两数之和
```

分组编号和题目序号标识每次练习；标题可以表示学习日期、专题或复习阶段。同一题共享解题文件，完成记录分别保存。难度支持 `Easy`、`Medium`、`Hard`，也兼容旧快照中的中文难度。

## 独立插件与配置

| 项目 | 标识或位置 |
| --- | --- |
| 扩展 ID | `W4xMell.vscode-leetcode-study-plan` |
| 命令与设置 | `leetcodeStudyPlan.*` |
| 侧边栏容器 | `leetcode-study-plan` |
| 题库与题单视图 | `leetCodeStudyPlanExplorer`、`leetCodeStudyPlanDailyPlan` |
| CLI 账号、配置与缓存 | `~/.leetcode-study-plan/` |
| 默认解题目录 | `~/.leetcode-study-plan-solutions/` |

可以与原版插件同时安装。本地 VSIX 不会替换 `LeetCode.vscode-leetcode`，不读取或删除原插件的 CLI 缓存，也不复用其用户设置。需要在独立插件中单独登录；网页授权回调使用新的扩展 ID，同时保留 Cookie 登录入口。

两个插件都能识别标准 `@lc` 解题文件，可能同时显示编辑器操作。独立插件的 Test、Submit 带有 Study Plan 前缀，用于区分操作来源。

在 VS Code 用户设置中配置独立插件，例如：

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

找不到 Node.js 时设置 `leetcodeStudyPlan.nodePath`。`leetcodeStudyPlan.dailyPlan.path` 是工作区设置；多数继承的运行配置仍需写入用户设置。

## 验证与限制

`npm test` 验证题单、完成记录、独立扩展标识和 CLI 缓存隔离。`npm run test:host` 在隔离的 VS Code 配置中验证预览、Code Now、CodeLens、进度写入、题单切换与旧快照兼容；需要 `code` 命令和图形环境，可通过 `VSCODE_EXECUTABLE` 指定 CLI 路径。

GitHub Actions 在 Linux、Windows 上编译、测试、Lint 和打包，并上传 VSIX 产物。题单可以离线查看；题目获取、测试、提交需要网络和账号，会员题以账号权限为准。

题单是本地文件，不自动同步 Notion 页面，也不回写完成记录。完成状态由用户手动确认，不根据历史通过记录推断。

## 来源与许可

基于 [vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 及其 `vsc-leetcode-cli` 依赖，保留原作者版权声明和 [MIT 许可](LICENSE)。第三方依赖说明见 [thirdpartynotice.txt](thirdpartynotice.txt)。
