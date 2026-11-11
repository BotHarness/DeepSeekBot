---
Status: Proposed
Date: 2026-11-11
---

# Phone and computer tolerate each other's older release

## Context

The computer (Host) and the phone app ship separately. A phone may be paired with a computer one or more releases older or newer than itself, and the two have no shared release train.

Two gaps showed up before Tobs 1.7.0:

- An older Host answers a bridge method it does not have with HTTP 404 and a plain-text body. The phone checked Host health every 20 seconds with the new `ping` method and treated that 404 as an outage, so a new phone dropped a 1.6.1 computer every 20 seconds. #3600 had fixed the same mistake for the incremental chat-list methods one call site at a time.
- Neither side could tell the other's release. A change that needs both sides could only fail as an error or a disconnect, never as "update the other side".

## Decision

1. **A missing method is not an outage.** The phone's Host client turns HTTP 404 on a bridge call into "this computer's Tobs does not support it yet; update Tobs on the computer". Health checks fall back from `ping` to the Bot list when `ping` is missing, and only network, credential and Host-key failures (and a 404 on the Bot list itself, which every released Host has) count as offline. Optional reads (`unlessRefused`) treat a missing method like a refusal.
2. **The Host reports its version.** `ping` returns `{ ok: true, version }` with the installed Tobs version. Hosts before 1.7.0 have no `ping`, so the phone knows only that such a Host predates 1.7.0; it stays connected and explains each missing feature as in (1).
3. **The phone reports its version.** Every bridge request from the phone carries `x-tobs-app-version`, over direct routes as a header and over Connect and LAN inside the encrypted request frame, which the encrypted gateway passes on to the device gateway.
4. **Each side keeps a minimum for the other.** `packages/core/src/devices/client-compat.ts` holds `MIN_PHONE_APP_VERSION` (the Host's floor for the app) and `MIN_HOST_VERSION` (the app's floor for the Host). Both start at 1.6.0, so no released pairing is refused today. A request from an app below the floor gets `426 {code: "app-update-required"}`. A Host below the floor marks the phone's Host snapshot `compatibility.update = "host"`; a 426 marks it `"app"`. Neither disconnects: the phone keeps the connection so that the Human sees what to update. A missing, `0.x` (development) or malformed version never trips a floor.
5. **Raise a floor only with the release that needs it,** and only to a version that is already out on the other side; a floor is how a release says "the other side must update", not a way to retire old code early.

The phone shows `compatibility` in a follow-up slice; this decision fixes the wire contract first.

## Consequences

- A new phone works with a 1.6.x computer, minus the features 1.6.x lacks.
- Apps older than this change send no version, so a Host cannot refuse them by version. That is intentional: those apps would not understand the refusal either.
- Changes whose effect the other side must understand (for example new Connect zones, ADR-0313) still need a reader-first rollout: ship the side that understands the change, then turn the change on once its floor allows it.
