---
section: Fixed
---

## en

- Assignment Report continuation checks persisted content metadata independently of display text and stays on the same report when a newer one arrives. Subsequent pages must carry the returned Report Source Event ID; old offset-only callers restart at offset 0. Historical reports retain their compatibility read path ([#3245](https://github.com/BotHarness/DeepSeekBot/issues/3245)).

## zh

- Assignment Report 续读核验持久化正文元数据，不再依赖展示文案；新报告到达后仍继续读取原报告。后续页必须携带返回的报告 Source Event ID，旧的仅偏移调用需从偏移 0 重新开始。历史报告保留兼容读取路径（[#3245](https://github.com/BotHarness/DeepSeekBot/issues/3245)）。
