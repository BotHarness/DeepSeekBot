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
Swipe left/right from the page content (including empty/loading states), not just the
tab strip, to switch pages. The underline tracks the gesture; short/cancelled drags
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

## Gotchas

The earlier PR #1928 evidence remains specific to its own commit and limitations. Native iOS and Android acceptance are separate; this map does not requalify earlier evidence.
