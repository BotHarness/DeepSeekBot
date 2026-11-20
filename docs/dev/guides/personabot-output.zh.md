# PersonaBot 输出提交事件

这是应用定义、仅在 Host 进程中的 Cordis Event，用于观察 PersonaBot 已提交的公开文本。它与 DSH SessionEvent、模型增量、Activity、Channel SSE、外部平台送达分别有自己的契约。产品边界见 [ADR-0049](../../decisions/release.md#adr-0049) 与[现行架构](../../architecture/botharness-architecture.md)。

## 订阅与生命周期

从 `@botharness/core` 导入 `PersonaBotOutputCommitted` 类型，使用 `ctx.on('botharness/personabot/output-committed', listener, { global: true })` 注册，按 `botId`／`channelId` 过滤，使用 `messageId` 幂等。正常 disposer 或 Consumer Fiber 销毁都会移除监听；producer 随所属 Host Plugin 停止。注册不补发历史，恢复时查询 canonical Channel 消息。

## 版本 1 的安全载荷

| 字段                                                | 含义                                         |
| --------------------------------------------------- | -------------------------------------------- |
| version                                             | 1                                            |
| botId / sessionId                                   | PersonaBot 身份与可信发送 Session 的显式归属 |
| channelId / messageId / channelRevision             | 成功提交的消息引用与 Channel 修订号          |
| at                                                  | Host 创建消息的时间，不是事件回放游标        |
| content.body / content.format                       | 已提交公开正文，格式为 markdown 或 text      |
| correlation.sourceEventId                           | 可信发送路径提供的触发 Source Event，可省略  |
| correlation.replyToMessageId                        | 显式同 Channel 回复目标，可省略              |
| correlation.rootSourceEventId / parentSourceEventId | 既有 Bot 间因果链引用，可省略                |

事件与嵌套记录使用冻结的字段白名单，不复制完整 ChannelMessage、引用正文、附件文件路径、工具参数／结果、审批卡、私有提示词、凭据或模型推理。文件内容不广播，额外详情走所属能力的授权查询。公开正文指已允许显示在目标 Channel 的文字，不表示另行获准访问私有操作数据。

## 提交与失败语义

可信 Runtime 将仅供本次调用使用的 `ChannelMessageOrigin` 传给 canonical writer，成功写入后才调用 `onCommitted`。Origin 不持久化、不进入 SSE 或重放查询。Producer 校验 Session 明确归属于作者；Human／system 或没有可信 origin 的写入不成为 PersonaBot 输出。既有 Orchestrator Channel 发送和公开 Workspace Grant 请求文字提供 origin；Host 自动生成的控制／诊断卡不是 PersonaBot 发言。

append-once 成功路径只通知一次；已有／冲突重试、失败或回滚、模型增量与重启重建不通知。不承诺跨进程 exactly-once 或回放。未来更换 Messaging writer，需保留提交后回调与 origin 契约。

当前 Cordis 4.0.4 的 `emit` 不隔离同步 callback 抛错。因此 producer 使用公开 EventsService 的 `dispatch('emit', ...)` 解析同一组 live listeners，再分别调用。同步错误和 Promise 拒绝只记录固定诊断 `personabot-output-consumer-failed`，其他消费者继续，Channel 结果不回滚。返回 Promise 不等待，同步消费者仍需保持简短；没有订阅者也是正常配置。

## 已验证路径

见 [#125](https://github.com/BotHarness/BotHarness/issues/125)。测试覆盖 SQLite 回滚、重试身份、冻结白名单隐私、SSE 排除 origin、销毁、重启与可信 Runtime 发送。`scripts/e2e-output-committed.mjs` 使用 `scripts/fixtures/output-committed-consumers.mjs` 中的中性消费者，验证真实模型发送、失败隔离、清理与 Host 重启。QA 消费者不进入产品 Profile，TTS、Live2D 等渲染器仍独立后置。
