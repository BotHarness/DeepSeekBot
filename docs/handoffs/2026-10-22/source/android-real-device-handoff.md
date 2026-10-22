# Android real-device acceptance: handoff

Status as of 2026-10-22. No WIP code: every PR from this thread is merged (#2348, #2350, #2351 and the earlier Android M3 PRs). Phone evidence screenshots are on branch `claude/project-thread-m7tsnr-approvals` under `.github/pr-screenshots/`, as evidence only; it is never merged and has no PR.

## Still to check on the Android phone (deferred to the final acceptance run on latest main)

Run on the latest main.

- **#2514:** cold-open a DM with 50+ messages. It should land on the newest message with no visible scroll and no load-more spinner. Scrolling to the top should still load older messages.
- **#2516, M3 loading indicators** (light and dark, default and max font):
  1. The first-load spinner on Chats is horizontally centered.
  2. Pull-to-refresh on each computer tab and on Activity shows the M3 indicator and refreshes. It must not break vertical scrolling, the tab pager, the collapsing toolbar or keyboard dismissal.
  3. Button spinners (approval busy, model/workspace sheets) are the M3 circular indicator.
  4. Loading older messages in a long DM shows the M3 indicator.
- **#2512, pairing guide** (English, light and dark), on the store app with no computer paired:
  1. "No computer paired yet" shows, and the pairing sheet opens by itself.
  2. "Sign in with a DeepSeekBot account" opens the account page.
  3. "Use Tailscale" shows the scanner, the pasted-link field and the Pair button, and pairing works.
  4. "Pair a computer" on the home screen reopens the sheet.
- Optional: re-run a push smoke test on main. In the background, a DM, a group reply, an approval and a secret input should all be app-drawn in conversation style with avatars and actions, in the "requests" channel. Handled requests disappear, and an unread DM stays.

## Already passed on the phone

#2487/#2502 header buttons, #2488 checkmark, #2499 computer icon, #2443, #2444, the push series (#2465, #2483, #2485, #2491, #2494, including tap routing and action buttons), and Connect on Production (done by Vain by hand).

## Phone setup (Xiaomi FE5XNBAEFQTS7DMZ, Android 16 / HyperOS 3)

- Store build (`app.deepseekbot.mobile`): build with `DEEPSEEKBOT_APP_VARIANT=store` and `GOOGLE_SERVICES_JSON=D:\code\project\BotHarness\.secrets\google-services.json`.
  - Always install over the existing app (`adb install -r`); never uninstall.
  - Keep battery saver on "无限制" and "自启动" on, otherwise HyperOS freezes the app and drops pushes.
  - A fresh install needs "USB 安装" enabled and a tap on "继续安装".
- Dev app (`ai.botharness.deepseekbot.dev`): the release build from main e1caf4f9 is installed, with Vain's real pairings (8108 and BEAR-PC). Don't disturb it.
- Keep `adb reverse 8108→39188` and the 3822 pairing. Use an isolated QA Host and a test Bot for live tests (model deepseek-v4.1-flash).
- Redact the status bar, computer names, user paths and keyboard suggestions in screenshots. Never print tokens.

## Accepted as designed (don't report)

- The 2.0-font navbar overlaps the Activity Reject button.
- HyperOS only shows notification action buttons after the notification is expanded.
- Opening a chat clears that chat's notifications, including a pending approval.
