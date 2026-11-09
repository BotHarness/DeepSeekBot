---
section: Fixed
---

## en

- Connect frees a computer's DNS record together with its tunnel, repairs online computers that lost their record, and removes leftover tunnels and records every minute, so the hosted tunnel pool no longer fills with computers that are offline ([#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)).
- When every hosted tunnel is in use, Connect hands the slot of the longest-offline or least recently used computer to a new one, and can spread computers across several Connect domains ([#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)).
- The Tobs Connect screen shows how many shared tunnels are in use, your place in line and the earliest time a tunnel frees up, and how long your own tunnel is kept. Every computer keeps a new tunnel for at least 30 minutes ([#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)).

## zh

- Connect 会把电脑的 DNS 记录和隧道一起释放，为丢失记录的在线电脑补回记录，并每分钟清理残留的隧道和记录，托管隧道池不再被离线电脑占满（[#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)）。
- 托管隧道全部占用时，Connect 会把离线最久或最久未用的电脑的位置让给新电脑，并可把电脑分布到多个 Connect 域名（[#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)）。
- Tobs Connect 页面会显示共享隧道用了多少、你排在第几位、最早什么时候有空位，以及这台电脑的隧道保留到什么时候。每台电脑连上后至少保留 30 分钟（[#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)）。
