# #2487 native Chats and Activity header buttons (phone, main a0701f38)

Device: Xiaomi FE5XNBAEFQTS7DMZ, HyperOS 3 / Android 16, zh-CN. Isolated QA Host on main a0701f38; live model deepseek-v4.1-flash. Status bar and the computer name are blanked. Store package `app.deepseekbot.mobile` built from main a0701f38 and overlay-installed.

| Screenshot | Mode |
| --- | --- |
| `light-chats.png` / `light-activity.png` | Light, font scale 1.0 |
| `dark-chats.png` / `dark-activity.png` | Dark, font scale 1.0 |
| `font-chats.png` / `font-activity.png` | Light, font scale 2.0 (the max-font setting used in these QA runs) |

Chats shows search and settings, and Activity shows filter and search, as Material 3 icon buttons in every mode. At the largest font the titles and tabs scale up while the icon buttons stay the same size and remain aligned with the title.
