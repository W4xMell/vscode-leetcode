# 项目规范、TODO 与发布流程

[项目首页](../README.zh-CN.md) · [题单格式与开发指南](study-plan.md) · [版本记录](../CHANGELOG.md)

本文记录项目流程、已实现的自动上传入口和后续规划。标为「建议」或「待实施」的内容尚未配置到 GitHub；任务表记录实施顺序。仓库仍采用单维护者可以独立执行的流程。

## 1. 当前基线

源码版本为 `0.2.1`，默认开发分支为 `master`。[GitHub Release](https://github.com/W4xMell/vscode-leetcode-study-plan/releases/tag/v0.2.1) 已自动上传；维护者已确认 Marketplace 的 PAT 上传验证成功。

- [现有 CI](../.github/workflows/build.yml) 在推送 `master`、`codex/**`、向 `master` 提交 PR 或手动触发时运行。
- CI 使用 Node.js 22，在 Linux 和 Windows 上执行 `npm ci`、`npm test`、`npm run lint`、`npm run build`，并上传两个平台的 VSIX 构建产物。
- `aef5142` 的 [Linux 和 Windows 构建任务](https://github.com/W4xMell/vscode-leetcode-study-plan/actions/runs/37197524432) 均已通过。此结果不替代真实账号、在线判题或 Windows/WSL 功能验收。
- `npm run test:host` 使用本机 `code` 和图形环境，目前没有 CI 宿主测试任务。
- 2026-10-04 查询时，GitHub 分支接口显示 `master` 的 `protected` 为 `false`；分支和标签保护仍需核对仓库 Rulesets。
- 仓库采用 TypeScript、TSLint、Node 测试和 `@vscode/vsce` 4.0.0；`npm run vs-publish` 使用固定工具版本，上传当前版本的 VSIX。

### 自动上传入口

[Release 工作流](../.github/workflows/release.yml) 监听 `v<major>.<minor>.<patch>` 标签，也支持在 Actions → Release → Run workflow 中填写已有标签。标签必须属于 `master` 历史，且与 manifest、lockfile 和 CHANGELOG 版本一致。

工作流在标签对应的同一提交上复用 Linux/Windows CI，选择 Linux VSIX，检查包内身份与入口，生成 SHA-256 和源码记录，再自动公开 GitHub Release。Marketplace 从该 Release 下载同一 VSIX，校验后上传。已有 GitHub 资产必须逐字节一致，否则停止；Marketplace 已存在相同版本时明确失败。Marketplace 失败后使用 Re-run failed jobs，只重试该渠道。

首次运行前选择一种 Marketplace 认证方式：

- 已有 PAT：在仓库 Settings → Secrets and variables → Actions 中创建 Repository secret `VSCE_PAT`，填入具有该 Publisher 发布权限的 Marketplace PAT。不要写入源码、命令参数或日志。无需设置 `MARKETPLACE_AUTH`。
- Microsoft Entra ID：设置 Repository variable `MARKETPLACE_AUTH=azure`，以及 `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`。配置 GitHub OIDC 信任，并将身份加入 Marketplace Publisher，授予 Contributor 权限。工作流使用 `azure/login` 和 `--azure-credential`。

GitHub Release 使用内置 `GITHUB_TOKEN`。只有 Release 上传任务取得 `contents: write`；Marketplace 任务只读源码，并可请求 OIDC Token。普通 PR 不运行发布任务。

准备发布时运行 `npm version <version> --no-git-tag-version`，更新 CHANGELOG，合并到 `master`，再创建并推送 `v<version>` 标签。已有版本不覆盖；发布修复使用更高 patch 版本。本地上传入口是 `npm run vs-publish`，需要事先构建当前版本的 VSIX；Entra 认证使用 `npm run vs-publish -- --azure-credential`。

官方推荐 Entra 联合身份认证；Azure DevOps 全局 PAT 将于 2026-12-01 退役，现有 PAT 仅作为过渡接入。见 [VS Code 发布认证](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) 和 [GitHub OIDC 配置](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)。

宿主 CI、已安装 VSIX 冒烟、分支和标签保护仍在下方 TODO 中。本工作流自动公开通过现有检查的版本，尚未实现后文建议的候选包人工验收门禁。

### Entra ID + 托管身份迁移

使用 GitHub 托管的 `ubuntu-latest` Runner，以 GitHub OIDC 断言换取用户分配托管身份（User-assigned managed identity）的 Entra Token，再通过 `vsce --azure-credential` 上传。`azure/login` 使用默认的 OIDC 登录方式；不要设置 `auth-type: IDENTITY`，该方式依赖 Azure VM 上的自托管 Runner。GitHub 发布继续使用内置 `GITHUB_TOKEN`。

工作流已提供 Azure 分支和[独立认证检查](../.github/workflows/marketplace-auth.yml)。Azure 身份、联合凭据及 Publisher 成员授权需要维护者在自己的订阅和账号中配置，代码提交不代表已经完成迁移。

按以下顺序操作：

1. 在 Azure 公有云订阅中创建用户分配托管身份，例如 `leetcode-marketplace-publisher`。记录 Client ID、Tenant ID、Subscription ID；三者是配置标识，不是 Client Secret。按官方指引授予 Reader，限制到发布身份所在资源组。创建身份和授予角色需要相应 Azure 管理权限。
2. 在 GitHub Settings → Environments 中创建 `marketplace`，配置允许部署的分支 `master` 和标签 `v*`。`master` 用于手动认证检查和从主线发起的发布请求；标签用于自动发布。Azure 信任绑定到此 Environment；需要在 GitHub 设置允许范围，不能仅依赖 YAML 中的环境名称。
3. 在 Actions → Marketplace authentication → Run workflow 中选择 `master`、`mode=inspect`。该模式不需要 Azure 凭据，只输出联合绑定信息。在运行 Summary 中取得 `issuer`、`subject` 和 `audiences`，或下载 `marketplace-federated-credential` Artifact 中的 JSON。
4. 在托管身份的 Federated credentials 中添加凭据。选择可手动填写 issuer/subject 的配置方式，逐字填写 inspect 输出；Audience 是 `api://AzureADTokenExchange`，Issuer 是 `https://token.actions.githubusercontent.com`。不要在 subject 中使用通配符。
5. 在 GitHub Repository variables 中配置 `AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`，值来自第 1 步。暂时保留已有 PAT 发布路径，直到 Azure 验证完成。
6. 再运行 `mode=verify`。Azure 登录成功后，Summary 会输出 Marketplace profile ID。首次运行可能在 Publisher 权限检查处失败；此时取前一步的 profile ID，在 Marketplace 的 `Mafty43211` Publisher → Members 中添加该身份并授予 Contributor。这里使用 profile 接口返回的 `id`，不是 Azure 资源的 ARM 路径、Client ID 或 Entra Object ID。
7. 重新运行 `mode=verify`，确认 `vsce verify-pat Mafty43211 --azure-credential` 成功。该命令名称保留了 verify-pat，但实际验证的是 Entra 发布身份；认证检查不上传任何插件。
8. 在 Repository variables 设置 `MARKETPLACE_AUTH=azure`。后续 Release 会先验证 Azure 登录和 Publisher 权限，再上传已有 VSIX；Azure 失败时停止，不回退到 PAT。下一版本上传验证完成后，在 Azure DevOps 撤销旧 PAT，并从 GitHub 删除 `VSCE_PAT`。

该仓库创建于 2026-10-03。GitHub 对 2026-07-15 之后创建的仓库使用包含 owner/repository ID 的默认 subject。因此这里预计是 `repo:W4xMell@74851426/vscode-leetcode-study-plan@1403414028:environment:marketplace`；配置时以 inspect 的实际输出为准，避免组织或仓库自定义 subject 造成差异。见 [GitHub OIDC subject 规则](https://docs.github.com/en/actions/reference/security/oidc)。

认证链路是 `GitHub OIDC → Azure 联合凭据 → 托管身份 → Marketplace Contributor → vsce`。Azure Reader 权限和 Marketplace Contributor 权限分别控制不同服务；Azure 登录成功不能替代 Publisher 授权。官方发布示例采用 Azure Pipelines，本项目结合 [Azure Login 的 GitHub OIDC 支持](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended) 接入同一 Entra 认证方式，无需迁移 CI 平台。

常见失败：`AADSTS700213` 通常表示 issuer、subject 或 audience 未精确匹配；Azure 找不到订阅时核对 Tenant、Subscription 和 Reader 范围；Azure 登录成功但 vsce 拒绝发布时，核对 profile ID 与 Publisher Contributor 成员授权。已发布的 `0.2.1` 不重复上传，认证检查通过后用后续版本验证实际发布。


## 2. 项目规范

### 分支、提交与 PR

建议采用短分支加 PR，保留 `master` 作为可发布基线。Codex 工作分支使用 `codex/<topic>`；其他开发分支使用 `feat/<topic>`、`fix/<topic>` 或 `chore/<topic>`。不增加长期 `develop` 分支。

提交及 squash 合并标题采用 `type(scope): description`，常用类型为 `feat`、`fix`、`perf`、`refactor`、`test`、`docs` 和 `chore`。例如 `perf(timer): stop idle checkpoints`。影响行为兼容性的变更在正文说明迁移步骤；使用 `!` 或 `BREAKING CHANGE` 标识破坏性变化。格式依据 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)。

每个 PR 描述具体问题、最终行为、验证结果和关联 TODO/Issue。将同一行为所需的源码、测试和文档放在一个 PR 中，避免无关格式化或依赖升级。优先 squash 合并，保留可追溯的 PR 记录。

建议为 `master` 配置：必须通过 PR 合并、必须通过稳定命名的 `ci-gate` 检查、禁止强制推送和删除。单维护者阶段不设置「必须由另一人批准」；增加协作者后再配置评审人数。规则启用前先确认 `ci-gate` 在普通、文档和依赖 PR 上都会运行，避免检查永久等待。紧急绕过须记录原因并补验证。

### 代码与行为约定

- 保留当前 TypeScript 和 lint 约束；格式工具迁移单独安排，避免混入功能 PR。
- 命令、设置和扩展状态继续使用独立命名空间；不读取、覆盖或清理上游插件账号与缓存。
- 区分显示题号、站点内部 ID、一次练习记录和计时会话。关键行为以[开发指南中的约定](study-plan.md#state-and-behavior-contracts)为准。
- 新增状态字段必须考虑旧版本恢复；变更存储结构时记录 schema 版本、迁移和失败恢复。计时会话成员与账号归属保持不变。
- 事件监听、计时器和 Webview 必须有明确的释放路径。在途请求需处理账号变化、失败和过期响应。
- 子进程使用独立参数传递，网络请求设置超时；日志和测试样例不包含真实 Cookie、Token 或用户私有题单。
- 性能修改先记录场景与基线，再验证首次、重复和空闲行为。优先用调用次数与队列边界验证确定性约束；耗时和内存测量注明运行环境、样本数及比较方法。

### 文档和完成标准

README 负责安装与使用；`docs/study-plan.md` 负责题单格式与实现约定；本文负责流程和未完成任务；CHANGELOG 记录已交付变更。保留许可、依赖声明和致谢。普通功能不新增独立设计纪要；需要长期维护的结论并入现有指南。

用户可见行为改变时，同步中英文 README 和 CHANGELOG。开发中在 CHANGELOG 的 `Unreleased` 下记录，准备发布时归入具体版本。规划和 TODO 不写成已发布能力。

一个变更完成的条件是：实现满足验收条件、适用检查通过、文档准确、PR 已合并，并记录未覆盖的真实环境场景。一个版本发布完成还要求：批准的标签、完整发布检查、正式 VSIX、校验值、发布说明和安装冒烟验证。修复计时、账号隔离、CLI、缓存或 Webview 行为时必须覆盖对应回归场景。

## 3. TODO 管理与实施顺序

当前用本文维护一份任务清单。实施某项任务时建立 GitHub Issue，并在表中补链接；Issue 记录问题、范围、验收条件、目标版本、负责人和状态。之后以 Issue 为该任务的详细记录，本文保留摘要与索引。

建议状态为 `待开始 → 进行中 → 待验证 → 已完成`；受外部条件限制时标为 `阻塞` 并记录解除条件。合并但仍缺必要真实环境验收的任务保持「待验证」。不在 PR 或代码中维护另一套同范围清单。

建议标签：`type:bug/feature/perf/infra/docs`、`priority:P0/P1/P2`、`status:blocked`。目标版本使用 Milestone。负责人默认为维护者，具体 Issue 创建后明确。P0 表示阻断发布、数据或账号隔离问题；P1 表示近期交付所需；P2 表示计划优化。

| ID | 优先级 | 任务 | 验收条件 | 阶段 / 状态 |
| --- | --- | --- | --- | --- |
| T01 | P1 | PR 与 Issue 模板适配独立插件 | Bug 模板包含站点、版本、复现、脱敏日志；功能模板包含验收条件；PR 模板包含检查结果；移除旧上游支持入口 | 流程基建 / 待开始 |
| T02 | P1 | CI 门禁与基础自动检查 | Linux/Windows 检查通过；文档链接、版本一致性、无通配激活、工作流语法有可执行检查；任何失败均使 `ci-gate` 失败 | 流程基建 / 待开始 |
| T03 | P1 | 宿主测试接入 CI | 固定 VS Code 测试版本，通过可安装的测试运行器启动；Linux 无头环境执行现有原生回归；安装或启动失败明确失败，保留日志 | 流程基建 / 待开始 |
| T04 | P1 | 受保护基线与版本标签 | 确认规则功能可用，启用 PR/必需检查/禁止强推删除；单维护者能正常合并；发布标签限定维护者管理 | 流程基建 / 待开始 |
| T05 | P1 | GitHub VSIX 发布流水线 | 标签、源码和 manifest/lockfile/CHANGELOG 版本一致；发布同一次检查生成的 VSIX；附 SHA-256、提交 SHA、说明和冒烟记录；失败不公开 Release | 首次正式 VSIX / 自动上传已实现，安装冒烟待完成 |
| T06 | P1 | 已安装 VSIX 冒烟与真实环境验收 | 干净配置安装正式候选包并执行激活/本地题单/预览/计时；账号功能记录站点与权限、缓存失败与隔离结果；实际判题仅在授权测试环境验证 | 首次正式 VSIX / 待开始 |
| T07 | P2 | Markdown、高亮按需加载与打包评估 | 首次预览才加载渲染依赖；高亮覆盖支持语言；比较冷启动/首次和重复预览/包内容；安装后运行通过 | 建议 0.3.0 / 待开始 |
| T08 | P2 | 隐藏 Webview 内存优化 | 评估取消保留隐藏上下文；验证题目、题解、提交结果、滚动状态与编辑器焦点；比较多面板内存 | 建议 0.3.0 / 待开始 |
| T09 | P2 | 工具链维护 | 固定打包/发布工具；统一 Node 版本声明；依赖更新形成 PR；ESLint/格式工具迁移独立评估，验证历史测试与包内容 | 后续工程维护 / 待开始 |
| T10 | P2 | Marketplace 分发 | 核对 publisher 与认证方式；发布经过验证的同一 VSIX；稳定/预发布版本与最低 VS Code 要求明确；发布后安装验证 | 自动上传已实现，认证与首次运行待验证 |

T07、T08 是上一轮明确延期的两项优化。流程基建不预设必须发布新功能版本；需要分发兼容修复时建议使用 `0.2.1`，下一功能版本建议为 `0.3.0`。目标版本可在任务范围明确后调整。

## 4. 版本与发布策略

### 版本和渠道

建议遵循 [Semantic Versioning](https://semver.org/)，以 `package.json` 为版本入口，同时更新 lockfile 根版本和 CHANGELOG。兼容修复使用 patch，新增兼容功能使用 minor；在 `0.x` 阶段，破坏性状态或行为改变至少进入新的 minor，并写出迁移说明。

近期发布渠道是 GitHub Release 的通用 VSIX。CI Artifact 用于检查和临时测试，GitHub Release 用于可追溯的版本分发。正式包统一命名为 `vscode-leetcode-study-plan-<version>.vsix`，标签使用 `v<version>`。

先通过 Draft Release 验证候选包；不采用给 manifest 添加 `-rc.1` 的方式建立 VS Code 预发布渠道。Marketplace 的预发布版本仅接受三段数字版本，使用 `--pre-release`，且要求 VS Code 至少 1.63；当前最低版本为 1.57。开启该渠道时再决定版本编号和最低版本升级。打包与发布能力见 [VS Code 发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions)。

### 建议发布步骤

1. 从 `master` 创建发布准备 PR，统一版本、CHANGELOG、中英文使用说明，并关联本版本任务和真实环境验收记录。使用 `npm version <version> --no-git-tag-version` 更新 manifest/lockfile，随后检查 diff。
2. PR 完成必需检查后合并。维护者选择已批准、属于 `master` 历史的提交，并创建 `v<version>` 标签。首次 GitHub Release 可以选择已完成验收的 `0.2.0` 源码，不因创建流程文档就宣称版本已经发布。
3. 标签触发 `release.yml`。检查标签与 manifest、lockfile、CHANGELOG 版本一致，确认提交属于允许发布的主线，并在该提交上运行完整测试。
4. Linux 生成唯一正式通用 VSIX；Windows 检查作为兼容性门禁，不用第二个平台的构建覆盖正式包。打包明确 README 链接基准为 `master` 或发布标签，验证相对链接和所需运行时文件。
5. 同一候选 VSIX 完成干净配置安装冒烟，并生成 SHA-256、源码 SHA 和构建信息。后续上传复用这个产物，不在发布步骤重新构建。
6. 创建或更新该标签对应的 Draft Release，上传 VSIX、`SHA256SUMS` 和版本说明。发布说明列出新增、修复、兼容变化、已知限制、安装方法与验收范围。
7. 维护者核对候选包和说明后公开 Release。自动化阶段由独立手动发布入口批准具体 `tag + source SHA + artifact digest`，不能使用含义不固定的「latest」作为审批对象。
8. 从公开 Release 下载包，复核校验值并完成安装冒烟，记录 Release URL。GitHub 与 Marketplace 两个渠道分别记录成功或失败。

### 失败恢复

检查失败时停止公开发布，保留测试与打包日志。发布重跑仅允许匹配同一源码 SHA 和校验值的产物；Draft 中的资产允许核对后补齐。

公开版本不移动标签、不静默替换 VSIX。正式版本出现问题时，标明已知问题并发布更高 patch 版本；旧包保留用于明确的回退安装。涉及状态结构变化时，发布前提供可验证的迁移或恢复方案。Marketplace 部分失败时只重试该渠道，不重新构建或重复发布 GitHub 版本。

## 5. CI/CD 目标结构

### CI：每次变更的验证

建议继续使用一个 `ci.yml`（由现有 `build.yml` 演进），任务职责如下：

| Job | 运行环境 | 主要检查 | 发布门禁 |
| --- | --- | --- | --- |
| `validate` | Linux / Node.js 22 | 文档链接和锚点、manifest/lockfile 版本、激活配置、工作流校验、依赖锁安装 | 必须 |
| `test` | Linux + Windows / Node.js 22 | `npm test`、`npm run lint` | 必须 |
| `host-test` | Linux + 固定 VS Code 版本 | 在虚拟显示环境运行原生宿主回归，保存报告和日志 | T03 实施后必须 |
| `package` | Linux / 固定打包工具 | 生成候选 VSIX，检查入口、CLI 兼容脚本、许可及包内容，记录大小和文件数 | 必须 |
| `installed-smoke` | 干净 VS Code 配置 | 安装候选 VSIX，验证真正从包加载后的基本能力 | T06 自动化后必须 |
| `ci-gate` | Linux | 汇总所有必需任务；失败、取消或必需任务意外跳过均失败 | `master` 的 required check |

普通 PR、文档 PR 和依赖 PR 都启动 `ci-gate`。初期不做复杂路径过滤；需要优化时由门禁明确哪些检查可按规则跳过，保证 required check 总有结果。Linux 宿主测试采用固定测试运行器和 Xvfb，具体接入参考 [VS Code CI 指南](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)。

新提交取消同一 PR 的旧 CI；不同工作流使用不同并发组。`master` 推送验证合并结果。GitHub 支持通过 `concurrency` 和 `cancel-in-progress` 管理重复运行，见[并发控制文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。

### CD：版本产物的分发

建议新增 `release.yml`，仅响应版本标签和明确版本的手动请求。发布前复用同一验证任务定义或 reusable workflow，在标签提交上重新获得完整结果，避免验证逻辑与 PR CI 分叉。发布检查不因普通 PR 的新推送被取消。

普通 CI 保持 `contents: read`；创建 Draft/公开 GitHub Release 的 Job 才授予 `contents: write`。来自 fork 的 PR 不取得发布凭据；不使用带写权限的 `pull_request_target` 执行 PR 代码。权限按 Job 声明，依据 [GITHUB_TOKEN 文档](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)。

发布以标签作为并发组，重复请求不得重建或覆盖公开资产；校验已存在产物的 SHA 和 digest 后再决定是否继续。构建产物建议保留 14 天，失败日志建议保留 30 天，正式 VSIX 与校验值保存在 Release 中。

Marketplace 在 T10 实施后增加独立发布 Job。单维护者阶段使用明确版本的手动发布；需要更强审批时配置 GitHub Environment。Environment 的审批、允许标签和凭据须由仓库设置明确配置，不能认为 YAML 引用环境名就已启用保护。见[环境配置文档](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。认证方式届时按 VS Code 官方发布指南核对，优先评估 Microsoft Entra ID 的联合身份方案。

## 6. 落地检查表

- [ ] 第一批：T01–T03。适配模板，建立可稳定汇总的 CI，自动执行原生宿主测试。
- [ ] 第二批：T04–T06。启用仓库规则，完成版本校验、正式候选包、安装冒烟和首次 GitHub Release。
- [ ] 第三批：T07–T08。按现有约定执行两项性能优化，保存前后基线与验证记录。
- [ ] 后续：T09–T10。维护工具链，再按分发需求接入 Marketplace。

自动上传工作流已实现；实际发布结果以 Actions 和两个渠道的版本页面为准。GitHub Issue、分支规则、发布环境及宿主/安装冒烟门禁仍按任务表逐项落地。
