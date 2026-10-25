# Mobile multiple paired Hosts — Chats (#2782)

## Sub-features

Concurrent paired Host connections, online-only All directory, one collapsible Pinned
section, single-Host sections, source-bound chat navigation/actions and recovery.
Activity aggregation is a subsequent slice. This journey requires native qualification;
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
   group chat, profile/group settings and the full-client route. Check iOS preview.
4. Disconnect B: All omits its rows without an offline notice. Its drawer shows the
   state. An already open B chat retains history and a typed draft; send is disabled.
   Reconnect B: it reappears, the draft remains, and nothing was sent automatically.
5. Disconnect both: All displays No online chats (暂无在线聊天). Reconnect either:
   rows recover independently. A slow or refused Host must not block the healthy one.
6. Exercise unpair/re-pair and foreground return; removed sources cannot receive
   actions. Check search, pull-to-refresh, keyboard dismissal, default/large text,
   TalkBack/VoiceOver and unchanged Cloud rows separately on Android and iOS.

Capture source/integrated SHAs, light/dark screenshots, actual A/B message readback,
and connection transitions. Redact credentials and unrelated conversations.

## Gotchas

The selected management Host is not the routing authority of an open conversation.
Identical local IDs on different Hosts are distinct. Do not substitute a mock send
for native source-routing evidence. All collapse state must not change Host sections.
Background delivery uses existing per-Host push preferences; foreground connections
alone do not prove background notifications. Report untested lanes plainly.
