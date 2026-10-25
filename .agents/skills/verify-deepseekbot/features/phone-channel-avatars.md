# Mobile group and Bot avatars

## Sub-features

Editable group/Bot portraits, explicit Change avatar and Remove avatar rows, shared phone photo selection and square conversion, independent chat backgrounds, cancellation and duplicate-tap/failure recovery.

## How to get to it (user POV)

- Group: Chats → group → title → tap the large avatar or Change avatar. Chat background is a separate row.
- DM: Chats → Bot → title/profile → tap the large Bot portrait or Change avatar. Chat background remains a separate setting, including for a Bot whose DM id is not yet cached.

## Driving it with verify-app

Follow the shared-device queues in docs/agents/device-qa.md and the task resource/evidence rules. Launch and doctor a task-owned isolated Host with scripts/verify-app.mjs, create a Bot and group, and pair the Expo client. No model is needed.

1. On each page, capture the large portrait, Change avatar and Chat background together where possible. English and Chinese labels must name avatars and backgrounds separately.
2. Set an avatar through both the large portrait and the explicit row. Accept a task-owned photo/crop. Group saves affect only that group; Bot saves update the Bot in its DM, Chats and group member rows. Read the saved group through deepseekbot channel and the Bot through deepseekbot show, then reload.
3. Open each Chat background setting. It edits the existing phone-local Host/Channel scope, not the group/Bot avatar. Set a color/photo, confirm and reopen. Changing/removing an avatar must preserve both chats' backgrounds; changing a background must preserve both avatars. A Bot with no cached DM id must resolve its DM before opening the background editor.
4. Cancel, dismiss and use native Back from the picker; the saved image remains. Repeated portrait/row taps and Remove avatar cannot overlap a pending pick/save. Picker/save refusals show an actionable error and allow retry. Removing a custom avatar restores the default portrait.
5. Repeat iOS and Android independently, light/dark × default/intermediate/maximum system text. Save accessible snapshots, screenshots and Host readback. Expo Web proves only the rendered Expo view, web file picker and Host save; native photo crop, permissions, storage and gestures need their own evidence.

Focused tests: apps/mobile/test/group-info.test.tsx, bot-profile-sheet.test.tsx, bot-avatar.test.ts, bot-background-entry.test.tsx, chat-background-screen.test.tsx and chat-background.test.ts.

## Gotchas

- Keep photos, pairing credentials and unrelated conversations out of published evidence.
- The shared picker is apps/mobile/src/host/pick-avatar-image.ts; it reuses installed native modules.
- Bot avatars use the existing botAvatarSet method scoped through the Bot's DM; group avatars use channelGroupAvatarSet. Chat backgrounds remain device-local settings.
- Tests and preview shims cannot qualify native behavior. Keep exact source/build and preview adjustments in the evidence manifest.
