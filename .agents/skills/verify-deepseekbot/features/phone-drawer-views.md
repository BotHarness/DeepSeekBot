# Phone Environment sheet and Chats header

## Sources

- `apps/mobile/src/ui/shell/{environment-sheet,environment-sheet-rows,environment-settings-row,host-drawer-model,host-drawer-state,home-header}.{ts,tsx}`
- `apps/mobile/app/environment.tsx`

## Terms

- Environment sheet
- Environment Scope
- Chats

## Sub-features

- `entry`: Settings' **Environment settings** group starts with an "Environment" row showing the current Environment name; it, the Chats header's Environment name (a button with ▾) and the Session drawer's Environment name open the Environment sheet: a native iOS form sheet with medium and large detents, or the Android modal bottom sheet. There is no left-edge or anywhere swipe and no Android search-bar menu button ([ADR-0364](../../../../docs/adr/0364-environment-switching-lives-in-settings.md), amended by #5130). The sheet's + (top-right) opens pairing directly, or a native menu with Pair a new computer and Join by link or QR when Cloud is on.
- `settings-groups`: Settings reads account, Environment settings (Environment row, Usage, Model providers, Voice, Model configuration, Prompt presets, Storage, with a footer naming the Computer), This phone (Notifications and interface preferences), About. Under All the footer names the most recently used Computer.
- `all`: the first row selects All without switching the current paired Host. Chats renders one list containing every loaded online Computer (offline Computers are left out) and available cloud workspaces.
- `host`: choosing a Computer closes the sheet and queues its switch through the existing Host Session. Each switch waits for the prior save/adopt to settle before checking the current Host. Only the latest successful choice selects its conversation filter, so the final Host owner, persisted Host and selected Host view agree. A failed switch does not block the next choice. All updates the filter immediately without cancelling an already requested Host switch. A successful choice keeps ADR-0272's reset: scoped details and sheets close and every tab stack returns to its root, while Settings stays the selected tab.
- `cloud`: with Cloud enabled, cloud workspaces follow the Computers; choosing one opens its Cloud list as before. Pair a new computer, Join by link or QR and Manage cloud services come last.
- `header`: All shows the Chats title and a chat icon; a Computer shows its device-local name, icon and colour. The name is plain header text: it is not a button and announces the full selected view name (including cloud disambiguation) in the current locale. Title icons follow their label roles and live system text size. Removing a selected Host falls back to All.
- `create-actions`: On Chats, tap the **+** beside Search in the navigation bar (iOS, shared Liquid Glass bar buttons) or top app bar (Android, M3 Expressive split button); the card grows out of it toward the bottom leading corner. The creation card shows New Group and the creation rows permitted in the current workspace. Create Bot reveals Blank, Marketplace, ZIP and Git in the same card. Verify Back returns to the first level, a scrim tap dismisses either level, the labels and symbols grow at maximum text size, and Reduce Motion uses fades.
- `accent`: Android's root accent follows the current Host colour in each scheme only while that Host's filter is selected. All, cloud, a different Host filter and a Host without a colour keep the default theme. iOS keeps its existing accent.
- `pairing`: cancelling first-run pairing leaves the empty home; account rows in the Environment sheet open `/pair/account` with the selected account id. Cloud entries follow the existing feature flag.

## How to get to it (user POV)

Open Settings in the paired app and tap the first row, Environment. Choose All, a Computer or a cloud workspace. Open a Computer's ⋯ menu (or long-press it) to change its device-local icon and colour, its connection, or to unpair it.

## Driving it with verify-app

Use the designated [shared device QA runner](../../../../docs/agents/device-qa.md), with the Windows [Android lane](../../../../docs/agents/android-device-qa.md) and the Mac/iOS lane. Record the exact PR head, batch head, native build provenance and assigned Host. This journey needs two paired QA Hosts for switching, but no model, push, camera or real tailnet. Any optional model run uses `deepseek-v4-pro`.

1. Capture the base and candidate with the same data, locale and viewport. On each platform, run default/intermediate/maximum system text sizes in light and dark.
2. On Chats, tap the Environment name (`chats-environment-name`): the Environment sheet opens and a selection keeps you on Chats. A swipe from the left edge does nothing, and on Android the expanded search bar has no menu button. On iOS, a left swipe on Chats still reaches the last conversation.
3. Open Settings and tap `settings-environment`. On iOS check the sheet opens at the medium detent and drags to large; on Android check the modal bottom sheet, its handle and Back. Tap `environment-all`. Check the sheet closes, Settings stays selected and its row now reads All, and Chats shows All with one list. With TalkBack/VoiceOver, focus the Chats title and confirm it announces the complete selected All/Host/cloud name as a header.
4. Reopen the sheet and tap `drawer-host-<hostId>` for another paired Host. Check Chats, Activity and Sessions all follow it, and the row, header, icon and conversations agree. Choose All while a Host switch is pending; the completed switch must not overwrite All. On device, rapidly choose B then A from current A; after settling, current Host, persisted Host and filter must all end on A. Restart and confirm the persisted owner agrees.
5. From a DM with its Profile open, go to Settings and choose another Computer. Back cannot revive the previous DM or sheet.
6. Customize the current Host to orange, then teal, then default from its ⋯ menu. With the current Host selected, Android's app accent changes in both schemes. Switching to All or a cloud view restores the default accent. The header icon reflects the Host colour on both platforms.
7. Remove only a disposable selected QA Host. Check the view returns to All. In an isolated unpaired app state, cancel pairing and check the empty home remains. An unpaired account row opens the selected account pairing page directly.

Keep matched before/after screenshots, accessibility snapshots and console/runtime errors for each changed state. Web previews and source tests do not qualify native gestures, Android colour rendering or large-text usability.

## Gotchas

- The sheet's status glances are bounded and are not concurrent conversation feeds.
- Host looks remain device-local. There is no cross-device pairing or appearance sync.
- Preserve the cloud feature flag and the existing cloud-enabled empty-home route separately from first-run pairing.
- Never reset a Human's pairings or take another runner's device, Metro or Host. Unavailable native lanes remain explicitly untested.
