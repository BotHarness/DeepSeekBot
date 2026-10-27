---
section: Fixed
---

## en

- A Bot whose last model was removed (its provider deleted or renamed) now answers again as soon as you pick an available Model Preset, in the same Session and with its context. Before, every message failed with `NO_ADAPTER` because the Host still sized the context with the removed model, and only a new Session helped ([#2988](https://github.com/BotHarness/DeepSeekBot/issues/2988)).

## zh

- Bot 上次使用的模型被删除（Provider 被删或改名）后，只要选一个可用的模型预设，它就会在同一个会话里带着原有上下文继续回复。此前 Host 仍按已删除的模型估算上下文，每条消息都以 `NO_ADAPTER` 失败，只有新开会话才能恢复（[#2988](https://github.com/BotHarness/DeepSeekBot/issues/2988)）。
