# #5096 Android: Conversation screen top app bar (PR #5098) evidence

- **Device:** Android Emulator, Pixel 7 profile (1080×2400, 420 dpi), Android 16. Debug dev client, JS from Metro.
- **Before:** `origin/main` 143f38209, which has the #5088 two-line title. **After:** PR head 5f9a9b865.
- **Modes:**
  - default: font_scale 1.0
  - font 2.0: font_scale 2.0
  - max: font_scale 2.0 plus display size Large
- **Data:** synthetic Bots on an isolated QA Host. The paired Environment is renamed "QA Studio"; no hostname appears.

| Image | Shows |
| --- | --- |
| [dm-before.png](dm-before.png) / [dm-after.png](dm-after.png) | DM top app bar. Before: two-line title and a tall island. After: one line, about as tall as the buttons; the status line is hidden at large text. |
| [select-before.png](select-before.png) / [select-after.png](select-after.png) | Selection mode: "N selected" is capped to the same height as the buttons. |
| [group-before.png](group-before.png) / [group-after.png](group-after.png) | Group top app bar, same change. |

Measured at max on the After build: Back, the identity island and ⋮ are each 145 px tall (48dp at 483 dpi). The TalkBack label reads "Ada Research Assistant, Active 27 min ago". Tapping the identity opens the PersonaBot Profile, which shows the full name.
