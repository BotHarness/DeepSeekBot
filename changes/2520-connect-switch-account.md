---
section: Changed
---

## en

- Signing a Host in to DeepSeekBot Connect now says how to use a different account: open the sign-in link in a private window. After sign-in, Host settings shows the account email up front with "Not you? Sign out", and `deepseekbot connect-sign-in --wait` prints the signed-in email. Signing in from the phone now requests a fresh sign-in instead of silently reusing the browser's AuthKit session ([#2520](https://github.com/BotHarness/DeepSeekBot/issues/2520)).

## zh

- 给 Host 登录 DeepSeekBot Connect 时，会提示换账号的方法：在无痕窗口里打开登录链接。登录后，Host 设置会醒目地显示账号邮箱，并附上“不是你？退出登录”；`deepseekbot connect-sign-in --wait` 也会打印登录的邮箱。在手机上登录时会要求重新验证身份，不再直接沿用浏览器里的 AuthKit 登录状态（[#2520](https://github.com/BotHarness/DeepSeekBot/issues/2520)）。
