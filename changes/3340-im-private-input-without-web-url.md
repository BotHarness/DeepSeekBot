---
section: Fixed
---

## en

- A PersonaBot asked from an IM conversation (QQ, WeChat, Lark and others) to use an API key or other private value can now get the Owner to configure it and use it through private references, without seeing the value. Before, a Host without `privateInputWebUrl` refused to open the input card at all, so the Owner had nowhere to enter the key and sent it in the chat instead. The card now opens in the Bot's Chat and the IM conversation gets a notice to fill it in there. A replacement card opened from a Group account's settings now also accepts the new value. When `secret_http` cannot reach the API, the Bot now gets the reason (timeout, host name not found, connection refused, certificate rejected) instead of an opaque failure, and a redirect comes back as its status and target instead of an error. Card submission and the `protected_cli`, `secret_cli` and `secret_mcp_connect` tools now also give a specific reason when they fail: the card shows a reason code when the Host did not receive the values, and a credential store read error no longer looks like a removed account. Every private input step and failure is written to the diagnostic log, without secret values, so it can be exported with a problem report ([#3340](https://github.com/BotHarness/DeepSeekBot/issues/3340)).

## zh

- 从 IM 会话（QQ、微信、飞书等）里让 PersonaBot 使用 API key 等私密信息时，Owner 现在可以通过输入卡配置，Bot 拿到的是私密引用并能用它调用服务，看不到明文。此前没有设置 `privateInputWebUrl` 的 Host 会直接拒绝打开输入卡，Owner 无处填写，只能把 key 明文发在聊天里。现在卡片会在该 Bot 的 Chat 中打开，IM 会话收到去那里填写的提示。从群组账号设置里发起的替换卡片也能正常提交新值了。`secret_http` 连不上 API 时，Bot 现在能看到具体原因（超时、域名解析失败、连接被拒、证书不被接受），不再只是一个看不出原因的失败；遇到重定向时返回状态码和跳转地址，而不是报错。提交卡片，以及 `protected_cli`、`secret_cli`、`secret_mcp_connect` 失败时也会给出具体原因：Host 没收到提交时卡片上会显示原因代码，凭据存储读取失败也不再被当成账号已被移除。私密输入的每一步和每次失败都会写入诊断日志（不含私密值），可以随问题反馈一起导出（[#3340](https://github.com/BotHarness/DeepSeekBot/issues/3340)）。
