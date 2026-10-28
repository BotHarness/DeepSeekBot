# Mobile workspace history

## Sub-features

Explicit Computer/All/Cloud workspace selection, stale account-route cleanup and retained tab roots (#2800; parent #2791).

## How to get to it (user POV)

Open a DM and its Bot Profile, then open the workspace drawer and choose another Computer or Cloud workspace. Use two paired QA Hosts and two Cloud accounts/Organizations. Ordinary Channel entry remains scoped navigation; changing the source for a notification must not reset its return path.

## Driving it with verify-app

Use the assigned Windows/Android or Mac/iOS shared device lane. Do not boot a private device or modify the shared QA Host outside its owner-cut batch.

1. From a DM with a Profile sheet above it, select another Computer. Confirm Chats shows that Computer and Back cannot revive the previous DM or sheet. Select All, then the same Computer twice; roots must not accumulate.
2. Repeat with a refused or unavailable workspace selection. The current usable page/history remains; inspect visible failure feedback and retry.
3. Switch Cloud Organization A to B repeatedly. There is one current Cloud list above the retained tab root. Header/native Back agree. Compare with existing #2186 platform/role acceptance; this slice does not replace its wider matrix.
4. While a Cloud selection is delayed, choose All or another Computer. Release the old response; it must not navigate. While a Host save is delayed, select a Cloud workspace; the old Host commit must not adopt afterward.
5. Log out or replace the account while old Cloud pages are in history. Account management stays usable; Back cannot revive old account pages. Unpair a Host and verify only that Host's routes are removed; valid routes for another Host survive.
6. Change only the selected current Host through a notification, or refresh a Cloud Organization/session with the same account. Confirm valid history is retained. Chats/Activity switching retains list position, filters and drafts; no whole-app remount or draft deletion is allowed.
7. Capture redacted before/after state and Back paths in light/dark and default/intermediate/maximum text sizes. Record Android hardware/predictive Back and TalkBack separately from iOS swipe/dismiss and VoiceOver. Keep native acceptance separate from source-test evidence.

8. On iOS, scroll a populated Chats list into history, record the selected environment and visible row positions, then right-swipe to Workspaces without choosing a row and left-swipe back. The same list instance, offset and search text remain; there is no new skeleton. Record a slow drag and cancellation: the tab bar travels with the complete Chats page and never appears over Workspaces. Repeat with three fast right/left flings starting over conversation rows: no row opens on release. Use a freshly rebuilt iOS binary containing the pinned pager native touch-cancellation patch; JavaScript reload alone is insufficient. Repeat from a typed search with the real keyboard, after Settings/Notifications, under live Reduce Motion, and at the three required text sizes in both themes. On Activity and inside a chat/profile, workspace paging must not intercept their gestures. This uses the native UIKit page-view controller, not the old stack-pop/skeleton-return path (#3017).

## Gotchas

Source tests do not qualify native gestures or accessibility. Account cleanup removes only explicitly scoped routes; ordinary notification source selection must preserve the return path.

## Automated coverage

`apps/mobile/test/workspace-navigation.test.tsx` drives the production drawer selection owner and Cloud selection adapter through the installed Expo stack reducer. `apps/mobile/test/workspace-lifecycle.test.tsx` mounts the production root lifecycle hook, changes external account/Host snapshots and asserts actual retained routes and Back. `apps/mobile/test/workspace-pager.test.tsx` covers retained child identity/input/offset, native commands, live Reduce Motion and inactive-tab gesture isolation; native motion still requires the assigned iOS device lane. Existing Host drawer and bottom-navigation tests remain part of the focused run.
