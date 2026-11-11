# ADR-0320: Android RecyclerView keeps inverted coordinates

Status: accepted; the only Android chat list since 2026-11-12 (see Rollout)

## Context and decision

Android currently uses newest-first data and inverted rendering with the latest edge at offset zero. iOS uses oldest-first top-down rendering. The shared top-down statement in DESIGN.md was inaccurate. Keep Android's existing direction; changing direction at the same time would combine keyboard, follow-latest and history semantics with list replacement.

Android draws every conversation in a RecyclerView on every supported API level (see Rollout). RecyclerView owns scrolling and native holders. The adapter sends a bounded viewport window to React; React renders the existing message components only for that window. Stable row keys survive window changes, and native stable IDs avoid hash collisions. Yoga remains the authority for each cell's content height, reported through layout; a native prefix-sum index keeps offset queries and height updates logarithmic.

On history and height changes, native restores the current row identity and screen position while browsing, or the zero offset while following. IME animation updates native padding; the existing composer overlay stays owned by keyboard-controller. User dragging cancels targeted positioning. Exact index landing waits for a measured target and uses clamped native offsets. The FlatList message-target experiment (ADR-0319) was removed because RecyclerView owns that operation. While following the latest message, RecyclerView keeps offset zero itself, so JavaScript treats it as native following, as it did the FlatList LatestAnchor view that Android no longer uses.

## Coordinate boundary

Fabric does not know the native holder's reparented position. Message menus, selection and send-flight measurements therefore use actual Android view bounds, mapped to the window through each ancestor's transform and offset (View.transformMatrixToGlobal needs API 29; the app supports API 24). Native sticky avatars already use actual Android bounds. The legacy JS per-block Markdown window is not used inside recycled rows because it depends on a single Fabric content surface; each mounted row keeps its full Markdown. Row virtualization remains bounded. Plain and Markdown text messages that need no React decoration are drawn natively instead (see Rollout).

## Verification and rollout

Tests cover bounded React/native windows, stable IDs, variable row heights, native row gestures and navigation. Physical acceptance covers gesture arbitration, links/selection, menus, font changes, live streams, draft commit identity, history prepends, keyboard transitions, multi-line send, target replacement and detach.

## Rollout (2026-11-11)

A one-run-per-arm comparison on a 120 Hz phone (main 05fb4a182) favoured RecyclerView with native Markdown rows over FlatList with React rows: cold-paging app deadline misses 54 vs 148, main-thread doFrame P95 8.0 ms vs 11.5 ms, and a longest back-to-latest frame of 49 ms vs 494 ms. RecyclerView with native rows became the Android default on 2026-11-11 and, on 2026-11-12, the only Android path: the FlatList fallback, `EXPO_PUBLIC_CHAT_LIST`, `EXPO_PUBLIC_NATIVE_ROWS` and the plain-text-only native row mode were removed.

Native rows handle the gestures React bubbles do: a tap opens the anchored message menu with the bubble's window rect, a long press selects, and a horizontal drag replies with the ReplySwipe thresholds. The view sends these to JavaScript as `onRowAction`; JavaScript drops a tap or long press while the keyboard is up, as the responder capture does for React rows.

The project owner chose the default rollout on the performance comparison and a physical walk of tap, long press, reply swipe, keyboard-open and keyboard-closed send, following an incoming reply, back-to-latest, dark appearance, and 0.85×, 1.3× and 2.0× system text with the message menu. The owner waived the TalkBack check for this rollout.
