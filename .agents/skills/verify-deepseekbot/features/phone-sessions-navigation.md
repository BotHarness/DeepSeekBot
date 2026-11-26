# Phone Sessions navigation style and landing

## Sources

- `apps/mobile/src/features/sessions/{session-landing,session-drawer-navigation,drawer-root,last-session}.ts`
- `apps/mobile/src/features/sessions/{session-list-screen,session-drawer-panel,new-session-screen}.tsx`
- `apps/mobile/app/(tabs)/(sessions)/{sessions,new-session}.tsx`
- `apps/mobile/src/ui/interface-settings.tsx`

## Terms

- Sessions tab
- Session navigation style
- Session drawer
- New Session screen

## Sub-features

- `stacked`: in Stacked style the Sessions tab root is the Session list (the drawer's rows, Filter and sort, Search under the header, ✎ for the Host Owner). A Session is pushed with Back · name capsule · ✎; ✎ in the list pushes the New Session screen with Back; ✎ in a Session replaces it with the New Session screen. No drawer and no edge swipe.
- `settings`: Settings › This phone › Sessions (only while the Sessions tab is on) has Session navigation style (Drawer / Stacked), On launch (New Session / Session list / Last Session) and Returning to Sessions (Stay where you were / New Session / Session list). All are kept on the phone only.
- `switch`: changing the style needs no restart and keeps the open Session. With Returning to Sessions on Stay where you were, going back to Sessions shows it with the other style's header; with New Session or Session list, that destination is shown instead.
- `landing`: the first entry to Sessions after a cold launch follows On launch, later entries from another tab follow Returning to Sessions. In Drawer style, Session list is the New Session screen with the drawer open. Re-tapping the selected Sessions tab goes to the root.

## How to get to it (user POV)

Turn on the Sessions tab in Settings › This phone, then use the Sessions section under it.

## Driving it with verify-app

Use the designated [shared device QA runner](../../../../docs/agents/device-qa.md). Pair the app with a task-owned `verify-app` Host that has two native Sessions (create them with `deepseekbot session-create`, OpenCode Go only).

1. Drawer (default): tap Sessions, open a Session from the drawer, then in Settings choose Stacked. Tap Sessions: the same Session shows Back · capsule · ✎, and Back shows the Session list.
2. In Stacked, tap a row (pushed with Back), tap ✎ in the list (New Session with Back), then switch back to Drawer and confirm the open Session becomes the root with ☰.
3. For each On launch choice, terminate the app, relaunch, and tap Sessions. Last Session opens the Session opened last in the Sessions tab.
4. For each Returning to Sessions choice, open a Session, go to Chats, then tap Sessions.
5. Re-tap the selected Sessions tab from a Session in each style: it returns to the root.
6. Capture Light/Dark and the maximum text size for the list and the Settings section.

## Gotchas

- Landing runs from the tab bar press, so a long-press tab menu choice opens its own target and counts as the first entry.
- Sessions opened outside the Sessions tab (Chats, notifications) are not remembered as the Last Session.
