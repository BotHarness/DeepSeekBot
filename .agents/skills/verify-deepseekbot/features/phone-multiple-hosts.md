# Mobile multiple paired Hosts — Chats and Activity (#2782)

## Sub-features

Concurrent paired Host connections, online-only All directory, one collapsible Pinned
section, single-Host sections, source-bound chat navigation/actions and recovery.
Activity aggregation, source-bound approval/question actions and paginated badge counts. This journey requires native qualification;
a passing component test does not establish native behavior.

## How to get to it (user POV)

Pair two QA Computers, open Chats and choose All environments. Use the environment
selector to view one Computer, or the left drawer to inspect connection status.

## Driving it with verify-app

Submit to the shared device queue before using a phone, emulator, Metro or QA Host.
The runner needs two isolated QA Hosts with overlapping Bot slugs and Channel IDs,
different names, messages, custom sections and pinned conversations. No model is
required to verify routing; a real reply additionally needs a working model.

1. On All, verify both online Hosts appear, recent messages determine order within
   pinned and ordinary rows, one Pinned header collapses both sources, and custom
   sections do not appear. Check source icons and accessibility names in both themes.
2. Select A. Verify its custom sections/order and absence of B rows. Generate a new
   message on B; return to All and verify its latest preview and unread state updated.
3. Open the same-ID conversation on B while A is the management Host. Send a unique
   QA marker and read it back from B with the CLI; verify A has no marker. Repeat for
   group chat, profile/group settings and Browser/Computer routes. Check iOS preview.
   Keep A's same-ID chat in the navigation history, open B from All, then go Back:
   A's original route must remain distinct. Reopening an existing source-qualified
   chat from Activity should unwind to that route rather than duplicate it.
4. Disconnect B: All omits its rows without an offline notice. Its drawer shows the
   state. An already open B chat retains history and a typed draft; send is disabled.
   Reconnect B: it reappears, the draft remains, and nothing was sent automatically.
5. Disconnect both: All displays No online chats (暂无在线聊天). Reconnect either:
   rows recover independently. A slow or refused Host must not block the healthy one.
6. Exercise unpair/re-pair and foreground return; removed sources cannot receive
   actions. Check search, pull-to-refresh, keyboard dismissal, default/large text,
   TalkBack/VoiceOver and unchanged Cloud rows separately on Android and iOS.

7. Create same-ID approvals, questions and unread Channels on A and B. Activity shows
   source names with their colored environment icons and follows the selected filter; resolve B's approval and answer B's
   question, then read back only B's results. Page each category and change badge
   preferences. Verify late responses after a scope change cannot alter the new view.
8. Background the app, generate messages on both Hosts and tap a B notification while
   A is selected. Verify the destination and all actions stay on B. Return foreground
   with A offline: B catches up independently; restore A and verify its missed state.
   A notification may select B as the management Host through the native navigation
   flow, but must retain A's connection. A badge-only notification selects B Activity.
   A newer workspace selection or navigation reset must cancel a pending older tap.

Capture source/integrated SHAs, light/dark screenshots, actual A/B message readback,
and connection transitions. Redact credentials and unrelated conversations.

Verify new pairings receive an unused icon/color where available, existing custom looks
survive re-pairing, and icon changes update Activity without reopening it. In All Chats,
the environment name sits immediately after the first-line icon; the preview remains
the second line. Tap a real unread Activity row and the corresponding All Chats row:
both must open the originating Host conversation through Expo's outer root stack.

## Gotchas

The selected management Host is not the routing authority of an open conversation.
Identical local IDs on different Hosts are distinct. Do not substitute a mock send
for native source-routing evidence. All collapse state must not change Host sections.
Background delivery uses existing per-Host push preferences; foreground connections
alone do not prove background notifications. Report untested lanes plainly.
