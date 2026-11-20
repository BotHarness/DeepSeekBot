---
section: Fixed
---

## en

- On iPhone, switching to another Host Member in Team mode no longer shows the "sheetPresentationController is null" error in development builds. The sign-in sheet could still lay itself out once after it was dismissed, and React Native Screens treated that as an error even though our sheets use fixed detents ([#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)).

## zh

- iPhone 上，Team 模式切换到另一位成员后，开发版不再弹出 "sheetPresentationController is null" 错误。登录 sheet 关闭后仍可能再布局一次，React Native Screens 把这当成错误，但我们的 sheet 用的是固定 detents（[#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)）。
