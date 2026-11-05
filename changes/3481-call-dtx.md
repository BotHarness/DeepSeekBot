---
section: Changed
---

## en

- Bot calls send far less audio traffic while nobody is talking: the phone and the computer now switch to Opus DTX in silence, which cut the phone's idle uplink from about 50 to about 6 packets a second in testing, so the phone's radio can rest between sentences ([#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)).

## zh

- 给 Bot 打电话时，没人说话期间的音频流量大幅减少：手机和电脑在静音时改用 Opus DTX，测试中手机静音上行从每秒约 50 个包降到约 6 个，手机的无线电可以在两句话之间休息（[#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)）。
