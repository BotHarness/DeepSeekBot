---
section: Fixed
---

## en

- Signing in to Tobs Connect on iOS no longer types every code digit twice. WorkOS's sign-in page doubled each key on iOS 27 Safari, so the app now asks for your email and the 6-digit code in its own sheet, with the code suggested from Mail, and the Connect relay checks the code with WorkOS. Continue with Apple and Continue with Google go straight to Apple's or Google's sign-in page, and SSO stays under Other sign-in options. Closing that page brings you back to the sign-in sheet ([#3464](https://github.com/BotHarness/DeepSeekBot/issues/3464)).

## zh

- iOS 上登录 Tobs Connect 时，验证码不再每个数字输入两次。WorkOS 登录页在 iOS 27 Safari 上会把每次按键输入两遍，现在 App 用自己的页面填写邮箱和 6 位验证码（可以直接用邮件里的验证码建议），由 Connect 中转去 WorkOS 验证。“通过 Apple 继续”和“通过 Google 继续”会直接打开 Apple 或 Google 的登录页，SSO 放在“其他登录方式”里。关掉那个页面会回到登录页（[#3464](https://github.com/BotHarness/DeepSeekBot/issues/3464)）。
