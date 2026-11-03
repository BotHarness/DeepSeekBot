---
section: Added
---

## en

- When anonymous usage data is on, the Host now reports Web Client failures to PostHog: an `app:client_issue_report` event with only the kind and a duration band, at most once per kind per Client session. Uncaught Client errors are also sent as `$exception` with the error type, function names, line numbers and file names only. No message text, request names or page content is sent ([#3326](https://github.com/BotHarness/DeepSeekBot/pull/3326)).

## zh

- 开启匿名使用数据时，Host 会把 Web 端的异常上报到 PostHog：`app:client_issue_report` 事件只带类型和耗时区间，每种类型每次会话最多一次。未捕获的前端错误也会以 `$exception` 上报，只带错误类型、函数名、行号和文件名，不带消息文本、请求名或页面内容（[#3326](https://github.com/BotHarness/DeepSeekBot/pull/3326)）。
