# Phone long-press deletion

The Expo app exposes existing Host Bot deletion, Group Disband and Channel-section removal from long-press menus. ADR-0274 governs Group Disband; ADR-0130 governs the other deletion paths. The phone does not own a separate lifecycle.

## Sub-features

- `bot-menu`: ordinary Bot DMs expose Delete Bot; Tob does not. iOS retains Link.Preview. Existing pin, mute/read and section-placement actions remain available.
- `bot-review`: review the Host dependencies and Memory folder. Memory erasure starts unchecked and remains unavailable when the Host cannot prove ownership. Cancel has no mutation.
- `bot-recovery`: block duplicate submission; after a refusal, reset the Memory choice and obtain a fresh preview. Retry an incomplete deletion with its accepted scope. Retry only refresh after known completion.
- `group`: Disband group deletes the group's messages and files after one confirmation. The Group profile Settings tab exposes the same action. The group leaves Chats and its phone cache.
- `group-open`: keep a disposable group's conversation open while another device disbands it. The screen releases its messages and replaces the timeline and composer with a centered native empty state (iOS ContentUnavailableView / Android Compose Material 3), with Back to Chats. Offline cached messages retain their offline notice until reconnect confirms the group is gone. Repeat with the conversation retained behind another screen and with the phone offline until reconnect. Returning to that route must not reopen a stopped conversation. An equal Channel ID on another Host remains usable. Run `pnpm vitest run apps/mobile/test/host-session-conversation.test.tsx` for the hook/timeline regression; native rendering still needs the shared QA lane.
- `section`: Delete section returns its Channels to the list without deleting them. The synthetic Pinned header has no delete action.
- `scope`: switching computers dismisses the pending review; cloud conversations do not expose these actions.

## How to get to it (user POV)

Pair the app with a computer, open Chats, then long-press a Bot, group, or section header. Choose the named destructive action, review the scope, then confirm or cancel. Search shows matching conversations without section headers; clear search to manage sections.

## Driving it with verify-app

Use a fresh, disposable isolated Host containing only this journey's fixtures:

1. Save an Expo Web export of the PR base under `.humanlayer/tasks/mobile-delete/before-web/`.
2. Build the current Host and export the current Expo Web app to `apps/mobile/dist-web/`.
3. Run `node scripts/verify-app.mjs launch --name mobile-delete`, then `doctor --name mobile-delete`.
4. Run `node scripts/e2e-mobile-deletion-web.mjs mobile-delete`. It pairs through the UI, captures matched base/current views, opens menus and reviews, verifies Memory resets after cancellation, deletes a test Bot with Memory retained, removes a section while preserving its group, and disbands the group without retaining it in history. Canonical checks use the same Host's public APIs. It refuses to overwrite a prior journey's fixture receipt; use a fresh isolated name for another run. This script does not cover `group-open`; run that interaction separately.
5. Inspect `.github/pr-screenshots/2783/` and `.humanlayer/verify/mobile-delete/evidence/`. Published screenshots blur the machine-local Memory path. A successful run writes `result.json`; a failure retains the ARIA tree, image and page errors. Run `observe` before retrying a surprising drive.

Native checks belong to the shared device QA runner: verify long-press and iOS preview, Android native action sheets, cancellation and Back, pending submission, screen-reader actions, default/intermediate/maximum text sizes in light/dark themes, and the same canonical outcomes. Submit through [shared device QA](../../../../docs/agents/device-qa.md). A Web pass does not prove those native behaviors.

## Gotchas

- The paired-device gateway is required; a screenshot with fixture-only UI is not end-to-end proof.
- No model is needed. Never use personal Bots or Channels for this destructive journey.
- The current pairing screen first asks for a connection method; choose Use Tailscale before pasting the test link.
- The base Web app may navigate into the DM on long press. Return to Chats before comparing the updated build.
- Web switches expose their checked state as an input property. Use the observed control rather than assuming an `aria-checked` attribute.
