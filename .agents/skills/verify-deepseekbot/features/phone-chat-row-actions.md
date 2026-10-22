# Phone Chats row actions and Host sections

## Sub-features

- `swipe`: Host DM/Channel rows reveal Pin/Unpin, Add to section and Mute/Unmute; full swipe does not execute. Vertical scrolling and iOS left-edge drawer ownership remain intact.
- `menu`: the native row menu and accessibility actions use the same callbacks; Mark as read remains available when unread. iOS conversation preview still opens the intended chat once.
- `sections`: the native sheet reads the captured Remote Host's roster and assigns an existing section via `channelAssign`. New section uses `sectionCreate`, then the returned ID with `channelAssign`. No device-local section persistence.
- `recovery`: creation failure preserves the name; assignment failure preserves the confirmed section ID and retries assignment only; refresh failure retries refresh only. Host changes hide old choices and refuse continuation. An already-sent write stays on its original Host.

## How to get to it (user POV)

Open Chats with a paired Host and a DM or group Channel. Swipe a row left or open its actions menu. Choose Add to section, select an existing section or tap New section, enter a name and tap Create and add.

## Driving it with verify-app

Use the assigned [shared device QA](../../../../docs/agents/device-qa.md) runner and [Windows Android lane](../../../../docs/agents/android-device-qa.md). No model is needed. Use two disposable paired Hosts with neutral names and distinct sections; seed a DM, unread conversation and group Channel through existing CLI operations. Record PR/batch SHA, binary provenance, OS, viewport and actual OS text category/percentage.

1. Capture base and candidate on iPhone and Android at default/intermediate/maximum system text, light/dark, matching locale, viewport and test data. Capture closed row, revealed actions, open menu, section chooser, new-section keyboard and retry states. Web output is supplementary only.
2. Swipe `conversation-row-<key>` left outside the edge. Verify exactly three actions, no execution on a full swipe, and that each tap closes the rail without opening the conversation. Exercise Pin/Unpin and Mute/Unmute via both swipe and the menu; read the Host's roster/mute facts and compare after refresh/relaunch. Cloud rows and Bots without an existing DM must not receive Host actions.
3. On iOS start a rightward swipe inside 24 points (`EDGE_WIDTH`), just inside/outside its boundary, over multiple row positions. The drawer must win inside the zone; row swipe cannot activate there in either direction. Check vertical scroll, swipe-close and tap-close outside the edge. Long-press for the existing chat preview and open it; one tap/preview commit opens one destination.
4. With VoiceOver/TalkBack, open the row's named actions menu and run each action without swiping. Check row accessibility actions too; hidden rail buttons must not duplicate focus stops. Mark as read remains available for an unread row. Use Reduce Motion and Android ripple; repeat long names and orientation changes.
5. Add to section opens the owning Host's roster sections. Choose one and read `roster-get` on that Host: the Channel belongs to the selected section. Repeat for a Bot DM and a group. Desktop changes must appear through the existing refresh/subscription path. Collapsed sections/pins may affect where Chats shows the row.
6. On an empty section list, New section must remain available. Enter a long localized name with the actual soft keyboard, CJK composition, caret movement and live default→maximum→default size changes. Reach Create and add and Back without hiding text under the keyboard. Verify exactly one section and the membership on the originating Host. Reject whitespace; cancel before submit writes nothing. Reopen and confirm Host persistence.
7. Delay/fail `channelAssign` after successful `sectionCreate` in a disposable QA transport. The sheet shows the saved name and assignment error. Retry must use that ID, never another create; count sections on the Host. Fail refresh after assignment: Retry must not repeat writes. A failed create retains the draft and offers Back to inspect refreshed sections. Deterministic transport tests cover exact call ordering; screenshots alone cannot prove it.
8. Switch/unpair the owning Host while the sheet is open and during a delayed create. Old choices disappear and further actions refuse; no assignment goes to the new Host. A creation already accepted by the original Host may remain there. Reopen from the new Host and see only its sections. Restore device settings and remove only this task's disposable fixtures.

## Gotchas

- Native iPhone/Android gestures, native menus, keyboard clearance, screen-reader focus and large-text geometry remain unrun until the designated runner records them; unit tests mock native adapters.
- `sectionCreate` has no idempotency key. A lost creation response requires inspecting the Host list before a fresh create; the confirmed-create/failed-assign path has a safe ID-preserving retry.
- This flow creates and assigns sections only. Rename/delete/reorder and cross-Host aggregation are out of scope.
- No shared devices, Metro, QA Hosts or builds may start outside the owner-cut batch. The Windows machine cannot substitute source tests for iPhone acceptance.
