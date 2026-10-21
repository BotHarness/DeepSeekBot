---
section: Changed
---

## en

- Compact external IM Inbox content while preserving sender identity, quote excerpts, attachment semantics and reports. Keep reply delivery rules shared, including trusted mention syntax and the distinction between file work and observing additional message sources. ([#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436))
- Require the Orchestrator to deliver a short response to a Human task before querying, executing or delegating. External bridge_reply acknowledgements use a separate durable intent; the actual result is sent explicitly afterward. Direct answers and background events do not add an acknowledgement. ([#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436))

## zh

- 精简外部 IM Inbox，保留发送人身份、引用摘要、附件语义及关联报告；统一回复投递提示，保留可信 mention 语法，并区分普通文件操作与新增消息来源观察。 ([#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436))
- Orchestrator 处理用户任务时，查询、执行或委派前必须实际发送简短回应；外部 bridge_reply 首回应使用独立持久意图，完成后显式发送结果。直接答复和后台事件不额外回应。 ([#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436))
