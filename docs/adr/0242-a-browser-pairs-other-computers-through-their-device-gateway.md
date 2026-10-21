---
Status: Accepted
Date: 2026-10-21
Issues: [#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500), [#2180](https://github.com/BotHarness/DeepSeekBot/issues/2180), [#2178](https://github.com/BotHarness/DeepSeekBot/issues/2178)
---

# A browser pairs other Computers through their device gateway

The Web Client serves exactly one Host. The Human wants its channel list to work like the phone's (#2194): **All** by default, then one tab per Computer, with chats from another Computer on the tailnet listed, opened and answered in the same browser. Spec #2178 already fixes the authority split: each Computer owns its conversations, and a client's connections belong to that client (browser profile plus origin), never to a Host setting.

We decided that **the browser pairs another Computer exactly like a phone does, and talks to it directly with that per-device credential.** The other Host admits the cross-origin calls on its device gateway (ADR-0199); the serving Host never relays or stores the credential.

## Decision

- **Same pairing, same credential.** The Human copies the pairing link from the other Computer's Settings → Devices → Pair a phone and pastes it into **Add computer** in the channel list. The browser redeems the offer at `/botharness-device/pair` and keeps the returned device record in `localStorage` of the serving origin. The other Computer lists it as one more paired device ("Browser on …") and can revoke it there.
- **CORS only for header-authenticated paths.** The gateway answers cross-origin `pair`, `unpair`, `stream-ticket` and unary `/botharness-device/api/*` requests, including the preflight, only when the `Origin` is itself a Host-shaped address (loopback, Tailscale HTTPS or the Connect domain, the same check as phone routes) and the request carries no cookie. The cookie-authenticated full Web Client (`/botharness-device/web/`) stays same-origin. Responses echo that origin with `Vary: Origin` and never allow credentials, so a page needs the device secret itself; ambient cookies never authorize a cross-origin call.
- **Stream tickets.** Browsers cannot put an `Authorization` header on a WebSocket. The browser first `POST`s `/botharness-device/stream-ticket` with its credential and opens `/botharness-device/api/remote.mux?ticket=…`. A ticket is random, stored only as a hash, bound to the device, valid for 30 seconds and spent on first use; the device is checked again when it is used, so revocation still closes streams and refuses new ones. Phones keep the header form.
- **One client implementation.** The Web Client reuses the phone's Host client, pairing and conversation modules (`apps/mobile/src/host/`) behind a browser carrier, so wire handling, reconnects, drafts and sends stay one code path.
- **Source-scoped state.** Conversations are keyed by Computer and conversation, so the same Bot slug or Channel ID on two Computers never shares a draft, history or send. Removing a Computer revokes this browser there and drops its cached conversations.

## Consequences

- The first slice shows each other Computer as its own section under All and as its own tab; it does not merge them into one recency-sorted list, show images or cards, or sync read state. Those follow in later #2180 slices.
- The Computer look (icon and colour) is still stored per phone, so the Web Client uses a generic computer icon.
- DSH Desktop is not qualified by this slice; its storage and origin rules are verified separately (#2180).
