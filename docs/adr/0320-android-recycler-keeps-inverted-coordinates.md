# ADR-0320: Android RecyclerView keeps inverted coordinates

Status: accepted; default on Android API 29+ since 2026-11-11 (see Rollout)

## Context and decision

Android currently uses newest-first data and inverted rendering with the latest edge at offset zero. iOS uses oldest-first top-down rendering. The shared top-down statement in DESIGN.md was inaccurate. Keep Android's existing direction for this experiment; changing direction at the same time would combine keyboard, follow-latest and history semantics with list replacement.

`EXPO_PUBLIC_CHAT_LIST=recycler` selects an Android API 29+ RecyclerView when the rebuilt module exists. Every other setting and older binaries keep FlatList. RecyclerView owns scrolling and native holders. The adapter sends a bounded viewport window to React; React renders the existing message components only for that window. Stable row keys survive window changes, and native stable IDs avoid hash collisions. Yoga remains the authority for each cell's content height, reported through layout; a native prefix-sum index keeps offset queries and height updates logarithmic.

On history and height changes, native restores the current row identity and screen position while browsing, or the zero offset while following. IME animation updates native padding; the existing composer overlay stays owned by keyboard-controller. User dragging cancels targeted positioning. Exact index landing waits for a measured target and uses clamped native offsets. The separate FlatList message-target experiment is bypassed here because RecyclerView owns that operation.

## Coordinate boundary

Fabric does not know the native holder's reparented position. Message menus, selection and send-flight measurements therefore use actual Android view bounds in this candidate. The default path retains the existing measurement. Native sticky avatars already use actual Android bounds. The legacy JS per-block Markdown window is not used inside recycled rows because it depends on a single Fabric content surface; each mounted row keeps its full Markdown. Row virtualization remains bounded. This trade-off must be included in memory/frame comparisons; it is not evidence of a win. The native Markdown experiment recognizes the RecyclerView scroll container and can be combined with this switch; its native geometry avoids the legacy Fabric content dependency.

## Verification and rollout

Tests cover bounded React/native windows, stable IDs, variable row heights, default fallback and navigation. Physical acceptance must cover gesture arbitration, links/selection, menus, TalkBack, font changes, live streams, draft commit identity, history prepends, keyboard transitions, multi-line send, target replacement and detach. Hold other switches fixed during A/B. No production default or performance claim changes before that evidence.

## Rollout (2026-11-11)

A one-run-per-arm comparison on a 120 Hz phone (main 05fb4a182) favoured RecyclerView with native Markdown rows over FlatList with React rows: cold-paging app deadline misses 54 vs 148, main-thread doFrame P95 8.0 ms vs 11.5 ms, and a longest back-to-latest frame of 49 ms vs 494 ms. RecyclerView with native rows is now the Android default. `EXPO_PUBLIC_CHAT_LIST=flatlist` restores FlatList and `EXPO_PUBLIC_NATIVE_ROWS=off` keeps every row in React (`text` limits native rows to plain text).

Native rows handle the gestures React bubbles do: a tap opens the anchored message menu with the bubble's window rect, a long press selects, and a horizontal drag replies with the ReplySwipe thresholds. The view sends these to JavaScript as `onRowAction`; JavaScript drops a tap or long press while the keyboard is up, as the responder capture does for React rows.
