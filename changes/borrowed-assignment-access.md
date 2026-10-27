---
section: Fixed
---

## en

- An Assignment no longer gets stuck refusing every request with "Assignment Session permission mode differs from its snapshot". When DSH already had the Assignment's Session live on its own (after a Host restart, for example) and its mode or approval policy had been changed outside the Host, the Host refused to take the Session over, and every later request and step failed the same way. The Host now puts the Session back on the Assignment's permission snapshot before checking it, both when taking it over and before every step. A revoked or moved Workspace Grant is still refused as before ([#2991](https://github.com/BotHarness/DeepSeekBot/issues/2991)).

## zh

- 任务（Assignment）不会再卡在每个请求都报「Assignment Session permission mode differs from its snapshot」。如果 DSH 已经自行运行着这个任务的会话（例如 Host 重启之后），而会话的权限模式或审批策略在 Host 之外被改过，Host 会拒绝接管，之后每个请求和每一步都会同样失败。现在 Host 在接管时和每一步开始前，都会先把会话恢复到任务创建时的权限快照，再做校验。工作区授权被撤销或路径不符时仍会照旧拒绝（[#2991](https://github.com/BotHarness/DeepSeekBot/issues/2991)）。
