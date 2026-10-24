# Tobs 1.5.1 发布准备

[English](tobs-1.5.1-release-preparation.md) · [跟踪 issue #2751](https://github.com/BotHarness/DeepSeekBot/issues/2751)

状态：仅准备，暂停发布。拟议版本：**1.5.1**。
本文是发布范围检查表，不是冻结的 Release Plan，也不代表发布授权。
执行时遵循现有[版本策略](../agents/version-policy.zh.md)和
[Release Ledger 流程](../agents/changelog.md)。

## 已核实的起点

2026-10-25 日本时间核查：

- npm 已有 `deepseekbot@1.5.0`；查询 `@botharness/tobs` 返回包不存在。
- [#2744](https://github.com/BotHarness/DeepSeekBot/issues/2744) 记录了 1.5.0
  部分发布及现有 `v1.5.0` tag；保留该 tag 和已发布字节。
  尚未找到 `v1.5.0` 的 GitHub Release；npm 发布与 GitHub 公告是两个状态。
- [#2747](https://github.com/BotHarness/DeepSeekBot/pull/2747) 尚未合并，负责修正
  scoped 包名。不得沿用旧的自动发布授权触发其中的 1.5.0 补发工作流。
- [#2750](https://github.com/BotHarness/DeepSeekBot/pull/2750) 已合并。iOS 中文显示名
  为 **托布 Tobs**，英文仍是 **Tobs**。这不要求移动端版本号、构建号与 npm
  同步，也不授权分发移动端应用。
- `scripts/install-release.json` 的公共安装身份仍为 `1.4.1`，须等已发布候选
  验证通过后更新；准备阶段不能提前推进。

## 拟议的包版本对齐

下次拟从同一个已验证源码和冻结产物清单发布 `@botharness/tobs@1.5.1` 与
`deepseekbot@1.5.1`，产品拥有的组件按版本策略使用同一个版本。
Provider、DSH、工具/Skill 和移动端继续独立版本管理。

scoped 包可以直接从 1.5.1 起步，不必先补一个 1.5.0。
如果只是补发包装包，原本可以沿用 1.5.0；但合入其他改动后，变化的产品字节
需要新的发布身份。保留 `deepseekbot` 包与命令，不因新入口而弃用。
最终按完整差异复核 SemVer：1.5.1 是暂定版本；如果包含新增功能或破坏性行为，
可能需要依照策略选择其他版本。

## 必须依次满足的条件

1. **等待 #2435 关闭。** 其
   [通信方案选择评论](https://github.com/BotHarness/DeepSeekBot/issues/2435#issuecomment-6387781599)
   是后续实现的依据，不是生产验收。隔离实验不能替代真实 Host/Channel 投递验证。
   评论完成或关联 PR 合并都不能单独满足此条件；必须重新读取 issue 状态及关闭依据。
   若 issue 重开，则重新阻止发布。
2. 合并经过审阅的 #2747 包名修正，或明确关联的替代 PR。合并不等于授权执行其
   1.5.0 补发工作流。冻结范围前，请 Human 确认前置清单已完整。
3. 基于最终合并源码复核版本，通过现有发布准备流程折叠双语 fragments、审阅发布说明，
   在实际冻结的 Release Plan 中记录精确源码与产物校验值。验证该候选的全新安装、
   升级/重启和受支持的命令共存。旧 1.5.0 或隔离 fixture 证据不能证明新字节通过。
4. **停在 Human 明确确认发布这一步。** 展示最终版本、源码、包清单、验证结果与
   尚存限制。CI 通过、自动审阅、issue 关闭、PR 合并均不能替代人工发布确认。
   Human 此次暂停发布的要求覆盖此前自动补发 1.5.0 的授权。
5. 只有收到该确认后，才通过现有发布门槛执行获准的发布。回读 npm 版本与完整性，
   验证已发布字节后，再通过经过审阅的同步流程更新公共安装身份及生成的安装指引。

## 本次准备边界

本 PR 只修改这份双语检查表。不生成发布产物、tag 或 GitHub Release，不发布 npm
包或移动端应用，不移动 npm channel，不更改包 manifest、Ledger 发布标题或公共
安装身份。没有自动继续发布的授权。
