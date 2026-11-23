# #5053 Android — conversation header (PR A) evidence

- **Device:** Android Emulator, Pixel 7 profile (1080×2400, 420 dpi), Android 16 (API 36). Debug dev client, JS from Metro.
- **Before:** `origin/main` 616a7a598. `conversation-top-bar.android.tsx` is unchanged between that commit and the PR base 9b7616e90.
- **After:** the PR branch.
- **Modes:**
  - default: font_scale 1.0
  - font 2.0: font_scale 2.0
  - max: font_scale 2.0 plus display size Large (density 483)
- **Data:** synthetic Bots on an isolated QA Host.

| Image | Shows |
| --- | --- |
| [dm-before.png](dm-before.png) | DM header before: default, default dark, font 2.0, max, max dark |
| [dm-after.png](dm-after.png) | DM header after, same modes. Buttons stay 48dp, and the title wraps to two lines at large text. |
| [select-before.png](select-before.png) | Selection mode before: at max, Share is pushed off-screen |
| [select-after.png](select-after.png) | Selection mode after: Close, count, Copy and Share are all visible |
| [group-before-after.png](group-before-after.png) | Group header before (max) and after (default, font 2.0, max, max dark) |
| [share-after.png](share-after.png) | At max: tapping Share in selection mode opens the image preview |
