---
section: Fixed
---

## en

- The desktop client does less repeated work while Bots reply. A streamed reply now sends only the new text instead of the whole reply on every token, and the conversation no longer rebuilds its message groups, image gallery and timeline caches on every streamed frame. The Activity Center waits for a short pause before reloading, unread status reads no longer overlap, store updates that change nothing no longer re-render the sidebar or Activity Center, and the pairing-request check runs once instead of once per place it appears ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- Bot 回复时，桌面客户端少做了大量重复工作。流式回复的每个 token 现在只发送新增的文字，不再重发整段内容；会话也不再在每一帧流式更新时重建消息分组、图库和时间线缓存。活动中心会等更新稍停后再重新加载，未读状态的请求不再重叠，内容没变的状态更新不再导致侧栏和活动中心重新渲染，配对请求的检查也只运行一份，不再每个显示位置各跑一份（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
