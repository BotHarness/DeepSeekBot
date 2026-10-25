# Channel avatar evidence

Issue: [#2780](https://github.com/BotHarness/DeepSeekBot/issues/2780).
Base: `4f0044dd1248e9dada5377b3fee7c8953666acb4`.
Captured: 2026-10-25. Expo SDK 58 Web export, Chromium, 390 × 844 CSS pixels, 2× scale, English, light/dark.

## Actual journey

1. Prepare an empty test group and a paired test device using the isolated Host's real public APIs.
2. Open Chats, tap Design studio, then tap its title to open Channel settings.
3. Before: the large avatar has no button or handler. The Choose a photo row is the existing alternative.
4. After: tap the large avatar. Chromium reports an actual file chooser. While it is open, the avatar is dimmed and repeat taps are disabled.
5. Select the repository's `deepseekbot-simple-light.png` fixture through that chooser. The existing Expo picker/manipulator produces the JPEG sent through the existing Channel action.
6. Read the Channel through the authenticated Host API and `deepseekbot channel`: both contain the saved JPEG avatar. Reload settings and confirm it remains; return to Chats and confirm the row image updates.

Both themes completed this journey without a page error after the preview-only compatibility adjustment below. Cancellation, picker/save failure and repeated-tap recovery have deterministic component coverage.

## Files

- `l-b.png` / `l-a.png`: light settings before / after selecting and saving the image.
- `d-b.png` / `d-a.png`: matched dark settings before / after.
- `l-p.png`: light settings while the browser file chooser is pending; the external chooser window is not in this capture.
- `c-b.png` / `c-a.png`: matched cropped Chats rows before / after; unrelated cloud-refresh UI is outside the crop.

## Limits

These are actual Expo Web screen captures with a real isolated DSH `0.2.1-rc.3` Host, not iOS/Android native captures. Native system photo selection, crop UI, permissions, Back/dismiss and larger system text remain unverified and use the shared-device journey in the feature map. No new native dependency is needed by this change.

The unmodified base and candidate Web exports stop on a pre-existing call to `Appearance.setColorScheme`, which React Native Web does not provide. The local screenshot server makes only that call optional in the served layout chunk, identically for both revisions. This compatibility adjustment is not in production source or the committed bundles and does not replace the avatar, image picker, manipulator, Channel actions or Host. Pairing is fixture setup using the real public loopback pairing API; these captures do not qualify encrypted pairing.

## Checks

- 23 focused tests pass across Group info, Channel actions and the mobile style guard.
- Repository build and both Expo Web exports pass (the initial long output path failed; the shorter baseline output succeeded).
- TypeScript 7 fails on both the exact base and candidate: 221 distinct diagnostics after removing source locations, with no new diagnostic kind.
- Native iOS/Android and Human acceptance: pending.
