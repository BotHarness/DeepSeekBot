# Profile 备份／恢复／迁移 UX

**状态：Human 已验收 PR #881 的 UX，实现跟踪 #882，尚未交付完整运行功能。** Issue [#76](https://github.com/BotHarness/BotHarness/issues/76)，2026-10-05。[English](profile-portability-ux.md)。

这份提案将已接受的 [ADR-0041](../adr/0041-one-database-owns-botharness-operational-state.md)、[ADR-0042](../adr/0042-profile-backup-coordinates-database-files-and-dsh-sessions.md)、[ADR-0043](../adr/0043-profile-transfer-prevents-identity-split-brain.md)、[ADR-0044](../adr/0044-restore-revalidates-target-runtime-dependencies.md) 整理为最小交互。产品术语仍由 [CONTEXT](../../GLOSSARY.md) 定义，整合后的架构仍以 [living architecture](../architecture/botharness-architecture.md) 为准。本文件是评审材料，不是已经可用的操作指南或另一份架构权威。

## 入口与信息层级

在 **设置 → Bot 模式** 增加 **Profile 数据**，顶层只有 **导出 Profile**、**导入 Profile**。说明：“Profile 备份保留所有 Bot 的身份和历史。要分享一个具有新身份的 Bot，请使用 PersonaBot Export。” 分享／发布仍属于 [#17](https://github.com/BotHarness/BotHarness/issues/17)／[#18](https://github.com/BotHarness/BotHarness/issues/18)，此处不增加发布器或逐 Bot 选择器。

导出弹窗顺序：用途 → 包含内容和估算大小 → 可选会话历史 → 保存位置 → 确认。导入顺序：文件与校验 → 目标 → 身份／激活提示 → 确认 → 恢复进度 → 就绪检查。复用原生 modal、form、progress、alert 和 DSH tokens；宽弹窗内单列滚动，窄窗口保持顺序。状态、取消和主按钮保持可见，键盘焦点进入弹窗并在关闭后回到入口。错误使用 destructive token；内容省略或不可用使用说明性提示。

已核对当前 `packages/client/src/client/index.ts`：Client 的 `settings.section`／`botharness` 下有 application-defined `botharness.settings.item` 列表。未来 `profile-data` 注册到该列表，通过现有 Host↔Client API Gateway 接口调用，不增加 `/api` interceptor。这是现有入口，不代表备份 endpoint 已存在。以下操作均是拟议的 application-defined Host 操作。DSH 保有 Profile composition 和 Session Persistence 权威；不复制私有存储目录，也不虚构 DSH Profile 管理 API。

## 导出一个文件

1. **导出 Profile** 展示完整 core：Bot 数量、全量 operational database、全部 Soul／Memory、可达 Attachment、依赖 manifest 和 purge checkpoint。core 不提供复选框或逐 Bot 选择。摘要明确列出敏感 core 数据：消息／Source Event 内容及修订、非 secret 账号描述、授权／Service Grant／Trigger 记录、Outbox 与审计历史；取消勾选 DSH 会话历史也不会排除这些记录。排除 provider 凭据、可执行 Plugin 和 Workspace 内容。Model Preset 与每个 Bot 独立 Model Plan 属于完整 core，不能用单独导出模型文件代替（[#505](https://github.com/BotHarness/BotHarness/issues/505)）。
2. 当前 Session Persistence adapter 支持可移植导入／导出时，默认勾选 **包含 DSH 会话历史**，展示引用的 Session 数量、估算字节及“会话历史可能含私人对话和工具结果”。不支持时禁用并说明：“此存储适配器无法包含会话内容；保留归属和历史关联，但这些会话不能恢复执行。” Human 主动取消勾选时也展示不可用内容说明。
3. 展示未压缩内容估算与目标可用空间，说明压缩文件实际大小完成后才确定；未知估算显示未知，不当作零。Host 最终空间检查计入 staging／工作空间需求，空间不足则拒绝。Human 授权选择一个 `.botharness-backup` 保存位置；v1 遇到同名文件拒绝覆盖，提供另选名称，保留旧文件。
4. 确认文案：“创建一个备份文件，包含私人运行数据，但不包含凭据。旧文件只能知道其 checkpoint 前的删除记录。” 按钮 **导出**；原子发布前允许取消。
5. 进度：**准备快照 → 打包 → 校验 → 已保存**。短 Backup Barrier 固定 database、文件版本、CAS closure、所选 Session cursor，之后 active Turn 继续。无法一致捕获固定的可变文件时，本次导出失败并释放 barrier；经校验原子发布后才成功。取消／失败保留旧文件；发布与取消竞争时，已完成发布返回保存凭证。
6. 凭证展示目的位置名称、实际字节、创建时间、package ID、Session 包含／省略／不支持状态；可用时提供 **显示文件** 和 **完成**。不增加 scheduler、保留目录、自动备份、pruning、retention 或增量链。

## 导入、校验与恢复

1. **导入 Profile** 选择一个文件，在隔离 staging 中有界检查；拒绝归档路径穿越／危险链接、错误 metadata、hash 不一致、数据库完整性失败、Soul／CAS 缺失、所选 Session 校验失败。不执行文件内容或加载其中 Plugin。Hash 仅证明内部一致性，不证明来源：“仅导入可信来源的文件。”
2. 展示大小、创建时间、format／Schema Generation、Bot 数量、Session facet 状态、隐私／删除限制。**数据校验** 与 **目标就绪情况** 分开。目标缺 model、Plugin、凭据或 Workspace mapping 属于 readiness，不代表文件损坏。较新且不兼容的 schema 显示 **需要升级**；migration 按 ADR-0041 在 staging 完成。不可跳过损坏的所选 facet 来完成部分恢复。
3. 默认 **恢复为新 Profile**，可选 **替换现有 Profile**。两者都保留原身份；“新”指新目标 Profile，不是新 PersonaBot ID。不得与现有 Profile 合并行。明确展示目标，不根据当前选择的 Bot 推断。
4. 新目标确认：“保留原有 Bot 身份，不代表允许两个副本同时运行。” 替换确认点名目标并要求明确 **替换 [目标]**：“目标 Profile 的全部数据将被替换。需要保留时请先导出；不会自动创建备份或回滚文件。” 取消不修改目标。
5. 恢复必须获取目标 Profile Writer Lease，目标 Host 必须停止。运行中的设置页可以检查／准备文件，但不能替换自己的 live Profile；交由持有已验证目标与计划的本地 portability launcher／控制界面执行。第一次恢复切片必须根据 pinned DSH 验证实际传输／lifecycle 接入，不从 live Client 暴露通用文件写入 RPC。未停止或无法获取 lease 时显示 **Profile 正在使用**，退出后重试。
6. 进度：**校验 → 暂存 → 应用删除 checkpoint → 提交 → 已恢复**。已有目标的 purge 事实单调合并，Messaging 挂载前应用；空目标只能执行文件已知的 checkpoint。任一所选 facet 失败不提交，原目标完好。原子提交前可取消；进入不可回退点后说明正在完成。成功凭证指出恢复的目标，不把它说成运行中的 Bot。
7. 提交后显示 **已恢复 — 需要设置**，Bots 保持 cold；恢复或省略的历史 Session 都不自动继续。选择文件不等于激活授权。普通备份没有已完成的计划迁移证明时，开启任何外部执行前应用 Disaster Restore 保护；“恢复为新”不能作为已验证迁移的证据。

## 修复与显式激活

同一个检查清单按 capability 分组，逐行显示 desired reference、target resolution、**ready／degraded／blocked**。这些是派生的 Activation Readiness，不是 Session activity 或第二套 Bot lifecycle。执行阻塞时仍可查看资料和历史。

| 项目                         | Human 操作与结果                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin capability／兼容性    | 通过已有可信安装路径安装本地兼容 Plugin。Manifest 只含非 secret 要求，没有可执行 installer；重新检查 Host 定义的关键要求，文件不能将其弱化。                                         |
| Provider identity／凭据      | 经现有凭据 owner 本地重新授权；必须由 trusted adapter 验证稳定 Provider Account Fingerprint 精确一致，加上 Human 确认，才允许 rebind。名称或凭据引用相似不构成授权；不一致保持阻塞。 |
| Workspace                    | 将 desired reference 映射至已授权本地 Workspace，显式创建／授权新 Workspace，或保留 unavailable。不自动创建旧路径或给予访问权；历史保留原始 desired reference。                      |
| Model Preset／Bot Model Plan | 保留精确 provider／model／effort 与独立 plan revision。本地解析或 Human 显式 remap，不静默 fallback；target remap 不抹去 portable intent。                                           |
| Session 内容                 | 展示恢复的历史或含归属与省略原因的 **Unavailable Session Reference**。后来找回内容可显式 repair／relink；不创建可继续的空 Session。                                                  |
| 外部操作                     | 计划迁移需验证 generation eligibility；Disaster Restore 初始将 Providers、bound Triggers、Service Grants suspended。未知的 in-flight 外部结果仍未知，不重放旧 Outbox。               |

每个 Bot 的 **激活 Bot** 点名将启用的 capability；Host 再次验证并获得 Human 显式授权后创建新的 Orchestrator Session。外部路径 rebind 与 Bot activation 分别确认。ready／degraded 标签本身不执行工作；degraded Bot 仅可激活 ready 的 capability。依赖变化立即关闭受影响执行入口；修复不自动恢复工作。

## 计划迁移与灾难恢复

**移至另一设备** 是导出内的选项，不是第三套目录。开始前：“这将停止此设备的新工作，并在目标设备保留相同身份。” source quiesce、关闭 ingress／外部执行入口，使用已有 lifecycle 规则 drain 或分类 in-flight work。只有绑定唯一 Transfer Generation 的文件校验成功，才允许 source 持久化为 **Transferred out**。准备／导出失败不得显示成功迁移，Host 必须报告实际 durable source state 与安全恢复动作。

source 完成页显示 **已迁出 — 此设备保持停用**、generation、文件凭证和目标导入步骤。重启 source、恢复凭据、改变 archive 都不能清除 gate。目标导入检查 generation 并说明“重新绑定本地账号和 Workspace，再激活”。仅持有文件不能证明当前唯一 holder。

source 的 Transferred out 页提供 **取消迁移**，先检查目标 activation evidence。只有确认目标未激活，才展示确认：“使本次迁移 generation 失效，并恢复此设备原先获授权的入口。该迁移文件将不能用于普通激活。” 按钮 **取消迁移并恢复此设备**；成功显示 **迁移已取消 — 此设备恢复使用资格**，展示失效 generation 的凭证，未知 in-flight 结果不会因此 replay。关闭确认弹窗保留 Transferred out。检查无法确定目标状态时，保留 gate 并显示“无法确认目标尚未激活，请恢复连接后重试；目标丢失时使用显式灾难恢复”，不得执行取消。已确认激活则显示“目标已经激活，需要从目标反向迁移”，不提供本地撤销。

Transfer eligibility 与取消是实现前置检查点：activation evidence 必须绑定 generation；取消必须先验证目标尚未激活并使 generation 失效。离线文件不能证明取消信息的新鲜度或唯一性。无法建立 eligibility 时拒绝普通 activation，提供显式 Disaster Restore，不承诺尚未实现的协调服务。Human 接受 UX 不等于选择 distributed protocol；第一次迁移切片必须记录并验证实际支持的 handoff 才能宣称交付。

目标已确认激活后，source 不能“撤销”，需 reverse transfer。**灾难恢复** 文案：“原设备可能仍在运行。激活此副本可能产生两个相同身份的 holder，请确认理解风险。” 即便确认，Providers、bound Triggers、Service Grants 仍需分别 rebind／reactivate；不继续旧 Session 或 Outbox。丢失设备使用此显式路径，不静默清除 Transferred out。

## 错误与确认矩阵

错误保留操作概要与安全下一步。稳定错误码是拟议的 application-defined contract；developer log 不记录原始路径、secret、凭据或文件内容。

| 情况／阶段                              | 文案／下一步                                                        | 权威结果                                                 |
| --------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `disk-space-insufficient`／preflight    | 空间不足，另选已授权目的位置或释放空间后重试。                      | 不发布或替换目标。                                       |
| `destination-exists`／export            | 文件已存在，另选名称。                                              | 保留原备份。                                             |
| `snapshot-changed`／export              | 无法一致捕获快照，请重试。                                          | 释放 barrier，不产生可用的半文件。                       |
| `package-invalid`／inspect              | 文件不完整或无效，另选已验证备份；展示有界校验类别。                | 不提交，不跳过损坏的必需／所选数据。                     |
| `upgrade-required`／staging             | 更新到兼容版本后重新检查。                                          | 不 down-migrate 或部分挂载 module。                      |
| `profile-in-use`／restore               | 关闭目标 Profile 后重试。                                           | Writer Lease 拒绝竞争写入。                              |
| `session-facet-unsupported`／inspect    | adapter 无法恢复所选历史，安装兼容 adapter 或另选文件。             | 中止所选 facet 恢复；导出时主动省略仍受支持。            |
| `dependency-unavailable`／readiness     | 数据已恢复，请修复所列 capability 或保留不可用。                    | 保留历史，阻塞依赖它的执行。                             |
| `provider-fingerprint-mismatch`／rebind | 授权账号与原身份不符，重新连接一致的账号。                          | 不 rebind 外部身份。                                     |
| `transfer-unverified`／activation       | 无法验证迁移资格，请完成 handoff 或显式灾难恢复。                   | 不进行普通身份激活。                                     |
| 取消／commit 前                         | 已取消，保留原数据／文件。                                          | 仅清理 staging；已经改变的 durable transfer state 保留。 |
| 中断／commit 边界                       | 重试前查看实际操作／目标状态，展示 committed receipt 或未修改目标。 | Host recovery，不依赖 Client 乐观成功或盲目 replay。     |

Host 在已有 developer diagnostics 表面记录有界 operation ID、initiator、phase、duration、result／refusal code、package／generation ID。状态来自 owning module。Session flush failure、barrier timeout、publication failure 分别记录诊断阶段；不包含私人对话。

## Owning module 与拟议 Host 操作要求

application-defined Portability deep module 协调 canonical owners：Database、Soul／Memory、CAS、Purge Ledger、DSH Session Persistence adapter。其 Interface 提供 prepared plan 与 operation receipt；Client 不复制文件、修改行或推测 readiness。可信本地 launcher 通过同一 module 执行 stopped-target 操作。凭据、Plugin 安装、Workspace 授权、PersonaBot activation owner 各自保留 authority。

| 拟议操作                     | Interface 要求                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 准备导出／检查导入           | 产生 opaque、短期计划，绑定 source／target、package hash、facet 选择、当前 capability；返回数量、大小估算、省略项、必需确认。变更前再次检查过期；Human 授权的文件选择由 Host 解析，不信任 Client 原始路径。 |
| 执行／查询状态／取消         | Human 授权加 prepared plan；有界 operation ID、可观察 phase／receipt。中断重试先确认同一操作结果；取消遵守发布／提交边界；重连读取实际状态。不兼容并发操作拒绝而非竞争。                                    |
| 获取 readiness／解析目标引用 | canonical capability owners 计算；显式本地修复保留 portable desired reference。备份操作不能授予凭据、文件权限或安装代码。                                                                                   |
| 完成／取消迁移；激活         | 当前 durable generation eligibility 和 owner 授权；开 gate 前重新验证，无证明时明确拒绝。activation 委托 PersonaBot owner，新建 Session。                                                                   |

本提案不固定 RPC 名称或包内布局。资源限制、支持的 Session adapter、stopped-Profile 接入、migration coverage、transfer proof 必须在相应切片验证。完整 core 保留敏感运行数据并披露，不能为了简化 UX 任意丢弃。

## 验收与后续纵向切片

Human 验收：理解 clone 与保留身份的区别；理解可选 Session／隐私／大小摘要；选择新目标或 stopped-target replacement；修复 model／Workspace 缺失并拒绝不同账号；理解 Transferred out 与显式灾难恢复。此设计 PR 不修改运行 UI，因此不提供虚构功能 E2E；下列运行切片均须有真实可打开的 DSH 流程、针对性自动失败验证及截图／录屏，再等待各自 Human QA 和批准 merge。

1. **完整 core 导出／恢复为新：**先核对当前 canonical owners；真实设置导出 → 一个验证文件 → stopped-target staging restore → cold 历史查看 → 显式修复目标本地条件并激活一个 Bot，验证真实答复。包括现有 Model Preset／独立 Plan 和 purge checkpoint。生产 core 前置能力缺失时阻塞，不以模型文件或 UI mock 宣称完成。
2. **可选 Session 历史与替换：**先验证真实 portable Session Persistence adapter 的包含／省略／不支持；再 staged whole stopped-target replacement、坏文件失败保留原目标、手动备份提醒、unavailable 历史引用。需要时拆成独立可验收小票，保留完整 core 语义。
3. **修复与激活覆盖：**Plugin 兼容、model remap、Workspace 授权、精确 provider fingerprint；依赖漂移；显式 fresh Session activation 与重启保留 suspended 外部操作。每票为同一个恢复流程增加一条可运行修复路径。
4. **计划迁移／灾难恢复：**source quiescence 与 durable gate、具体 generation handoff／activation proof、重启保护、激活前取消失效、激活后 reverse transfer、丢失设备显式确认且不 replay。获得两个真实 Host 的证据前，不宣称计划迁移交付。

Human 接受 #76 后再发布实现票，并保持 #76 开启至完成该 handoff。[#505](https://github.com/BotHarness/BotHarness/issues/505) 仍依赖生产完整 Profile Backup／Restore 及其其他已声明分享 contract，不因本设计 PR 而解除阻塞。本提案不改变 milestone、不完成 #505，也不替代 [#194](https://github.com/BotHarness/BotHarness/issues/194) Attention 验收。
