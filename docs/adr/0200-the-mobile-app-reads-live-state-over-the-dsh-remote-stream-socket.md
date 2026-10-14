---
Status: Accepted
Date: 2026-10-14
Issues: [#1650](https://github.com/BotHarness/DeepSeekBot/issues/1650), [#1645](https://github.com/BotHarness/DeepSeekBot/issues/1645), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# The mobile app reads live state over the DSH Remote stream socket

The DeepSeekBot mobile app (`apps/mobile`, Expo) needs the Roster and each PersonaBot's live state from the Human's Host. The Host offers two encodings of the same typed frame source (ADR-0181): stream-mode Remote methods (`botharness/followRoster`, `botharness/followActivity`, `botharness/followChannel`) carried by DSH's multiplexed WebSocket at `/api/remote.mux`, and the kept SSE route `/api/botharness/stream`. The spec (#1645) asked the first tracer to choose between them with evidence.

## Decision

- The app consumes the typed streams over `/api/remote.mux`, speaking the Gateway's documented frame protocol (`@deepseek-ai/dsh-api-gateway/stream-protocol`: `open` / `item` / `error` / `end` / `cancel`, each with a client-chosen `streamId`; payload `{ args }`). Unary reads and writes use the same DSH HTTP unary envelope as the live CLI (ADR-0159).
- The app does not use the Web Client's `RemoteSnapshotStream` / `RemoteJournalStream` helpers, which live inside DSH's Client Cordis runtime. Its own Host client module owns the equivalent duties for the streams it reads: open, accept one baseline per generation, reconnect with backoff, and re-read unary state after each baseline.
- Authentication in this first slice is the Host's existing browser authority, development-only: a `GET /?token=` login mints the HttpOnly session cookie, and the WebSocket upgrade is admitted by the same Connection check as the browser (cookie plus the Host/Origin fence). On a phone the cookie lives in the app's platform cookie store; the launch token lives only in secure storage. The paired-device decision ([#1649](https://github.com/BotHarness/DeepSeekBot/issues/1649), ADR-0199) replaces it: the phone sends `Authorization: Device <id>.<secret>` to a BotHarness device gateway on the same listener, with the same unary envelope and mux frames. Only the app's carrier and login step change; the stream protocol, frames and Host client duties recorded here stay.
- The phone reaches a loopback-bound Host through `tailscale serve` (HTTPS on the tailnet name). The Host must list that name with `--trusted-host`; `scripts/dev-instance.mjs` now passes the flag through.

## Evidence

Recorded on 2026-10-14 against an isolated Host from `scripts/dev-instance.mjs` (DSH `0.2.0-rc.2`), from a non-browser Node client; the frames are committed as `apps/mobile/test/fixtures/host-wire.json` and replayed by the app's tests.

- An upgrade without the cookie answers `401`; with the cookie it answers `101`. With `--trusted-host`, a request whose Host header is the tailnet name passes the fence (`200`, upgrade `101`), and another name is refused (`403`).
- `followRoster` and `followActivity` open on one socket and yield their `baseline` items at once; an unknown endpoint fails only its own stream (`gateway/invocation-unavailable`), not the socket.
- A Human DM sent from another client produced, on the open streams, the roster `latest` frame for the DM and Activity `changed` frames `idle → thinking → idle` within about a second.
- Killing the Host and starting it again on the same home: the client went `connected → reconnecting → unreachable`, then `connected` about four seconds after the Host was back, without a new login, although the launch token had rotated (the cookie's signing secret is stored in the Host home).
- The Gateway README states that `./stream-protocol` "supplies the shared Remote stream framing and parser to native Desktop callers" using "the same authenticated WebSocket endpoint as the browser client", so a native caller is a supported consumer, not a reach into Web Client internals.

## Alternatives

- **The SSE route.** It carries the same frames, but React Native has no `EventSource` and its `fetch` does not stream response bodies without an extra native module; one SSE response per concern would also bring back the per-connection cost ADR-0181 removed. It stays served for the Web Client's fallback; the app does not use it.
- **Reusing the Web Client's Gateway Client.** Its stream helpers depend on DSH's Client Cordis runtime (`ctx.remote`, `ctx.connection`). Embedding that runtime in the app would tie it to DSH's unversioned Client internals, which hub #1643 rules out.

## Consequences

- The app depends on the Remote stream frame protocol and the Host's typed live frames. `apps/mobile/test/wire-contract.ts` checks at compile time that the Host's frame, summary and stream-protocol types still satisfy the app's reading of them, so a breaking Host change fails the root typecheck.
- Each stream's baseline restarts a generation; resuming the Channel journal from a revision (for the DM slice) follows ADR-0179's `opened` cursor and is the next slice's job.
- The protocol is DSH `0.2.0-rc.2` behavior and must be rechecked when the pinned DSH changes.
