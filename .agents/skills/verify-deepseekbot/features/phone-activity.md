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


## Activity tab triage (#1954)

Use the same shared-device queue. Open Activity on the selected Host with a pending
question/approval, a Human mention, a reply and ordinary unread group messages.
Confirm exactly three pinned, underlined tabs: Needs you (default), For you and
Other unread. Needs you retains approvals, formal questions and private input.
Switch all three tabs; only their own rows appear, without collapsible section
headings. The selected tab shows its leading icon and underline together; inactive
tabs show only their labels. All three blocks have equal width; the selected icon and
label are centered together and its underline fills the entire block without gutters.
Swipe left/right on the tab strip to switch pages; a horizontal swipe on a row is that
row's swipe action (below), not a page change. The underline tracks the gesture; short/cancelled drags
return to the same page. Confirm the incoming icon is already partially visible before the page settles.
On a populated page, scroll down: the Activity title/filter/search row and global bottom
navigation leave, while all three tabs remain pinned beneath the safe area. Rows have no
top fade. Reverse direction and return to the top: controls return. Short/empty pages,
pull-to-refresh and elastic bottom bounce must not flicker the controls. While search or
filters are open, keep their controls reachable. Switch pages while collapsed, confirm
chrome restores and visited lists retain position. In Chats, repeat down/up scrolling
to hide/restore the same global navigation. Native iOS and Android need separate proof.
Its fade/scale and label movement track the same drag as the underline; cancelling
reverses them, with no late icon pop or layout jump. Then scroll vertically, switch away/back,
and confirm its scroll position is retained. Vertical scrolling and pull-to-refresh
must not switch pages. Check repeated fast direction changes and tap-to-third-tab.
Return to a loaded question and confirm it does not flash a loading card or lose
its unsent choices. Include very long unread summaries: previews remain bounded
while opening the row still reaches its full conversation.
All and handled history remain available through the filter. The header contains
sorting, filtering and Activity search; no permanent chips appear above the feed.
Open Filters, combine Bot/Channel/unread/category, switch tabs and confirm those
other filters survive. Reset returns to Needs you and default filters, preserving
the search. Close the sheet. While a question submission is pending, switch tabs;
a late refusal must not restore its post in the new tab. Repeat with a page swipe.
Search a safe summary beyond the first page and use Load more. Default ordering
puts mentions before replies; explicit newest/oldest replaces that priority.
Scroll under the header with search open and closed; verify light/dark and large
text. A failed query retains stale content with an error; an unsupported Host
asks for an update. Capture matched screenshots only after driving these controls.
Web preview evidence does not qualify native keyboard, safe-area or scrolling.

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
