---
section: Changed
---

## en

- After a Model Fallback, a Session stays on the model it moved to until that model fails too, instead of going back to the first model of the Routing Group when its rest ends. Each switch discards the prompt cache, so this avoids paying for the whole context again. The choice survives a restart, and a new Session starts on the group's first usable model ([#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)).

## zh

- 路由组切换到备用模型后，Session 会一直使用该模型，直到它也不可用，不再在首选模型恢复后切回。每次切换都会让提示缓存失效，这样可以避免重新支付整段上下文的输入 token。这个选择在重启后保留；新 Session 从组里第一个可用的模型开始（[#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)）。
