# ADR-0271: Android profile dragging keeps the real scene

- Status: Proposed
- Date: 2026-10-29
- Related: [#3146](https://github.com/BotHarness/DeepSeekBot/issues/3146)

## Context

Animating a preview and pushing a route on release cannot show the actual profile while the finger changes direction. The profile pager, reply gesture and system edge Back already own different interactions.

## Decision

Android conversations own a retained real Bot, group or pair profile inside a native Material `SideSheetBehavior` container. Native code owns movement and settling; JavaScript receives opening and settled-state events only. Full-width mode moves the conversation, identity header and composer together. Once expanded, the profile pager owns horizontal gestures. System edges remain reserved.

Route entry points share their profile controllers with this panel. The conversation's Host/Channel key bounds its lifetime. Profile visibility combines with route focus: reopening refreshes cached data, hiding pauses subscriptions, and nested routes retain editor guards. A file's “view message” action reveals the conversation after successful navigation.

Activity uses a standard, nonmodal side sheet with a fixed title and Close, no scrim, and operable background and bottom navigation. Its list clears the navigation bar. Back ownership exists only while the screen is active, and yields to the IME.

The existing Android identity header is a custom-content exception: the native-stack header is outside the draggable scene and cannot travel atomically with it. Reuse the accessible identity Chip and Back control inside the native content slot, without separate frame updates. iOS keeps native-stack presentation.

## Alternatives

- Preview followed by route push: fails continuous real-content dragging.
- Global navigator inside a drawer: couples unrelated routes to a conversation gesture.
- A scrim inside the Activity feed: cannot isolate the external bottom bar; standard side-sheet semantics avoid partial modality.

## Consequences

A new Android native build is required. Retained state is temporary UI state; no Host authority, durable data or pairing changes. Reverting restores route-based Android profile entry. Native acceptance covers held/reversed dragging, keyboard, Back, child routes, cached reopening, large text and both themes; iOS remains separately qualified.
