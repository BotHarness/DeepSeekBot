# Settings row alignment — Expo Web preview

These are real screenshots of the Expo Web export at an observed 355 × 768 CSS-pixel viewport, Chinese, with no paired computer. Each pair uses the same scroll position and appearance choice.

| State                                      | Before    | After     |
| ------------------------------------------ | --------- | --------- |
| Light, appearance follows the light system | `b-l.png` | `a-l.png` |
| Manually selected dark appearance          | `b-d.png` | `a-d.png` |

Before uses `d86af4ed3a266188074aa7fee314a7446c21d16c`. Both exports include the same browser-only preferences adapter and Material-symbol fallback needed to run this native app on Web. These adapters are now isolated under `apps/mobile/scripts/web-preview/` and enabled only by `BOTHARNESS_MOBILE_WEB_PREVIEW=1`; normal builds retain native adapters. The baseline has no settings-row layout changes. After uses the source in this PR. Browser screenshots were saved as PNG without visual modification.

The matched captures use the UI snapshot in `a2ebef4a1405`. Later commits relocate the same browser helpers to the opt-in screenshot harness without changing the settings-row layout. The harness export was also opened and checked separately after that move, with no page errors.

The changed rows now share the icon slot, text origin and raised background of App icon, Activity count and Default chat background. Language and appearance were selected through the actual settings controls; reloading retained Chinese and dark appearance.

These images prove the Web fallback layout only. They do not show SwiftUI or Compose menus, native text scaling, VoiceOver or TalkBack, native persistence, or chat-draft/scroll retention. Native checks remain queued. Adjacent haptics/message-display storage errors and the unpaired usage loading state are existing unsupported Web paths and remain visible; this PR does not qualify them.
