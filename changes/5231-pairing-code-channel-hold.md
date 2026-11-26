---
section: Fixed
---

## en

- A leaked pairing code can no longer keep Connect, private tunnels, the private relay and SSH busy while the Owner hasn't answered the pairing request. The Host now keeps only one connection waiting on each pairing code, and a newer one replaces the older ([#5231](https://github.com/BotHarness/DeepSeekBot/issues/5231)).

## zh

- 配对码泄露后，在 Owner 还没处理配对请求期间，不会再占满 Connect、私有隧道、私有中继和 SSH 的连接。现在每个配对码在 Host 上只保留一条等待中的连接，新连接会替换旧连接（[#5231](https://github.com/BotHarness/DeepSeekBot/issues/5231)）。
