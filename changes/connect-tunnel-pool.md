---
section: Fixed
---

## en

- Connect frees a computer's DNS record together with its tunnel, repairs online computers that lost their record, and removes leftover tunnels and records every minute, so the hosted tunnel pool no longer fills with computers that are offline ([#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)).
- When every hosted tunnel is in use, Connect hands the slot of the longest-offline or least recently used computer to a new one, and can spread computers across several Connect domains ([#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)).

## zh

- Connect 会把电脑的 DNS 记录和隧道一起释放，为丢失记录的在线电脑补回记录，并每分钟清理残留的隧道和记录，托管隧道池不再被离线电脑占满（[#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)）。
- 托管隧道全部占用时，Connect 会把离线最久或最久未用的电脑的位置让给新电脑，并可把电脑分布到多个 Connect 域名（[#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)）。
