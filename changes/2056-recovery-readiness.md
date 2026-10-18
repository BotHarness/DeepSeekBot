---
section: Fixed
---

## en

- Restored Bot work waits for the native credentials Provider before checking its model route, preventing a spurious missing-service failure during Host startup ([#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)).

## zh

- Host 启动时，Bot 恢复任务会等待原生凭据 Provider 就绪后再检查模型路由，避免因服务尚未加载而误报失败（[#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)）。
