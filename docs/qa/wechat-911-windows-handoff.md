# 个人微信 Goal：#911 Windows 接手记录

## 当前结论（2026-10-08）

#1102 已由 Human 合并；`.911.8` 的原生正常完成、关联 Assignment（stdout `911-V8-ASSIGN`，退出码 0）与停止清理补验全部确认。此前 `.911.7` 的关闭、恢复、后续消息、撤销、Provider disposal 和重启观察仍保留。Human 已明确截图即可，无需录像。后续确认继续推进后，[#911 已验收关闭](https://github.com/BotHarness/DeepSeekBot/issues/911#issuecomment-6056627730)，#912 在独立 PR 推进。以下保留早期交接原始状态，不能当作当前阻塞；公开发布与部署仍分别授权。

2026-10-08 · 状态：`.911.7` Windows 打包候选的原生输入 E2E 场景已完成现场观察；随后 main 再推进，正在整合新基线并准备新 Profile 补验，保持 Draft。改动前及深色界面截图仍有下述采集限制。Human 已明确改为截图验收，暂不提供录像。

## 最后一次 main 推进后的再整合

- 最终远端检查发现 main 已从 `006c0fa3` 推进至 `04c01e0e91f4cab933cedaf3ded8b0bbf82557c9`。本次整合保留窗口伙伴、PersonaBot 确认删除、连接教程入口和真实群名能力。
- main 现占用 ADR-0144 及 generation 66（PersonaBot 删除）；微信顺延为 [ADR-0145](../decisions/im-providers.md#adr-0145) / generation **67**。保留 main 的 generation 66 原文，迁移回归增加从 66 升级的覆盖。
- `.911.7` QA Profile 的 generation 66 属于早期微信候选，不能作为新 schema 的升级来源。保留原 Profile 及下文真实测试证据，另建独立 Profile 补验；不修改历史迁移或摘要绕过保护。
- Provider 整合 main 固定的 `a0ba2839dadbdcdda9a9bf7511da3094a79eb1fb`，新候选 `36da305c9586335a47d4bab6ee4f0025247a9d8f` / `.15`，404 runtime 文件、SHA-256 `221c8888098886cfb50f7d33c8703fac154ad8dfaccfab4b4465e49ea973c4a8`。微信输入／收件、群名、Lark 卡片和 Slack／Discord 聚焦回归 **89/89**、包校验通过；TypeScript 检查通过，Host／Client／迁移聚焦回归 **7 文件 / 74 测试**通过，默认接入及产品打包固定版本另有 **2 文件 / 28 测试**通过。
- `.911.8` 实际产品包构建、打包及全新 Windows Profile 的认证启动通过；同一 Profile 已保存真实模型 Channel 回复 `MODEL-911-V8-OK`。切换前只读确认旧 `.911.7` Host 与 Assignment 空闲，再停止其准确进程，保留原 Profile。新的微信配对、绑定及原生补验尚待 Human 操作，不能将下文旧候选的完整矩阵直接算作新包通过。
- 新 Profile 的 Memory 与隔离 Assignment 目录经 DSH 官方脚本只读诊断缺少 `WRITE_OWNER`。Human 已明确授权新范围的限定修复及 Workspace Grant；通过正常 Host 入口建立新 Bot 的隔离工作区授权，Orchestrator 不开启写权限。Memory 已由官方带备份脚本添加当前用户 FullControl，脚本确认 `WRITE_DAC`／`WRITE_OWNER`；原生沙箱实际复验尚待扫码后执行，不能只凭 DACL 写入宣称修复成功。Assignment 目录尚未修复，待前一步实际通过后继续。
- 最新两轴代码审查未发现确认回归。lint、TypeScript、构建、双语 Release Ledger／Skill Ledger 检查通过；全工作区格式检查仅报告另一项未跟踪研究文档，未修改该任务外文件。Windows 全套的既有失败仍未消除，见下文，不宣称本 head 全套通过。

## `.911.7` Windows 验证记录（2026-10-08；以下为已测旧候选事实）

- 接手任务：`codex/local/01a119ff-d4c2-74b0-9ea8-17aa1a3811d0`，认领见 [#911 comment](https://github.com/BotHarness/DeepSeekBot/issues/911#issuecomment-6053099542)。继续同一个 Draft PR #1102。
- main 基线：`006c0fa3`。保留新身份/会话弹窗、默认接入、多个同平台应用、外部会话接入及现有 Lark/Slack/Discord 能力。
- 当时 main 已占用 ADR-0142/0143 和 generation 61–65；本票旧候选使用 ADR-0144（现顺延为 [ADR-0145](../decisions/im-providers.md#adr-0145)）/ generation **66**，不改当时 main 的迁移历史。旧迁移覆盖从 59–65 升级并保留原有 Lark 审批配置。旧 `.911.1`–`.911.3` QA Profile 均不是 `.911.7` 的升级来源。
- Provider 整合 `55b4528480ccce3e8acc067e10b880556bf5034c` 至现有 typing 分支，候选提交 `7c2489da79017e9c6a86e36898698a9b82c65a52`；产品固定 `.14`，404 runtime 文件，摘要 `2736154321b9966fdcbc513e3f5ae763f8f78fd8d2dce374d232e36d084930b0`。无 npm 发布。
- Windows Node 24.21.0 / pnpm 12.4.2；独立 main 对照和候选 Profile 均通过认证 API 启动。当前候选为实际产品压缩包 `0.0.0-test.911.7`，同一隔离 Profile 由 `.911.6` 空闲重启升级；本机私有模型凭据注入，`.911.5`、`.911.6`、`.911.7` 均有实际模型调用和已保存的 Channel 回复。
- Human 已重新扫码、绑定。真实微信私聊的原生“对方正在输入”由 Human 确认并提供[截图](../assets/pr/911-wechat-typing/native-input-visible.png)。最初等待命令在原生沙箱启动前失败；Human 确认错误回复收到且输入提示消失，这只算失败清理证据。
- Windows 原生沙箱诊断确认 QA Memory 与 Assignment 目录的当前用户权限缺少 `WRITE_OWNER`。经 Human 限定授权，用 DSH 自带的备份修复脚本逐目录添加当前用户 FullControl，保留 owner、deny 和 sandbox 限制。Memory 修复后，同一原生 Session 的 `pwsh` 实际等待约 32.8 秒，stdout 为 `911-COMPLETE-A`，工具结果无错误，`bridge_reply` 接受，Human 确认收到成功回复。Assignment 目录修复亦已通过实际 native pwsh 约 31 秒等待复验，stdout 为 `911-ASSIGN-A` / `EXIT=0`，随后 completed 报告送达 Orchestrator。备份及恢复脚本仅在本机。
- 重启 `.911.7` 后配对、绑定和已保存的关闭偏好仍在，瞬态输入阶段为 idle。偏好关闭时，真实微信 `911-OFF-A` 工作的 canonical Inbox 从 running 到 handled，输入阶段全程 idle；Human 确认未显示输入提示，并提供[成功回复截图](../assets/pr/911-wechat-typing/native-off-completed.png)。不能将该重启检查当作处理中 disposal/重启清理已通过。
- 当前检查：lint、format、TypeScript、构建和产品打包通过；BotHarness 聚焦回归 **6 文件 / 83 测试**通过，后续可见开关标题的 Client 回归 **4/4**通过。Provider 微信输入/收件、Lark 卡片、Slack/Discord 相关 **65/65**通过，包校验通过。
- Windows Provider 首次全套：3,660 通过、39 失败、7 跳过；失败涉及换行字面量、POSIX mode 断言及 updater 状态写入，不能宣称全套通过。updater 最小用例在固定 Provider 基线 `55b452` 同样失败，相关源码和测试无差异，原因未确认。BotHarness 全套亦未通过：最小 runtime 测试断言通过但 Windows 临时目录清理报 EPERM，固定 main `006c0fa3` 同例同样报错。此前 WSL 全套结果仅属于旧候选。
- Standards / Spec 两轴审查已完成，发现的清理失败诊断缺失、ADR rollback generation 过期均已修正并复核；无剩余确认代码缺陷。PR Lens 两主题已生成、目视检查并发布至原 PR。
- Human 明确要求“暂时不提供影像，有截图就好了”；本次按截图及现场观察验收，没有动态录像，不再将录像列为接手阻塞。运行日志只用于核对真实命令及 canonical 来源，不能替代 Human 的原生显示观察。
- Human 已确认 Assignment 阶段有原生输入，并提供[截图](../assets/pr/911-wechat-typing/native-assignment-visible.png)。`911-ASSIGN-A` 审批等待较长，Orchestrator 先发出“等待审批”的中间回复；完成报告到达后，又尝试额外的 Memory 目录读取及修改内容的第二次 `bridge_reply`。Human 批准了只读目录检查，未读写其他范围；第二次回复被同一来源的单一回复意图以 request-conflict 拒绝。真实 Assignment 成功与最终微信回复失败须分别记录，不能视作完整成功路径。
- `911-ASSIGN-B` 完整复验通过：关联 Assignment 只执行一次 native pwsh 等待命令，约 30 秒后真实输出 `911-ASSIGN-B` / `EXIT_CODE=0`，completed 报告返回 Orchestrator，最终唯一 `bridge_reply` 被 Provider 接受。Human 确认等待期间显示输入、收到成功结果、回复后提示消失。该轮未调用额外 shell 或 Memory 工具。A 轮亦验证了 Orchestrator 结束而关联 Assignment 仍等待/运行的共享处理阶段。
- `911-STOP-C` 通过真实原生停止入口取消：90 秒命令获批后约 25.8 秒收到 `tool call aborted`，Session 以用户停止结束，Host 输入阶段 idle；Human 确认微信提示已消失。该命令未正常完成，不能记录为成功输出。
- `911-BIND-D` 通过处理中 Binding 关闭检查：真实 pwsh 等待命令获单次批准后约五秒，canonical 身份更新为关闭，Host 输入阶段立即 idle；Human 在命令仍运行时确认微信提示消失。随后通过原生 Session 入口停止该命令，并恢复测试前的身份设置，原 Grant 接收状态恢复为 receiving。
- 首轮 `911-REVOKE-E` 未执行等待命令：模型在包含此前已取消来源的 Inbox 批次中调用了 `job_list`，并把旧取消结果用于新请求。没有执行 Grant 撤销，不能计入授权清理证据；使用新标记和明确禁止旧请求重处理的指令复验。自动审批审查最初要求具体 Grant 的明确授权，Human 已补充授权本次限定撤销与恢复。
- `911-REVOKE-E2` 通过处理中 Grant 撤销检查：新 native pwsh 命令获单次批准后约五秒，canonical Grant 被撤销，接收状态 off、输入阶段 idle；Human 确认微信提示已消失，随后停止该命令。旧 Grant 保持撤销，使用正常新消息接入机制验证同一私聊的恢复，不直接修改旧 Grant 或历史来源。
- `911-RECOVER-F` 完整恢复通过：同一微信私聊的新消息按既有自动接入策略建立新的 Grant；仅一次原生 pwsh 约 30 秒后输出真实 `911-RECOVER-F`，最终唯一 `bridge_reply` 被接受。Human 确认输入提示恢复、成功结果收到、回复后提示消失。旧授权仍撤销，未扩大到其他身份或私聊。
- `911-DISPOSE-H` 通过真实 Provider disposal：native pwsh 等待命令运行时，通过 DSH `pluginManager/setPluginEnabled` 仅停用本 QA Profile 的 IM Provider，原生返回 `application=applied`、无警告；Host 输入能力不可用、阶段 idle，Human 确认微信提示消失。随后停止命令并通过同一入口恢复 Provider，既有配对、身份和新 Grant 保留，接收状态恢复为 receiving。这是实际 Plugin/Fiber disposal，不是强制杀进程的替代声明。
- `911-STEER-G` 通过实际后续消息处理：单次 native pwsh 等待命令运行中，两条不同的 G-FOLLOW 来源进入同一个原生 turn，完成后原请求和两条后续来源各有一次被接受的 `bridge_reply`，无重复执行。Human 确认后续消息期间仍显示输入，结果收到且最终提示消失；原生 Session 的中途 Inbox splice 和最终同轮回复可核对。
- `911-RESTART-I` 通过 Windows Host 进程中断后的清理检查：在已批准且输入阶段 accepted 的真实等待命令运行时，核对准确 QA PID、CLI 路径及端口后停止该 Host，再用 AX helper、同一 `.911.7` 产品包及同一 Profile 启动。认证接口恢复，瞬态输入状态为 idle、偏好仍开启、配对与新 Grant 保留；Human 确认重启期间微信提示消失。这一轮是非正常进程中断恢复，不冒充正常 disposal；正常 Plugin/Fiber disposal 已由 H 轮单独验证。处理中被中断的命令没有正常完成结果。
- `911-RESTART-J` 重启后完整收发通过：一次 native pwsh 实际等待后输出 `911-RESTART-J`，唯一最终回复被接受；Human 确认输入显示、收到成功结果及最终消失。随后本地 Human–Bot DM 的真实模型回复 `MODEL-911-LOCAL-NO-TYPING` 已保存；偏好开启、微信已配对时，持续观察的 Host 输入阶段保持 idle。这项本地工作检查不冒充 Human 的原生屏幕观察。
- 页面曾在额外 bash 审批卡的“正在检查请求状态”挂起；同时四个只读 Host 接口均 41–67 ms / HTTP 200，Assignment idle。没有证据归因于其他 Session 的并行测试。关闭本任务新增的重复页面，保留原 QA 页；浏览器控制仍有 debugger-detached，原因未确认。
- 视觉采集限制：已保存实际 `.911.7` 浅色身份编辑界面和 Human 的三张原生微信截图。独立固定 main Profile 未配对，条件匹配的改动前截图需要另一次 Human 扫码；候选页面的浏览器控制随后断开，重新认领与新建页均失败，新页停在空白页，未能补拍深色图。没有伪造配对、复制配对存储或以渲染稿代替截图。复验路径：在独立 main `006c0fa3` Profile 扫码并绑定，再比较两候选的身份编辑弹窗及两种主题；私有会话标识不进入截图。
- 当前待最终 Human QA，并保留上述截图缺口、Windows 全套限制和本 head CI 状态。原 Draft PR 延续更新，Provider `7c2489d` 已推到原分支；Actions 工作流 active，但 `acbb2bb3` 没有 verify 运行，原因未确认，旧 head 的成功检查不能算本 head 通过。保持 Draft，#911 不关闭，#912 不混入；合并和部署仍各需授权。

下文保留 2026-10-07 的原始交接事实与步骤；其中 `.13`、`.911.3`、generation 61 和旧 Provider pin 属于历史候选，当前接手使用以上版本。

目标仍是完成 [#903–#912](https://github.com/BotHarness/BotHarness/issues/902)，参照 [#48](https://github.com/BotHarness/BotHarness/issues/48)。#903–#910 已关闭；#911、#912 仍打开。#910 的真实主动文字投递与后续 canonical Inbox 收件已由 Human 确认，PR #1081 已合并；这些证据不能代替 #911 输入状态验证。

## 代码与认领

- BotHarness 分支：[`codex/911-wechat-typing`](https://github.com/BotHarness/BotHarness/tree/codex/911-wechat-typing)。沿用该票 Draft PR，不再创建第二个 #911 PR。
- 本次已整合 main `009e020becc360763a8506fa1d95024b847e9c72`（包含 #1075 Lark 审批），保留最新 main 的原有能力。
- 原任务认领：[issue comment](https://github.com/BotHarness/BotHarness/issues/911#issuecomment-6031570739)，任务 `codex/local/01a112f7-9794-7692-9b17-b71aa980b313`。本任务为迁到 Windows 交接；接手任务按 agent-work-trace 留下自己的认领并引用本记录。
- Provider 维护 fork 分支：[`DoodleBears/dsh-im:codex/911-wechat-typing`](https://github.com/DoodleBears/dsh-im/tree/codex/911-wechat-typing)。提交 [`d93f6236e4800dce06fc96506fc0e6a5b760476b`](https://github.com/DoodleBears/dsh-im/commit/d93f6236e4800dce06fc96506fc0e6a5b760476b)，基于 main 原固定版本 `4f4f0a6282580bb59968eb90571778eb7e37ee73`。已推送；未提交上游 PR、未发布 npm。
- 候选固定版本：`@botharness/im-provider@4.32.0-botharness.13`，398 个 runtime 文件，SHA-256 `8eaee5405a42a747a66c891ab0c9fb2fc3c4f2e61b1029469ce965490d75e663`；原 manifest/lock 摘要不变。Lark 图片和 main 的审批能力不能丢失。
- ADR 为 [ADR-0145](../decisions/im-providers.md#adr-0145)，微信偏好迁移为 generation **61**。main 的 ADR-0140 / ADR-0141 和 generation 60 均保留。测试覆盖从 59、60 升级并保留 Lark 审批配置。

## 已实现的候选行为

```text
自己的已授权微信私聊 Source Event
  → canonical Messaging 校验 Binding / Grant / Registration
  → 实际 Orchestrator、已接受 steer、关联 Assignment 的共享处理 handle
  → Provider-private getConfig ticket + sendTyping
  → 每五秒有界续期，最多十分钟
  → 最后一个处理者结束、取消、失败或授权失效后原票据取消
```

不创建第二套 Session 或消息存储，不借用其他 Bot 的身份，不把无关本地 Channel 工作当作微信输入。只有身份偏好持久化；原生票据、私有上下文、处理 handle 和 accepted 活跃状态不持久化。Identity 表格/编辑弹窗已有中英文开关和 requesting / accepted / unavailable / cleanup-unconfirmed 状态。接口 accepted 只表示请求被接受，不能证明原生客户端显示、送达或已读。

主要文件：`messaging/typing.ts`（共享生命周期），`messaging/outbound.ts`（canonical authority），`runtime/bot-runtime.ts`（实际处理与 Assignment acceptance），`messaging/dsh-im.ts`（versioned checked Service seam），Client `external-identity-table.tsx` / `locale.ts`（偏好与诊断）。Provider 的 `external-typing.mjs` 负责私有原生操作、期限和取消。

## 验证事实与限制

- Provider 最终 `npm run check`：**3,618 passed，0 failed / skipped**，包校验通过。
- 较早 Provider 全套曾出现 Dingtalk 时间断言失败；原始 parent 与候选的该文件单跑均为 104/104，最终全套通过。原因未证实，不能宣称已定位。
- BotHarness 较早基线全套：**3,012 passed，9 skipped**。这是整合最新 main 和新增两项 Assignment 测试之前的结果，不能当作最终提交的全套结果。
- 当前 main 整合后的相关检查：**83 passed**（微信处理生命周期、真实 runtime Assignment overlap/acceptance、数据库迁移、产品固定版本、Lark 审批）；typecheck、format、lint、build 通过。
- 本次最终候选 `0.0.0-test.911.3` 在全新 WSL 未配对隔离 Profile 启动，认证 `botharness/list` 返回 HTTP 200 / 成功 envelope；umbrella、Core、UI 的实际安装版本均为 `.911.3`，Provider 为 `.13`。此前 `.911.2` 也通过认证 `list` / `releaseInfo` 验证，但已被最终候选取代。**这些启动检查不是原生微信 E2E。**
- **没有 #911 真实原生输入状态截图或录像，没有 Human #911 验收，没有合并/部署授权。** 二轴代码审查和 PR Lens 渲染也尚未完成。

本次阻塞：WSL Host 的端口和认证接口在本机探测正常，但 Codex 浏览器访问失败（自动导航曾被阻止，Human 打开后得到 `ERR_HTTP_RESPONSE_CODE_FAILURE`）。浏览器不通的原因未定位，不能据此宣称防火墙、代理或 Host 已坏。按 Human 指示迁到 Windows，不继续反复访问旧链接。

## Windows 接手顺序

1. 在 **Windows 本地文件系统的 checkout** 开新 Codex 会话，读取本记录、#911、Draft PR、当前 `AGENTS.md` 与 `dsh-plugin-dev` / `dsh-dev` / `dsh-ui`。先核对最新 main、认领和现有 PR；若 main 又前进，先整合，再核对 Provider 固定版本、ADR 编号和 schema generation。
2. 用 Node 24.21.0 / pnpm 12.4.2。读取 `docs/agents/ax-model.md`、`docs/client-bridge.md` §7。新 Windows QA Profile 的模型凭据必须在本机配置，并用真实 DM 回复验证可用；GitHub 不包含凭据。
3. 先在最新 main 的独立 Windows QA 实例补拍身份设置/编辑弹窗的改动前 light/dark 截图，保留该实例作对照。之后启动独立 #911 候选 Profile；微信由 Human 重新扫码，发送本次唯一初始化私聊消息。旧 WSL 配对、QA 数据和凭据未上传，不应从 GitHub 查找它们。
4. 构建并验证**产品压缩包**，通过 AX helper 启动；不要只测源码链接或直接调用 Provider。以下相对目录均为该 checkout 下的本机隔离 QA 目录，不提交其中数据：

```powershell
git clone --branch codex/911-wechat-typing https://github.com/BotHarness/BotHarness.git BotHarness-wechat-911
Set-Location BotHarness-wechat-911
corepack pnpm install --frozen-lockfile
git clone https://github.com/DoodleBears/dsh-im.git reference/dsh-im
git -C reference/dsh-im checkout d93f6236e4800dce06fc96506fc0e6a5b760476b
corepack pnpm build
node scripts/product-artifacts.mjs --output tmp/911-product-windows --provider-source reference/dsh-im --version 0.0.0-test.911.3
node scripts/dev-instance.mjs --home tmp/911-qa-windows --port 31910 --product-artifacts tmp/911-product-windows --json
```

5. 认证桥接、正确包版本及真实模型回复均可用后，做受控的**同一微信私聊真实工作**，由 Human 观察并录制原生输入提示、正常完成及停止/失败后的消失；同时核对 canonical Inbox 来源和真实处理。不能用 Mock、Host 日志或请求成功代替原生显示证据。
6. 验证偏好关闭、Binding 关闭、Grant 撤销/恢复、Provider disposal、重启以及无关本地 DM 不请求输入；观察 relevant refusal/recovery。共享 Channel 读权限不能借用接收身份。保留原生 author/time/message ID/Source Event ID/trusted route；所有私有票据留在 Provider。
7. 通过 CUA 补拍 Client 前后 light/dark 图；Human 录制微信。删去有效 QR、tokens、凭据、无关聊天。更新两份 canonical 微信指南与两份 IM integration guide，替换其中“pending”说明为已验证事实；附 GitHub 可渲染图片/视频。完成 `visual-pr` / `show-me` 和验证、检查两主题的 PR Lens 图，以及 Standards / Spec 两轴审查。
8. 运行合适的最终回归和 Windows packaged-product E2E，将结果同步到**同一 #911 PR**，再请求 Human QA。验收前保持 Draft，#911 不关闭；合并和部署分别需要新的明确授权。#912 在下一票独立 PR 继续，不混入 #911。

## 数据库与本机资源注意

迁移是 forward-only。旧 `.911.1` / `.911.2` smoke Profile 曾使用本票早期的 generation-60 微信偏好布局；main 现在的 generation 60 属于 Lark 审批。**不要将这些旧候选 Profile 当作新版本升级源**，使用新的 Windows 隔离 Profile。既有正常 main Profile 如需升级，先通过既有备份机制保存；不要修改 migration history 或迁移摘要绕过恢复检查。

交接前已逐一核对准确 PID 的命令与 QA home，停止本任务 WSL 的 #910 基线及两个未配对 smoke Host；31910 / 31911 / 31912 均已不监听，避免 Windows 新配对与旧 Consumer 同时运行。只保留本机 Profile 文件、启动摘要、cookie 与凭据，没有删除配对或解绑微信。这些私有文件未交付到 GitHub；旧登录链接已经失效，Windows 须使用自己的新启动链接。

Provider 上游贡献在原生资格验证后再评估；上游合并不是 BotHarness release 前提。始终保持一票一 PR、不接 WeCom、微信原生操作由 Human 完成、每票交付后等待 Human QA。
