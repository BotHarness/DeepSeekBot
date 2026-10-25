# Mobile Channel avatars

## Sub-features

Large-avatar entry point, phone photo selection, square image conversion, Host persistence, cancellation, failure recovery and duplicate-tap prevention.

## How to get to it (user POV)

Chats → open a group Channel → tap its title → tap the large avatar or Change avatar.

## Driving it with verify-app

Use the assigned native lane in `docs/agents/device-qa.md`. Launch and doctor a task-owned isolated Host with `scripts/verify-app.mjs`, create a group, and pair the Expo development client. This journey needs no model.

1. Capture the same Channel settings before and after the change at matched viewport, locale and theme. Before, tapping the large avatar does nothing; Change avatar remains available.
2. After, tap `group-avatar-change` (accessible label Change avatar). Select a task-owned wide or tall image through the system photo picker and accept the crop. Require the selected square image in the settings header, Change avatar row, chat header and Chats list.
3. Read the same Channel through `deepseekbot channel <id>` and verify the saved avatar is the selected image. Leave and reopen settings, then restart the app and confirm it persists.
4. Cancel the picker and verify the previous photo remains. Tap repeatedly while picking/saving and require one picker and one save. A failed picker/save must leave a reachable retry and retain the current saved photo.
5. Repeat iOS and Android separately, light/dark × default/intermediate/maximum system text. Capture the settings, picker and saved result. Record native Back/dismiss behavior. Expo Web captures qualify the rendered Expo screen and web file-selection/save path only.

`apps/mobile/test/group-info.test.tsx` covers the avatar entry, cancellation, pending operations and retry. `apps/mobile/test/group-channel.test.ts` covers the existing Host action. These tests do not qualify native photo-picker behavior.

## Gotchas

- Keep personal photos, pairing links, fingerprints and credentials out of published screenshots.
- The native image picker is existing functionality; this change adds an entry point and needs no new native dependency.
- The Host owns the saved Channel avatar; a local preview or a successful picker result alone does not prove persistence.
