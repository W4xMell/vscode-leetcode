# 自定义题单

这个独立插件 在独立的 LeetCode Study Plan 侧边栏中增加「Study Plans」。标准题复用原插件的题目预览、Code Now、语言模板、Test 和 Submit；本地练习打开工作区中的模板文件。

## 开始使用

1. 将 `examples/custom-plan/` 下的内容复制到练习工作区。工作区根目录应有 `data/custom-plan.json`、`PLAN.md` 和 `practice/`。
2. 打开 LeetCode 侧边栏，展开「Study Plans」。点击题目打开原生预览，再点击 Code Now。
3. 通过原插件选择站点和语言，并登录力扣账号。获取题干、模板、测试和提交需要网络及账号；题单本身可以离线查看。
4. 完成练习后，右键题目选择「Toggle Practice Completion」。进度写入工作区根目录的 `PLAN.md`。

已有题单可以通过视图顶部的文件夹图标或命令「LeetCode Study Plan: Select Study Plan JSON」选择。文件必须位于工作区内；选择成功后写入工作区设置 `leetcodeStudyPlan.dailyPlan.path`。也可以直接设置该相对路径。多根工作区默认显示首个包含有效题单的文件夹；选择文件后优先显示该文件所在的工作区文件夹。

默认路径为 `data/custom-plan.json`。默认文件不存在时，兼容读取 `data/notion-plan.json`。文件、工作区或设置变化会刷新视图；JSON 格式错误时显示错误并保留上一次成功读取的题单。

## 题单格式

```json
{
  "days": [
    {
      "day": 1,
      "title": "Day 1 · 数组",
      "problems": [
        {
          "order": 1,
          "title": "两数之和",
          "kind": "leetcode",
          "leetcodeId": 1,
          "difficulty": "简单"
        },
        {
          "order": 2,
          "title": "数组去重练习",
          "kind": "custom",
          "solutionPath": "practice/unique.ts"
        }
      ]
    }
  ]
}
```

`day` 和 `order` 是正整数，用于标识分组及组内练习；不得重复。`title` 是显示标题，可以按日期、专题或复习阶段命名。

标准题使用 `kind: "leetcode"`、整数 `leetcodeId` 和 `difficulty`（`Easy`、`Medium`、`Hard`，兼容中文难度）。可附加 `paidOnly` 标记会员题、`previousDays` 标记复习，以及 `note` 说明练习要求。标准题文件路径和编程语言由原插件设置控制，不需要 `solutionPath`。

本地练习使用 `kind: "custom"` 和工作区内的 `solutionPath`；打开前需要创建模板。这类练习不调用力扣模板生成或提交接口。

Day 可附加 `sourceUrl`、`algorithmSourceUrl`，题目也可附加 `sourceUrl`。这些链接是可选的，必须是有效的 HTTPS URL。右键「Open Source Link」会打开链接；题目优先使用自己的来源，再使用所在 Day 的解析或来源链接。

## 完成记录

工作区根目录的 `PLAN.md` 使用以下格式：

```markdown
## Day 1 · 数组

- [ ] 1. 两数之和
- [ ] 2. 数组去重练习
```

每项通过 Day 编号和条目序号关联题单。切换完成状态只修改对应勾选框的一个字符，保留其他文本；直接编辑勾选框也会更新视图。同一题在不同分组中共享解题文件，完成记录分别保存。

没有 `PLAN.md` 时仍可查看题单和做题。标记完成需要先创建对应条目。完成记录由用户手动确认，不从账号历史通过记录或代码文件推断。

Notion 页面可以先导出或整理成上述 JSON，并保留来源链接。这个版本不会访问 Notion API，不自动同步页面，也不回写完成状态。

## 构建与安装

开发与打包使用 Node.js 22：

```sh
git clone https://github.com/W4xMell/vscode-leetcode-study-plan.git
cd vscode-leetcode-study-plan
npm ci
npm test
npm run lint
npm run build
code --install-extension vscode-leetcode-study-plan-0.1.0.vsix --force
```

安装后执行 `Developer: Reload Window`。扩展使用独立标识 `W4xMell.vscode-leetcode-study-plan`，可以与原版同时安装。命令与设置使用 `leetcodeStudyPlan.*`，账号和 CLI 缓存位于 `~/.leetcode-study-plan/`，需要单独登录。此插件尚未发布到 VS Code Marketplace。

## 开发与验证

- `src/dailyPlan/model.ts`：JSON 校验、Markdown 进度解析、原插件题目参数和工作区路径校验。
- `src/dailyPlan/DailyPlanProvider.ts`：题单树、选择文件、刷新、原生题目打开与进度写入。
- `src/extension.ts`、`package.json`：插件激活、原容器中的新视图、命令和设置。
- `examples/custom-plan/`：独立示例，测试不依赖个人 Notion 数据或相邻练习仓库。

`npm test` 编译源码并运行模型测试。`npm run test:host` 需要本机安装 VS Code、`code` 命令及图形环境；可用 `VSCODE_EXECUTABLE` 指定 CLI 路径。测试建立隔离的临时工作区和用户配置，只替换网络/CLI 边界，验证原生预览、Code Now、Test/Submit CodeLens、完成状态往返、本地练习和无效题单恢复。它不提交解法。

GitHub Actions 在 Linux、Windows 上执行安装、编译、模型测试、Lint 和打包，并上传 VSIX 构建产物。扩展宿主测试在本机单独执行。
