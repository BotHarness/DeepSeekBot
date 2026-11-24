# Phone tab long-press menus

## Sources

- `apps/mobile/src/ui/shell/{use-tab-menus,tab-menu-model,recent-sessions,open-activity-item,new-group}.ts`
- `apps/mobile/src/ui/shell/navigation-destinations.{ios,android}.tsx`

## Terms

- Environment Scope
- Sessions tab
- Chats

## Sub-features

- `chats`: long-press Chats lists the four conversations (Bot DMs, Channels, people DMs) with the latest activity on connected Computers in the Environment Scope, then New Group when the scope allows creating a Group. A row selects Chats and opens the conversation; New Group opens the same form as the header +. Cloud workspace conversations have no activity time and are not listed.
- `sessions`: with the Sessions tab on, long-press Sessions lists the selected Host's four Sessions with the latest Human turn, then New Session for the Host Owner only. Bot Sessions are left out while the phone hides them (drawer Filter and sort → Bot Sessions: Hide). A row selects Sessions and opens the Session in place of the current Sessions screen, as the Session drawer does; New Session opens the Sessions tab root, the New Session screen.
- `activity`: long-press Activity lists the four newest pending items in the scope as "Bot: summary". A row selects Activity and opens the item as a tap in the Activity list does.
- `settings`: Settings has no menu; a tab with nothing to list has none either.
- `tap`: a plain tap still flashes the name pill and cross-fades.
- `a11y`: iOS VoiceOver reaches the menu through the context menu's system action on each tab button. Android TalkBack reads each tab's name, selected state and Activity count and offers a "Recent items" action.

## How to get to it (user POV)

Pair a Computer with a few conversations, a pending approval and some Sessions, then press and hold a tab icon at the bottom of the screen.

## Driving it with verify-app

Use the designated [shared device QA runner](../../../../docs/agents/device-qa.md). Seed a task-owned Host with `verify-app` (two Bots with DMs, a Group, one pending tool approval, two Sessions) and pair the app; no model is needed for the menus, only for creating real Sessions.

1. On iOS, hold the tab with agent-device `longpress <x> <y> 1500` (agent-device 0.21.36 opens the SwiftUI context menu on the iOS 27.2 Simulator; the snapshot shows `_UIContextMenuActionsOnlyView`), and record the menu.
2. Check each row: Chats rows open the DM or Group on the Chats tab, New Group opens the Group form, Sessions rows open the Session on the Sessions tab, Activity rows open the conversation or request.
3. Change the Environment Scope to another Computer and confirm the Chats and Activity menus follow it; as a Team member without Group creation, New Group is absent.
4. On Android (Windows or Linux lane), long-press each tab: the Expressive dropdown is anchored above the tab, the tab is not selected by the press, and TalkBack's actions menu on the tab lists "Recent items".
5. Capture Light/Dark and the maximum text size for each menu.

## Gotchas

- Older agent-device builds turned `longpress` into a tap on the iOS Simulator; if the snapshot shows no context menu, check the agent-device version before suspecting the app.
- The Sessions list is read from the Host when the island mounts, when the Host comes online and on every tab change, so a Session created a moment ago appears after the next tab switch.
