---
Status: Proposed
Date: 2026-11-11
Issues: [#3998](https://github.com/BotHarness/DeepSeekBot/pull/3998)
---

# Phone and computer tolerate each other's older release

## Context

The computer (Host) and the phone app ship separately. A phone may be paired with a computer one or more releases older or newer than itself, and the two have no shared release train.

Two gaps showed up before Tobs 1.7.0:

- An older Host answers a bridge method it does not have with HTTP 404 and a plain-text body. The phone checked Host health every 20 seconds with the new `ping` method and treated that 404 as an outage, so a new phone dropped a 1.6.1 computer every 20 seconds. #3600 had fixed the same mistake for the incremental chat-list methods one call site at a time.
- Neither side could tell the other's release. A change that needs both sides could only fail as an error or a disconnect, never as "update the other side".

## Decision

1. **A missing method is not an outage.** The phone's Host client turns HTTP 404 on a bridge call into "this computer's Tobs does not support it yet; update Tobs on the computer". Health checks fall back from `ping` to the Bot list when `ping` is missing, and only network, credential and Host-key failures (and a 404 on the Bot list itself, which every released Host has) count as offline. Optional reads (`unlessRefused`) treat a missing method like a refusal.
2. **The Host reports its version.** `ping` returns `{ ok: true, version, minAppVersion }` with the installed Tobs version and the oldest app it recommends. Hosts before 1.7.0 have no `ping`, so the phone knows only that such a Host predates 1.7.0; it stays connected and explains each missing feature as in (1).
3. **The phone reports its version.** Every JSON bridge call from the phone (`/botharness-device/api/...`) carries `x-tobs-app-version`; uploads, streamed GETs and media fetches do not need it, over direct routes as a header and over Connect and LAN inside the encrypted request frame, which the encrypted gateway passes on to the device gateway.
4. **Each side recommends a minimum for the other, and never blocks.** `packages/core/src/devices/client-compat.ts` holds `MIN_PHONE_APP_VERSION` (sent as `minAppVersion` in `ping`) and `MIN_HOST_VERSION` (the app's own floor for the Host). `MIN_PHONE_APP_VERSION` starts at 1.6.0 and `MIN_HOST_VERSION` at 1.7.0, the first release with `ping`. A Host below the floor marks the phone's Host snapshot `compatibility.update = "host"`; an app below the Host's `minAppVersion` marks it `"app"`. Nothing is refused or disconnected: the Human keeps using what works and sees what to update, because a small incompatibility is often acceptable and the Human decides when to update. A missing, `0.x` (development) or malformed version never trips a floor.
5. **Raise a floor only with the release that needs it,** and only to a version that is already out on the other side; a floor is how a release says "update the other side for the best experience", not a way to retire old code early.

6. **The phone shows the suggestion where the Human looks, and lets it go.** The phone reads `ping` as soon as it connects to a saved or newly paired computer. A computer without `ping` predates 1.7.0, so it counts as below `MIN_HOST_VERSION` (now 1.7.0). The chat list shows a muted status chip for each connected computer that needs an update ("Tobs on this computer is out of date" or "Update this app"), with a "Got it" action that hides it for that computer and version until the app restarts. The computer's connection details list both versions. Nothing else changes: every feature the older side has keeps working.

## Consequences

- A new phone works with a 1.6.x computer, minus the features 1.6.x lacks.
- Apps older than this change send no version and ignore `minAppVersion`, so they get no prompt; they keep working as before.
- The phone sends its version on every JSON bridge call so that the Host can log or, later, adapt answers for an older app; the Host does not refuse by it.
- Changes whose effect the other side must understand (for example new Connect zones, ADR-0313) still need a reader-first rollout: ship the side that understands the change, then turn the change on once its floor allows it.
