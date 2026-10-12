# DSH Skill 更新日志

这里记录可安装 DSH/Cordis Context 与 Decision Tree 值得关注的变化。Skill SemVer 标识本
artifact；DSH 版本与上游 revision 记录这些内容是基于什么版本完成核验的。

## [Unreleased]

独立于下游产品版本，准备下一个 DSH Skill release。

### Documentation

- 在[本地开发指南](../dsh-dev/SKILL.md)记录有界 Windows→Linux Profile 路径迁移及非 root 工作区权限前提，以 pinned DSH `0.2.0-rc.1` 和真实隔离 Linux Host 核验；DSH／Cordis Context 与 Skill 行为不变（[#1386](https://github.com/BotHarness/DeepSeekBot/issues/1386)，[复验](../../../docs/research/2026-10-12-private-input-linux-qualification.md)）。

- 记录受保护私密引用 MCP 消费路径、native 适配器／SDK 边界及可信服务器限制；DSH/Cordis Context 与 Skill 行为不变（[#1384](https://github.com/BotHarness/DeepSeekBot/issues/1384)，[指南](../../../docs/dev/guides/private-input-mcp.md)）。

- 记录 Owner CLI 私密输入生命周期的等价操作，复用现有已认证 Host carrier；DSH／Cordis Context 与 Skill 行为保持不变（[#1416](https://github.com/BotHarness/DeepSeekBot/issues/1416)，[指南](../../../docs/dev/guides/private-input-cli.md)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录真实模型路由匹配、Request 请求体覆盖与 Windows 探针导入，已用 pinned RC1 Go 请求及被动探针回归验证；DSH/Cordis Context 不变（[#1383](https://github.com/BotHarness/DeepSeekBot/issues/1383)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录凭据提交后响应失败及启动恢复的写入顺序，通过 pinned RC1 原生 Provider 和私密账号回归测试核验；DSH／Cordis Context 不变（[#1382](https://github.com/BotHarness/DeepSeekBot/issues/1382)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 RC1 新 Profile 初始化、原生 credential record 对象归属和恢复排空，通过 pinned 原生 Provider 与真实私密输入 Host 核验；DSH／Cordis 词汇及 Skill 行为不变（[#1381](https://github.com/BotHarness/DeepSeekBot/issues/1381)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录浏览器依赖延迟读取 Node 环境变量的问题、构建期浏览器常量及真实原生弹窗复验路径，通过 DSH 0.2.0 RC1 核验（[#1373](https://github.com/BotHarness/DeepSeekBot/issues/1373)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 RC1 原生 MCP stdio 生命周期、共享 Scope 模块身份、Windows Subprocess argv 和 Registry 继承可见性陷阱，以并发原生 Agent Scope 和真实 Docker 核验；DSH／Cordis 词汇及 Skill 行为保持不变（[#1380](https://github.com/BotHarness/DeepSeekBot/issues/1380)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 Windows 原生冷装中重复 localhost 开发刷新 SSE 导致进度不可见、显式刷新 opt-in、首窗口 CDP 就绪问题，以及 mark-of-web／隔离 binary 的实测结果，通过 DSH 0.2.0 RC1 与 Chrome 154.0.8037.57 核验（[#1339](https://github.com/BotHarness/DeepSeekBot/issues/1339)）。

- 在[调试指南](../dsh-dev/references/debugging-playbook.md)记录隔离 RC2 timed question 的前台／持续问题区别、原生稍后回答接口复验、原始应用卡片不兼容及实测发现的应用运行生命周期陷阱；生产 RC1、DSH／Cordis Context 与 Decision Tree 保持不变（[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220), [report](../../../docs/research/1220-native-timed-question-experiment.md)）。

- 在[调试指南](../dsh-dev/references/debugging-playbook.md)记录 RC1 原生 Human 等待持有当前 Agent Step、Inbox 接受与模型处理的区别，以及准确调用的决定／结果复验；DSH／Cordis Context 与 Decision Tree 保持不变（[#1036](https://github.com/BotHarness/DeepSeekBot/issues/1036), [#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220)）。

- 在[调试指南](../dsh-dev/references/debugging-playbook.md)记录 RC1 流式 GET 请求拒绝及真实认证 Host 复验路径；DSH／Cordis Context 与 Decision Tree 保持不变（[#886](https://github.com/BotHarness/DeepSeekBot/issues/886)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录主动读取真实 Client console／DOM、有界诊断、后台标签限制和原生 root／Session guard 精确复现，通过 DSH 0.2.0 RC1 核验；DSH／Cordis Context 与 Decision Tree 不变（[#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 Windows 原生 Sandbox 初始化权限及已安装 ACL 诊断 Skill 的限定修复／复验路径，通过 DSH 0.2.0 RC1 实际原生 pwsh 等待命令核验；平台词汇与 Skill 行为不变（[#911](https://github.com/BotHarness/BotHarness/issues/911)）。

- 在[调试指南](../dsh-dev/references/debugging-playbook.md)记录暂时 HTTP 拒绝后 EventSource 终态关闭及应用拥有的有界退避、恢复标识与清理，通过安装运行的 DSH 0.2.0 RC1 Profile 观察；平台词汇与认证归属保持不变（[#1141](https://github.com/BotHarness/DeepSeekBot/issues/1141)）。

- 在[调试指南](../dsh-dev/references/debugging-playbook.md)记录 Windows AppData 物理路径、隔离 Profile 的包管理器资格核验、原生 Shell 结果检查及进程时间戳保护，通过 DSH 0.2.0 RC1 核验；平台词汇与 Skill 行为不变（[#1029](https://github.com/BotHarness/BotHarness/issues/1029)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生 Go 的 Session 请求头要求及经核验的 DSH 0.2.0 RC1 适配器补丁，通过真实模型调用和已保存 DM 回复验证；DSH／Cordis 词汇与 Skill 行为不变（[#1079](https://github.com/BotHarness/BotHarness/issues/1079), [AX 指南](../../../docs/agents/ax-model.md)）。

- 链接应用定义的 Human Channel 媒体授权及候选 Lark 图片指南；DSH／Cordis 词汇、API Gateway 归属与 Skill 行为保持不变（[#1021](https://github.com/BotHarness/BotHarness/issues/1021), [指南](../../../docs/lark-connection.md), [ADR](../../../docs/adr/0135-human-bridge-media-uses-channel-source-authority.md)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录应用角色文件修改与已持久化 QA Session 中冻结指令的区别，通过 DSH 0.2.0 RC1 的真实模型事件核验；平台词汇与 Skill 行为不变（[#905](https://github.com/BotHarness/BotHarness/issues/905)）。

- 更新下游 Discord 验证指南，记录真实来源删除分类缺陷、新的修复后模型来源／权限拒绝、原权限精确恢复、原生 App／Bot 与错误服务器边界及开发源码 @ 收件／回复资格验证；DSH 词汇与 Skill 行为保持不变（[#855](https://github.com/BotHarness/BotHarness/issues/855), [验证](../../../docs/dev/verification/discord-855-mention-reply.md)）。

- 链接使用公共 DeepSeekBot 与 DSH 0.2.0 RC1 核验的下游 Channel sidebar 图文功能教程；平台词汇和 Skill 行为保持不变（[#893](https://github.com/BotHarness/BotHarness/issues/893), [教程](../../../docs/channel-sidebar/index.md)）。

- 链接经 DSH 0.2.0 RC1 验证的下游公共 npm 图文安装、模型配置及非 IM 设置教程；平台词汇与 Skill 运行行为保持不变（[#887](https://github.com/BotHarness/BotHarness/issues/887), [教程](../../../docs/installation.md)）。

- 引用下游 [npm prerelease 操作指南](../../../docs/npm-prerelease.md)，说明审阅过的预编译 Bundle 分发；平台词汇与 Skill 行为不变（[#866](https://github.com/BotHarness/BotHarness/issues/866)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生 Modal 与第三方引导浮层的键盘和焦点归属，通过独立安装的 DSH 0.2.0 RC1 打包 Client 和 Driver.js 1.4.0 验证（[#824](https://github.com/BotHarness/BotHarness/issues/824)）。
- 在[调试手册](../dsh-dev/references/debugging-playbook.md)记录 DSH 优先从 CLI 安装位置解析 Bundle，以及 pnpm 12 产物覆盖配置的位置，已通过独立安装的官方 DSH 0.2.0 RC1 和真实打包 Client 组件列表验证（[#823](https://github.com/BotHarness/BotHarness/issues/823)）。
- 在[本地开发指南](../dsh-dev/SKILL.md)记录隔离启动超时后遗留重复 Host 导致 operational writer 租约拒绝的情况；通过 DSH 0.2.0 RC1 的 Assignment 容量 QA 验证（[#811](https://github.com/BotHarness/BotHarness/issues/811)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生 Tool 批准与实际 Shell 执行需要分别取证；保留真实 Orchestrator 工作区拒绝，并在 DSH 0.2.0 RC1 验证已授权 Assignment 执行 ([#751](https://github.com/BotHarness/BotHarness/issues/751)).

- 在[调试手册](../dsh-dev/references/debugging-playbook.md)记录外部回复连接与收件范围的区别，以固定 Provider 契约和独立绑定的回复身份检查（[#637](https://github.com/BotHarness/BotHarness/issues/637)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 WebServer prefix 的斜杠匹配与原始 HTTP peer 边界，已核对固定 DSH 0.2.0 RC1 源码并通过真实扩展配对／观察流程验证（[#741](https://github.com/BotHarness/BotHarness/issues/741)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录 native configForms scope 方法的 receiver 绑定要求，并在固定 DSH 0.2.0 RC1 原生设置和 Host 重启后的 Browser Target 持久化中验证（[#726](https://github.com/BotHarness/BotHarness/issues/726)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录目录选择器的能力差异及原生选择回退，通过固定 DSH 0.2.0 RC1 的真实 Inbox Grant 流程验证（[#552](https://github.com/BotHarness/BotHarness/issues/552)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录原生审批探针必须位于 open Turn 的要求，已核对固定 DSH 0.2.0 RC1 源码，并通过真实 Browser 审批及取消 Turn 验证（[#460](https://github.com/BotHarness/BotHarness/issues/460)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)记录隔离 Provider 激活顺序、原生 Consumer 捕获 Policy 与真正的 Tool 执行边界，经固定 DSH 0.2.0 RC1 的原生文件与审批 Shell 调用验证（[#632](https://github.com/BotHarness/BotHarness/issues/632)）。

- 在[本地开发指南](../dsh-dev/SKILL.md)澄清原生 token 投影的汇总字段及失败调用的请求路由归属，通过 DSH 0.2.0 RC1 的真实 Assignment 与子代理调用完成核验（[#503](https://github.com/BotHarness/BotHarness/issues/503)）。

- 记录隔离开发 Profile 重启时保留可选 Bundle 的行为（[#117](https://github.com/BotHarness/BotHarness/issues/117)）。
- 在[本地开发指南](../dsh-dev/SKILL.md)记录 provider token 分项的可选性及 Assistant 实际来源路由，避免把缺失报告当作零或估算用量（[#499](https://github.com/BotHarness/BotHarness/issues/499)）。
- 在[本地开发指南](../dsh-dev/SKILL.md)记录应用预留的 Session ID 与已持久化 DSH Session 的区别，保证执行前拒绝在修复后可以重试（[#500](https://github.com/BotHarness/BotHarness/issues/500)）。

- 为 DSH Skill 建立独立的双语 Release Ledger（[#102](https://github.com/BotHarness/BotHarness/issues/102)）。

## [0.3.4] - 2026-09-20

将可安装 skill 聚焦于稳定的 DSH/Cordis 术语与架构决策。

- **Skill 版本：** `0.3.4`
- **核验的 DSH 版本：** `dsh 0.1.6-alpha.2`
- **上游 revision：** [`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887)

### Changed

- 将 Context 与 Decision Tree 聚焦在稳定的 DSH/Cordis seam，并把版本相关 API 留给当前上游文档与源码核验（[#26](https://github.com/BotHarness/BotHarness/issues/26)）。
