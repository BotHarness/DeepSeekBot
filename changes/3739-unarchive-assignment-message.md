---
section: Changed
---

## en

- `unarchive_assignment` takes an optional `message`, so after an explicit Human instruction to continue, one call revives a stopped or archived Assignment and sends it that request through the usual Assignment Request delivery; `code: "request-not-delivered"` says it was unarchived but received nothing. `deepseekbot bot-tool <bot-id> unarchive_assignment --args-stdin` accepts the same `message` ([#3739](https://github.com/BotHarness/DeepSeekBot/pull/3739)).

## zh

- `unarchive_assignment` 新增可选的 `message`：在 Human 明确指示继续后，一次调用即可恢复已停止或已归档的 Assignment，并通过常规的 Assignment Request 投递发送该请求；`code: "request-not-delivered"` 表示它已取消归档但没有收到请求。`deepseekbot bot-tool <bot-id> unarchive_assignment --args-stdin` 接受同样的 `message`（[#3739](https://github.com/BotHarness/DeepSeekBot/pull/3739)）。
