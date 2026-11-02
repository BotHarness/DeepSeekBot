# ADR-0272: Settings is a mobile tab

- Status: Accepted
- Date: 2026-10-28
- Related: ADR-0211

## Context

ADR-0211 gave the mobile app two tabs and moved Settings into a sheet. Later, iOS and Android added a Settings item to the bottom navigation bar, but it still opened the sheet over the current tab and never showed as selected. A tab-shaped item that opens a sheet behaves unlike its neighbours: it does not hold its place, it cannot be returned to, and its child pages stack inside a sheet.

## Decision

- **Settings is the third tab.** Chats, Activity and Settings are tab routes. Selecting Settings shows its page in place and marks the item selected, like the other two. The page has the platform's standard header: a large title on iOS and a top app bar on Android.
- **Child pages push as full pages.** Account, Usage, Models, Notifications, Storage, App icon, Activity counts and Chat background push on the app stack with the standard Back action, so the bottom bar stays on the three top-level pages only. Their URLs do not change (`/settings/...`).
- **Settings rows stay as they are.** The page uses the same `SettingsForm` rows and the `overlay` surface the sheet used.

## Considered options

- **Keep the sheet behind the tab item.** It keeps the current tab visible, but the bar item does not behave like a tab.
- **Push child pages inside the Settings tab.** The bottom bar would stay visible on every child page, and each one would need room reserved for it.

## Consequences

ADR-0211's Settings sheet is superseded on iOS and Android. Code that opens `/settings` now selects the Settings tab. The Web preview shows the same three tabs and drops its separate Chats header gear.
