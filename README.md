# #5053 Android — Activity rows (PR C) evidence

- **Device:** Android Emulator, Pixel 7 profile (1080×2400, 420 dpi), Android 16. Debug dev client, JS from Metro.
- **Before:** `origin/main` 6e5bb0b36, the PR base. **After:** the PR branch.
- **Modes:** default (font_scale 1.0), font 2.0, max (font_scale 2.0 plus display size Large).
- **Data:** synthetic Bots on an isolated QA Host.

| Image | Shows |
| --- | --- |
| [activity-before.png](activity-before.png) | At font 2.0 and max, names truncate ("Ada Resear…", "Cyrus the R…") and previews are one line |
| [activity-after.png](activity-after.png) | At large text, names wrap to two lines, the time is on its own line and previews get two lines. Default is unchanged. The last row scrolls clear of the navigation bar, and tapping it opens the conversation. |
