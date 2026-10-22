# Phone Remote Host sections and Pinned grid

## Sub-features

- `organization`: selected Remote Host sections, pins, membership and order come from `rosterGet`; global/per-scope sorting comes from the same Host's native `settings/describe` namespace used by Web. A refresh reads both; there is no device-local arrangement.
- `pinned-grid`: non-sticky Pinned header and virtualized card bands precede ordinary rows. Cards show avatar/name/status/unread, without preview or time. Empty Pinned is hidden; empty custom sections remain visible. Column policy follows measured container width and system text scale.
- `collapse-search`: collapse is device-local per Host. Search presents full rows even for collapsed/pinned matches, title prefix before pins; clearing restores the Host arrangement without writes. All presents the current Host organization and separate Cloud rows.
- `operations`: ordinary rows retain swipe and iOS peek. Cards retain opening/peek and named native action menus/accessibility actions. Unpin only unpins and returns to retained membership. The inherited Add to section/create flow remains pin-preserving in this slice.

## How to get to it (user POV)

Pair a Remote Host, open Chats and choose that Host in the drawer. Pin a conversation from its menu, then return to Chats. Expand/collapse Pinned or a custom section. Search for a pinned name and clear search. Choose All and a Cloud workspace to inspect source separation.

## Driving it with verify-app

Submit this journey to the centralized test center through [shared device QA](../../../../docs/agents/device-qa.md); the designated runner owns `scripts/e2e-mobile-sim.mjs`, Metro, builds and QA Hosts. No model is required. Do not reuse or mutate a frozen acceptance candidate. Record exact base/head, binary identity, OS, viewport, locale, system text size and appearance.

1. Seed one disposable Host with a DM and group, pins but no custom sections; compare base flat rows with candidate Pinned grid. Verify avatar/name, working and unread state, absent preview/time, no duplicate ordinary row, and the final row in a long list. Scroll: Pinned must leave the viewport normally.
2. Create Work and Empty through the existing mobile section sheet; assign ordinary chats and pin one Work chat. Read `deepseekbot roster` on the same Host. The pin must retain Work membership, be absent from Work display, and return there on Unpin. An empty custom section remains reachable; an empty Pinned header disappears.
3. Use Web or the existing CLI `settings botharness-client` / reviewed settings writes plus roster ordering commands to set global manual/updated and scope manual/updated/inherit. Place loose rows between section blocks. Refresh mobile and compare canonical order to Web, including a chat without messages (`updatedAt` fallback). New messages must not reorder a manual scope. A failed settings refresh must retain the last confirmed roster and sorting; recover by retrying the refresh. Settings-only Web changes currently require refresh/reconnect on mobile.
4. Collapse Pinned and Work. Search for pinned and sectioned names: full rows with previews appear, ordered by title match then pin. Clear search and recover collapse/order. Switch to a second disposable Host with matching section IDs; its collapse state must be independent. Switch back and confirm the original preference. Collapse/search must not write arrangement.
5. Choose All: current Host groups/grid remain; Cloud rows retain their own labels/routes and cannot become Host pin/section targets. Choose a Cloud workspace: no Host section header or grid remains. No claim of multi-Host aggregation is made.
6. On ordinary rows repeat [phone-chat-row-actions](phone-chat-row-actions.md), including edge swipe, menu, mark-read and section creation. On cards open the chat/commit iOS preview once, Unpin, Mute, Mark as read and Add to section through native menus and VoiceOver/TalkBack actions. Preserve the owning Host route. Add to section remains pin-preserving; move-as-unpin-and-assign is not delivered here.
7. Capture matched native before/after on iOS and Android at default/intermediate/maximum system text × light/dark. Use long English/CJK names, rotation and live default→maximum→default resizing. Check grid column changes, full name wrapping, all targets, status/unread legibility, native focus and search with the actual soft keyboard. Pure width/font-scale projection tests do not prove glyph geometry or native accessibility.
8. Restore device settings; remove only task-owned fixtures. Keep sanitized screenshots, accessibility snapshots, console output and canonical reads with the test-center batch report.

## Gotchas

- Native screenshots, keyboard, screen-reader interaction and Human visual acceptance remain unrun until the designated runner records them. Source/DOM fixtures isolate native boundaries and are not native geometry evidence.
- No Organize/drag mode, local pin/order store, section rename/delete, or cross-Host aggregation in this slice. Obtain Human visual feedback before implementing the next slice.
- #2554 row layout and fixture follow-up are independently owned. Requalify the combined candidate when integrated; do not treat its frozen acceptance as evidence for this grid.
