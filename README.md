# #5053 Android — sheet titles and pairing fingerprint (PR B) evidence

- **Device:** Android Emulator, Pixel 7 profile (1080×2400, 420 dpi), Android 16. Debug dev client, JS from Metro.
- **Before:** `origin/main` 616a7a598. The touched files are unchanged up to the PR base.
- **After:** the PR branch.
- **Modes:**
  - default: font_scale 1.0
  - max: font_scale 2.0 plus display size Large
- **Data:** isolated QA Hosts. The verify step names the Host machine; that name is blurred.

| Image | Shows |
| --- | --- |
| [sheet-title-before.png](sheet-title-before.png) | "Pair with your c…" at max (light and dark); default for reference |
| [sheet-title-after.png](sheet-title-after.png) | The title wraps at max. The "Customize computer" child page keeps back and confirm beside the wrapped title. Default is unchanged. |
| [fingerprint-before.png](fingerprint-before.png) | Fingerprint rows wrap 3 + 1 at max |
| [fingerprint-after.png](fingerprint-after.png) | Default keeps 4 groups per row. Max shows 2 groups per row (light and dark). |

The StepBar minimum-height change is not shown. On this base, the Blank Bot sheet opens with its step bar below the visible area, which is #5050 bug 1. It is covered by the new `fixedButtonHeight` lint rule instead.
