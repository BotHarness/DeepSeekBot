# ADR-0319: Android message targets acknowledge native bounds

Status: superseded by ADR-0320 on 2026-11-12. RecyclerView became the only Android chat list and owns exact index landing, so the FlatList message target and `EXPO_PUBLIC_MESSAGE_JUMP` were removed.

## Decision

`EXPO_PUBLIC_MESSAGE_JUMP=native` selects native final positioning on Android API 29 and newer when the module exists. JavaScript keeps focus intent, request identity, pagination and the FlatList seek that mounts a distant row. A native wrapper then maps actual row and ScrollView geometry into window coordinates, accounts for inverted transforms, header/composer clearance and the visible window, and clamps the exact offset to content bounds. Oversized rows expose their beginning. Two stable observations acknowledge the same request; viewability alone does not complete it.

The candidate uses immediate positioning, including the preliminary seek, so an earlier smooth scroll cannot overwrite final placement. The JS baseline remains unchanged, and older binaries/API levels use it. Native wrappers preserve Fabric child layout and release their observer when detached. Drag cancellation and request replacement remain owned by the conversation screen; stale acknowledgments are ignored.

## Limits

FlatList still needs an approximate seek for an unmounted target. This slice does not claim to eliminate that seek or replace the list. Native device checks must cover keyboard transitions, large rows, dynamic height, delayed history, rapid target replacement, drag cancellation and both themes. No measured improvement is claimed before A/B.
