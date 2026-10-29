# Native activity rows

## Sub-features

DM/group activity layout, full details, explicit navigation and device-local DM visibility switches.

## How to get to it (user POV)

Open the dedicated QA DM or group in the paired phone app. Activity rows appear in its conversation timeline; long-press a row for details and explicit destinations.

## Driving it with verify-app

Use the shared device queue; reuse its sole assigned Simulator and existing dev
client for this JavaScript-only change. Do not run a second Simulator or restart
the shared QA Host. Use only the dedicated QA conversations.

1. In a Human/Bot DM with a message followed by multiple activity records, compare
   bubble-to-activity and activity-to-activity boundaries: one `space.x4` (12pt) gap,
   one line per activity, tail ellipsis for long content, icon at the Bot bubble's
   left edge. The current Bot has no repeated avatar/name; a Bot-DM action shows
   the recipient avatar after its icon.
2. In a group, check actor avatar in the speaker gutter, then kind icon aligned
   with the message bubble's left edge, then actor and description. Check both
   themes with the same records and font setting.
3. Tap a memory/post/creation row: remain in the conversation. Long-press it:
   full actor/action/details appear in the existing message-menu presentation,
   without reactions. Long text scrolls rather than truncates; Copy uses the full
   text. Cancel, outside press, Android back and accessibility escape dismiss.
4. Select Open memory/conversation/new Bot explicitly: the menu dismisses before
   navigating, and the destination matches the record. A row without a target
   still opens details but has no navigation action. Test the accessibility
   details action separately; it must not bypass the menu.
5. Confirm ordinary bubble reactions/Copy/Share and DM-only activity filters
   still work. Record source and integrated batch SHAs and capture DM/group/menu
   before/after in light/dark; disclose physical-device and Android gaps.


## Activity list triage (#1954, #3146)

Use the shared-device queue. Open Activity on the selected QA Host with a pending
question/approval, a Human mention, a reply and ordinary unread group messages.
Confirm one virtualized list without Needs you / For you tabs or a category pager.
Entry and Reset show All: Needs you first, For you next, then unread conversations.
Handled, snoozed and cleared history remain explicit category filter choices.

On Android, tap the header filter button: it directly opens the modal end side
sheet above the bottom navigation. A left swipe on the screen also opens it.
Close with the header action, scrim and Android Back; each dismisses only the sheet.
Its fixed title and scrolling controls remain reachable at maximum system text.
On iOS, verify the existing filter sheet separately.

Combine category, Bot, Channel and unread-only filters. Reset restores All and
default filters without clearing search. Newest/oldest sorts loaded categories
together by time; load-more controls remain reachable after the rows. Search a
safe summary beyond the first page and load more. Clear search to restore rows.
Open and close filters with an unsent question draft; its choices must survive.
Check Clear/Undo and snooze through the canonical CLI reads below.

Scroll down/up to hide/restore header and global navigation; search and filters
keep controls reachable. Pull-to-refresh and bottom bounce must not flicker the
chrome. A failed query retains stale content with an error; an unsupported Host
asks for an update. Record source/batch SHAs and matched light/dark screenshots
at default/intermediate/maximum text. Web preview does not qualify native
keyboard, safe-area, Back or scrolling behavior.

## Swipe to clear (inbox triage)

`node scripts/e2e-mobile-activity-swipe-web.mjs` drives it end to end in the web preview against a
fresh isolated Host and a real model turn, and keeps light/dark screenshots in its evidence folder.
On a native build, check each step on iOS and Android separately:

1. For you: swipe a reply left past half the row. It leaves, an undo bar says "Cleared · Undo",
   and `deepseekbot inbox --category replies --dismissed` lists it. Undo brings it back on the
   phone, and the CLI no longer lists it as dismissed. Desktop Activity hides and shows it too.
2. Swipe a short way and let go: Clear stays revealed; tap the row to close it. Open a second row:
   the first closes. Long-press a row: the same action is in the native menu; VoiceOver/TalkBack
   offer it as an action.
3. Needs you: a pending approval offers Tomorrow and Later… but never Clear. Swipe through: it is
   snoozed to 9:00 tomorrow (`inbox --category action --snoozed`) and the Bot is still waiting.
   Later… lists 1 hour, this evening (until 17:30), tomorrow and next week.
   An interrupted message (`bot-message-needs-repair`) is the exception: it offers Clear and Later…, and
   its detail page explains it with Open conversation (focused on that message) and Clear.
