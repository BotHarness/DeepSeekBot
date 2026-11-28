---
section: Fixed
---

## en

- On iOS, opening a Channel or DM no longer crashes the app. The keyboard library added a second copy of its scroll view subclass on top of the class the system uses to watch the chat list, and the next scroll position change crashed the app ([#5629](https://github.com/BotHarness/DeepSeekBot/issues/5629)).

## zh

- iOS 上打开频道或私聊不再闪退。键盘库会在系统用来监听聊天列表的类之上再叠一层自己的滚动视图子类，之后滚动位置一变化，App 就会闪退（[#5629](https://github.com/BotHarness/DeepSeekBot/issues/5629)）。
