---
section: Fixed
---

## en

- On iOS, opening a Channel or DM no longer crashes the app. The keyboard library swapped the chat list's class for its own subclass, even when the system had already swapped it to watch the list for changes, and the next scroll position change crashed the app. It now changes only the two methods it needs and leaves the class alone ([#5629](https://github.com/BotHarness/DeepSeekBot/issues/5629)).

## zh

- iOS 上打开频道或私聊不再闪退。即使系统已经为了监听聊天列表的变化替换过它的类，键盘库仍会再把它换成自己的子类，之后滚动位置一变化，App 就会闪退。现在键盘库只改动它需要的两个方法，不再替换这个类（[#5629](https://github.com/BotHarness/DeepSeekBot/issues/5629)）。
