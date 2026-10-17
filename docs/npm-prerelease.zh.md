# 把 DeepSeekBot 发布到 npm

这是把 DeepSeekBot 发布到 npm 的操作路径，源自 #866、[#823](https://github.com/BotHarness/BotHarness/issues/823)
的打包安装验收和 [#824](https://github.com/BotHarness/BotHarness/issues/824) 的真实 Lark 引导；它不部署网站。

## 发布的包

每次发布按以下顺序发布四个预编译包：

1. `@botharness/im-provider`，保留独立 Provider 版本（例如 `4.32.0-botharness.5`）；
2. `@botharness/core@<version>`；
3. `@botharness/ui@<version>`；
4. `deepseekbot@<version>`，通过精确依赖组合一个产品 Bundle。

不发布可选 Computer／Browser Bundle。维持已验收 Provider 的固定源码；上游 PR
合并不代表替换版本已经资格验证。DSH 支持范围仍以 `0.2.0-rc.1` 为准。

源码包保留 private／0.0.0；已有打包器在独立暂存目录产生公开 manifest 和预编译入口，
保留 MIT、Provider attribution 和 `PROVENANCE.json`，不打包账号、凭据、Binding 或 Grant。

## 发布一个版本

当前正式版本是 `deepseekbot@1.0.1`。发布由在 main 上推送 SemVer tag 触发；分支、PR 和手动
dispatch 都不会发布。

1. 在双语 Release Ledger 中把 `Unreleased` 归档到新版本（[发布规则](agents/changelog.md)），
   并合并该 PR。
2. 给 main 上已合并的提交打 tag 并推送，例如 `git tag v1.0.2 <main-sha> && git push origin v1.0.2`。
   正式版本发布到 npm dist-tag `latest`；带 `-alpha`、`-beta` 或 `-rc` 的版本发布到 `next`。
3. **npm release** workflow 检查 tag 位于 main，运行 lint、类型检查、测试和构建，下载固定的
   Provider 源码，打出四个 tarball，并在无 token 下 dry-run。run summary 显示
   `release-plan.json` 及其 SHA-256。
4. 发布 job 等待 GitHub Environment `npm-release` 审批。指定审批人在 run 页面点
   **Review deployments → Approve**，这就是 Human 发布批准。
5. 发布 job 校验同一组产物和 plan 摘要，然后按顺序发布 Provider、Core、Client 和产品包，
   每个包最多等 40 分钟，直到 npm 显示完全一致的完整性。正式版本发布后，把 Core、Client
   和产品包的 `next` 移到同一版本。

tag 固定了源码，发布期间 main 上的合并不会影响发布。tag 就是发布记录；只有在发布 job
从未开始时，才删除并重建 tag。

## 一次性设置

- **Environment**：在仓库 **Settings → Environments** 新建 `npm-release`，把发布负责人设为
  required reviewers，并把部署限制为匹配 `v*` 的 tag。
- **Trusted Publishing**：在 npmjs.com 分别打开 `@botharness/im-provider`、`@botharness/core`、
  `@botharness/ui` 和 `deepseekbot`，进入 **Settings → Trusted Publisher**，选择 GitHub Actions，
  填写组织 `BotHarness`、仓库 `BotHarness`、workflow `npm-release.yml`、environment
  `npm-release`。之后 npm 接受该 workflow 的 OIDC 身份并附加来源证明（provenance），不再存储
  发布 token。
- **`NPM_TOKEN`（可选）**：npm 的 OIDC 登录只覆盖 `npm publish`。若希望正式版本发布后自动移动
  `next`，保留一个有 dist-tag 权限的 `NPM_TOKEN` secret；没有它时，job 会打印需要手动执行的
  `npm dist-tag add` 命令。在尚未配置 Trusted Publishing 时，有 token 也能照常发布。

token 只保存在 GitHub secret 设置中，绝不写进源码、产物、命令、日志或 issue 评论。

## PR dry run

修改发布代码的 PR 会运行 **npm prerelease preparation**，使用唯一版本
`0.1.0-alpha.1-preview.<PR>.<run>`，构建并 dry-run 整组包、上传产物供审阅，不能发布。

本地预演（先安装 lockfile 依赖并构建）：

```sh
node scripts/npm-prerelease.mjs prepare --version 1.0.2 \
  --provider-source /path/to/qualified-provider --output /path/to/fresh-artifacts
node scripts/npm-prerelease.mjs verify --artifacts /path/to/fresh-artifacts
```

使用新的输出目录。Provider 需以禁用脚本的方式安装 lockfile 依赖；暂存会重建托管的 Host／Client 入口。

## 冻结候选产物后重试

保留整个准备目录（全部六个 tarball、`artifacts.json` 和 `release-plan.json`），并把返回的 plan SHA-256 与 QA 证据一起记录在该目录之外。不要从变更后的文件重新计算“批准摘要”。使用已经审核的版本、源码 commit 和摘要重试：

```sh
node scripts/npm-prerelease.mjs prepare --output /path/to/retained-artifacts \
  --version 2.0.0-beta.1 --source-sha <reviewed-commit> --plan-sha256 <reviewed-plan-digest>
```

该路径只校验和 dry-run 原字节，不需要原源码工作区或 Provider 构建输入，绝不重建或替换 tarball。`verify --artifacts` 接受相同的三个身份参数；QA 后检查应使用这些参数绑定已审核证据。不同版本（包括 Beta 转正式版）必须准备新候选并单独 QA，不能修改旧 plan。

准备期间独占相邻的 `<output>.prepare-lock` 目录，直到 registry 预检和 npm dry-run 结束。首次准备的输出与相邻锁都必须位于工作区之外或被 Git 忽略，否则在打包前返回 `release-output-in-source`，避免自身输出污染源码检查。竞争者返回 `release-prepare-busy`，不会删除持有者的锁。进程崩溃可能留下锁；确认持有者已停止后才可手动移除空锁目录。非空输出缺少 plan 时返回 `release-output-not-empty`，已审核重试的产物目录丢失时返回 `release-plan-missing`。保留不完整或损坏输出供诊断。缺少审核参数、身份冲突、清单被改、tarball 缺失或损坏都会拒绝，不会改为重新构建。输出目录不能是符号链接，请使用真实路径。

这只是同一输出目录的互斥保护，**不是**仓库全局或跨机器版本预留；不同目录仍可准备同一版本。协调分配和发布频道迁移留给 #1981/#1982 后续片段，现有 GitHub 发布通道保持不变。上传产物必须在保留期限到期前归档；重跑整个 workflow 不等于原字节重试。本片不创建 npm tag、账本或发布权限。脏工作区实验仍是内部、未验收状态，不能通过现有干净源码发布门禁。首次准备会在构建前核对指定 commit，并在准备前后观察到 commit 或 Git 状态变化时拒绝；这不是脏文件字节快照。

## 准备阶段提示工作区不干净时

准备结果的 `release-plan.json` 会记录 `sourceDirty`、`sourceChangeCount`，以及最多 50 条 Git 状态与变更路径；日志使用固定代码 `release-source-dirty` 输出同一份有界诊断。发布 workflow 和 publisher 复用此检查，拒绝时列出修改、删除、重命名和未跟踪文件，超过上限的条目显示省略数量。路径相对于仓库，不包含文件内容。

在原工作区运行 `git status --short --untracked-files=all`，逐项核对对应变更。自动生成文件可能是原因，但文件名本身不能证明它可以丢弃。保留未知改动；检查不会执行 reset、clean、暂存或恢复文件。按正常流程修正和审核源码，再生成新的准备结果；不要修改已审核的 plan，也不要重建已开始发布的不可变版本来绕过拒绝。

旧的干净 plan 仍可使用。旧的脏 plan 若未记录路径，仍会拒绝并提示检查原工作区；无法重建当时未记录的历史文件清单。

## 发布中断

npm 多包发布不是原子的。首次发布前检查全部已有版本及直接运行依赖。已有版本只有在完整性与
准备好的 tarball 完全一致时，才会在 dry run 和发布中跳过；同版本不同字节会停止整轮。要完成
中断的发布，重跑同一个 workflow run 里失败的发布 job：它复用同一组产物，已发布的包会被跳过，
其余照常发布。不要为中断的发布重新打 tag：同一版本重新构建可能字节不同，而 npm 永远不允许
覆盖版本。如果某个版本无法使用，改发下一个 patch 版本。

产品包最后发布，避免内部依赖失败却已公开产品。宣布前在 npm 上核对每个版本、完整性和 dist-tag。

回退代码使用之前验收的产品组合和获准的 Profile 备份流程；不能撤销外部已发送消息，也不能
通过包回退降级 canonical database generation。修复安装不删除凭据／历史。启用产品前移除
冲突的 standalone Provider／Core／Client Bundle，切换产物前停掉精确归属的 Host。

参考：[DSH Bundle 发布](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)、
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、
[BotUI release 参考](https://github.com/BotHarness/BotUI/blob/dee41211aca0da71fe60206b5099283361fdb75a/scripts/release.mjs)、
[产品验收](product-im-installation.md)。
