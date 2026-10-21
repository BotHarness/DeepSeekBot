---
section: Added
---

## en

- **DeepSeekBot Connect phone offers**: a phone signed in to the same account can ask the relay for a one-time pairing offer from a linked Host. The relay signs the request with a per-Host key and the Host mints the offer only for its own id and account; the offer is bound to a secret the phone keeps, so no one else can redeem it ([#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)).

## zh

- **DeepSeekBot Connect 手机配对码**：登录同一账号的手机可以通过 relay 向已关联的 Host 申请一次性配对码。relay 用每台 Host 独立的密钥签名请求，Host 只为自己的 id 和账号生成配对码；配对码绑定手机保存的一段密钥，别人拿到也无法兑换（[#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)）。
