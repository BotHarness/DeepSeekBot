# Phone Chats drawer views

## Sub-features

- `all`: the first drawer row selects All without switching the current paired Host. Chats renders one list containing the current Host and available cloud workspaces.
- `host`: choosing a Host closes the drawer and queues its switch through the existing Host Session. Each switch waits for the prior save/adopt to settle before checking the current Host. Only the latest successful choice selects its conversation filter, so the final Host owner, persisted Host and selected Host view agree. A failed switch does not block the next choice. All updates the filter immediately without cancelling an already requested Host switch.
- `header`: All shows a chat icon and its title; a Host shows its device-local name, icon and colour. The title button announces the full selected view name (including cloud disambiguation) in the current locale. Title icons and the All row icon follow their label roles and live system text size. Removing a selected Host falls back to All.
- `accent`: Android's root accent follows the current Host colour in each scheme only while that Host's filter is selected. All, cloud, a different Host filter and a Host without a colour keep the default theme. iOS keeps its existing accent.
- `gestures`: Chats has no source tabs or sideways pager. The existing iOS left-edge drawer gesture remains available.
- `settings-entry`: iOS shows a labelled Settings gear in the bottom island, with no Settings gear in the Chats header. It opens the existing Settings sheet over Chats or Activity and keeps that underlying tab selected. Dismissal returns to the same page. Android retains its Chats header gear.
- `pairing`: cancelling first-run pairing leaves the empty home; drawer account rows open `/pair/account` with the selected account id. Cloud entries follow the existing feature flag.

## How to get to it (user POV)

Open Chats in the paired app, tap the title to open the left drawer, then choose All or a Host. Long-press a Host or open its menu to change its device-local icon and colour. On iOS, swipe in from the left edge to open the drawer.

## Driving it with verify-app

Use the designated [shared device QA runner](../../../../docs/agents/device-qa.md), with the Windows [Android lane](../../../../docs/agents/android-device-qa.md) and the Mac/iOS lane. Record the exact PR head, batch head, native build provenance and assigned Host. This journey needs two paired QA Hosts for switching, but no model, push, camera or real tailnet. Any optional model run uses `deepseek-v4-pro`.

1. Capture the base and candidate with the same data, locale and viewport. On each platform, run default/intermediate/maximum system text sizes in light and dark.
2. Tap `chats-view-button`, then `drawer-all`. Check All is selected, one list is visible, and its rows belong to the current Host or enabled cloud workspaces. Check no environment tabs or pager remain. With TalkBack/VoiceOver, focus the title and confirm it announces the complete selected All/Host/cloud name. On Android, press All both while selected and unselected; its foreground ripple must be visible and clipped to the row.
3. Tap `drawer-host-<hostId>` for another paired Host. Check its selected row, title, icon and conversations agree. Open a conversation and read its owning Host's canonical record. Switch back to All and verify it retains that current Host. Choose All while a Host switch is pending; the completed switch must not overwrite All. On device, rapidly choose B then A from current A; after settling, current Host, persisted Host and filter must all end on A. With a third disposable Host C, rapidly choose B then C and verify all three facts end on C. Restart and confirm the persisted owner agrees. The automated Host Session test controls SecureStore completion order for deterministic delayed-write coverage; rapid native taps alone do not prove that timing case.
4. Search in the selected list, clear search, scroll a long list and return to the drawer. Confirm labels wrap and all actions remain reachable at maximum text size. Confirm the new title glyphs and drawer All icon grow with their labels without clipping or double scaling.
5. Customize the current Host to orange, then teal, then default. With the current Host selected, Android's app accent changes in both schemes. Switching to All or a cloud view restores the default accent; switching back restores the Host tint. iOS's accent stays unchanged. The header icon reflects the Host colour on both platforms.
6. On iOS, swipe within the existing `EDGE_WIDTH` at the left edge to open the drawer, then close it by swipe and backdrop. A horizontal swipe away from the edge must not page the list. Android Back dismisses the drawer.
7. On iOS, tap `settings-button` from Chats, dismiss the existing sheet, then repeat from Activity. Confirm the original page stays selected and its state remains on dismissal, with one gear entry in the bottom island and none in the Chats header. Capture matched before/after in light/dark at default/intermediate/maximum system text; check labels, hit targets and Close/swipe. No model or preference change is needed. Android retains only its Chats header gear.
8. Remove only a disposable selected QA Host. Check the view returns to All. In an isolated unpaired app state, cancel pairing and check the empty home remains. An unpaired account row opens the selected account pairing page directly.

Keep matched before/after screenshots, accessibility snapshots and console/runtime errors for each changed state. Web previews and source tests do not qualify native gestures, Android colour rendering or large-text usability.

## Gotchas

- All covers the current Host plus cloud workspaces, not every paired Host. The drawer's existing bounded status glances are not concurrent conversation feeds.
- Host looks remain device-local. There is no cross-device pairing or appearance sync.
- Preserve the cloud feature flag and the existing cloud-enabled empty-home route separately from first-run pairing.
- Never reset a Human's pairings or take another runner's device, Metro or Host. Unavailable native lanes remain explicitly untested.
