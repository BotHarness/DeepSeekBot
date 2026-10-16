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

## Gotchas

This is a shared-Simulator manual path using existing QA records, not a fresh-Host scripted journey. Follow [shared device QA](../../../../docs/agents/device-qa.md). The recorded evidence in [PR #1928](https://github.com/BotHarness/DeepSeekBot/pull/1928) has its own commit and limitations; this map update does not requalify touch timing, overflow scrolling, Android or a physical phone.
