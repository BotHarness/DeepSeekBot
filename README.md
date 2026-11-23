# #5053 Android large-text audit — evidence

Source: `origin/main` 616a7a598, Debug dev client (ai.botharness.deepseekbot.dev) built from that commit, JS from Metro.
Device: Android Emulator, Pixel 7 profile (1080×2400, 420 dpi), Android 16 (API 36, google_apis x86_64).
Modes: Default = font_scale 1.0, density 420. Font 2.0 = font_scale 2.0. Max = font_scale 2.0 + display size Large (density 483).
Data: isolated verification Host with synthetic Bots (Ada Research Assistant, Bo, Cyrus the Release Manager) and a group. The paired computer was renamed "QA Studio"; the one capture that showed the machine name is redacted.

| # | Image | Shows |
| --- | --- | --- |
| 1 | [01-conversation-header.png](01-conversation-header.png) | DM header: default vs font 2.0 vs max (light/dark). Title and status collapse to "Ada …" / "Active …". |
| 2 | [02-selection-header.png](02-selection-header.png) | Message selection header: Screenshot action pushed off-screen at max. |
| 3 | [03-group-header.png](03-group-header.png) | Group header at max: "Laun…". |
| 4 | [04-sheet-title.png](04-sheet-title.png) | Sheet title forced to one line: "Pair with your c…". |
| 5 | [05-activity-rows.png](05-activity-rows.png) | Activity rows truncate name and preview; Chats rows for comparison. |
| 6 | [06-fingerprint.png](06-fingerprint.png) | Pairing fingerprint rows wrap 3+1 at max. |
| 7 | [07-profile-header.png](07-profile-header.png) | Bot profile fixed header takes ~45% of the viewport at max. |
| 8 | [08-usage.png](08-usage.png) | Usage card chevron wraps alone; Usage by Bot names squeezed. |