4. Filters → Cleared and Snoozed list those rows with Restore/Unsnooze. A Host without
   `dismissed` support shows the update error under Cleared.
5. Vertical scrolling, pull-to-refresh and rightward drags never open a row. Newest action is first
   by default.

## Gotchas

For navigation responsiveness (#2111), time Chats → Activity separately from the data read. Cold-open, then repeat after idle prefetch and after returning from a visited page. The title/three tabs and a bounded skeleton must appear without awaiting a slow initial request. Returning to the same Host/query shows its retained data while refreshing; failure keeps that data plus Retry. Change Host and filters to confirm cache isolation. Switching away stops the scoped view subscription while the shared Host remains connected. Keep pending question choices and each visited page's scroll position, and confirm no loaded question re-enters its initial loading state. Profile the actual switches and long history/streaming with fixed input; record Debug versus production-JS versus Release, JS versus presented-frame measures, and leave 120 FPS unqualified without the corresponding native proof.

The earlier PR #1928 evidence remains specific to its own commit and limitations. Native iOS and Android acceptance are separate; this map does not requalify earlier evidence.

Load a second Activity page, switch away and return, then wait for refresh: both loaded pages remain when Host data is unchanged. Repeat with a cached refresh error and delay the next read; Retry must queue a fresh read through the current query instance. Changed Host data may still move rows; this check does not establish scroll anchoring across arbitrary inserts or deletions.


## Explicit iPhone Lock Screen request tracking (#2815)

This native addition requires a rebuilt SDK 58 app with Expo Widgets and an explicitly
configured Connect ActivityKit provider. The existing shared client is stale for this
feature. Source/API checks are not evidence of native or background delivery. Reserve
the real iPhone lane; do not configure/deploy the provider under source-work authorization.

Send one request from the current phone in its Computer DM. After canonical acceptance,
use **Track latest request / 跟踪最新请求** in the DM header. Request text must not appear on
the Lock Screen. Stop must only stop the display. Another request requires an explicit
switch; a desktop-created history message must not become this phone's tracking target.

Correlate the exact `send-status` Source Event and explicit Inbox resolution with a recording
of foreground start, backgrounding, locking, remote update and tap back to that same
Computer/Channel/message. Verify cold start, identical Bot names on two Computers,
old links, token rotation, system dismissal, account sign-out, pairing revocation and
source switch. Drop connectivity long enough to see the OS stale presentation. Disabled
Live Activities, an old native binary and an unconfigured/LAN-only Computer must refuse
clearly without a foreground-only substitute. Verify both languages, light/dark, Dynamic
Type and VoiceOver. Measure visible start, remote update latency and added energy on the
real device; leave those fields UNTESTED until measured. Current retry/repair facts stay
unknown/nonterminal; no terminal request failure authority is implemented in this slice.

## Bot activity chart inspection (#3032)

On the isolated QA Host, use a Bot with genuine token usage. Record the canonical
`bot-activity-history <bot-id> --weeks 1` result before interacting. From its
native profile, open Activity. Confirm that the total and populated day match
that result; do not manufacture historical database rows.

On iOS, tap a populated day: the date and full compact value remain visible.
Tap it again to clear. Scrub horizontally across the chart in both directions,
including returning to the day selected before the drag. Capture intermediate
readings during the actual gesture, rather than only after release. Release or
cancel an active scrub: the reading clears. A tap or vertical scroll which does
not activate horizontal inspection must not run the active-scrub cleanup.
Vertical page scrolling still works when starting within the plot. Check both
the Bot activity screen and the controlled chart in Settings → Usage.

Capture matched before/after native light/dark images at default, intermediate
and maximum system text settings. English values such as `28.8K tokens` must
remain complete, with date and value wrapping inside the chart width. Include
first/last day readings and verify VoiceOver adjustable actions separately when
available. Keep physical iPhone, Simulator, Android, Human haptics and VoiceOver
results distinct; an event trace or DOM test does not prove visible native text.
Restore the original language, theme and system text settings afterward.
