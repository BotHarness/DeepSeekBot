---
Status: Accepted
Date: 2026-10-14
Issues: [#1649](https://github.com/BotHarness/DeepSeekBot/issues/1649), [#1644](https://github.com/BotHarness/DeepSeekBot/issues/1644), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# Paired devices reach the Host through a same-listener device gateway

A paired phone must keep calling the Host (HTTP unary `/api/<method>` and the Remote stream socket) after the Host restarts, and the Human must be able to cut one phone off at once, including streams it already has open. DSH 0.2.0-rc.2 has one credential form for both carriers: the per-process launch token exchanged for a signed cookie ([ADR-0159](0159-live-cli-verbs-ride-the-dsh-http-carrier.md)). We decided that **a paired device never holds a DSH credential. BotHarness serves a device gateway on DSH's own web server: the device presents its per-device credential to BotHarness-owned routes, BotHarness verifies and records it, and forwards the request to the native `/api` carrier and Remote stream mux over loopback with a Host-held DSH cookie.** Revocation refuses the device's next request and closes the device's open stream sockets.

## Decision

- **One listener, BotHarness routes.** The Device Pairing module registers, through DSH's public `webServer.register` and `webServer.registerUpgrade`, a prefix route for unary calls and an upgrade route for the stream mux under one BotHarness path prefix. No new port, process or reverse proxy. Operator-only management (create pairing offer, list, revoke) is registered on the authenticated `/api` carrier through `connection.fetch.register` and is therefore admitted only for the Human's own cookie.
- **Same protocol, different credential.** Behind the gateway prefix the device speaks the exact DSH envelopes: `POST <prefix>/api/<method>` with the `client-request` body, and the Remote stream mux frames on `<prefix>/api/remote.mux`. Only the path prefix and an `Authorization: Device <id>.<secret>` header differ from the Web Client. The mobile app needs no second protocol (spec user story 17).
- **The DSH cookie stays on the Host.** The gateway obtains a DSH cookie for the loopback authority by calling the public `connection.authenticatedUrl()` and performing the token exchange against itself. It keeps that cookie in memory and re-mints it on a 401. The launch token and the cookie never leave the Host process.
- **Device credentials are BotHarness facts.** Pairing offers are one-time and short-lived. A paired device record holds id, name, created, last seen and revoked. The device secret is stored only as a hash in the operational database, and is never logged, put in diagnostics, printed by the CLI or written to config. Every gateway request is verified against the current record, so revocation and last-seen need no cache invalidation.
- **Revocation is immediate on both carriers.** The gateway owns the device-facing stream socket, indexed by device id. Revoke marks the record and destroys those sockets. Later unary calls and upgrades are refused with a coded 401 JSON body (`device-revoked`, `device-unknown`, `device-credential-missing`) that the app can tell apart from a transport failure.
- **Device-key binding is optional and later.** The record leaves room for a device public key so a later slice can require proof-of-possession (the t3code DPoP idea). v1 relies on the secret staying in Keychain/Keystore and on TLS routes.

## Evidence from the pinned DSH

Checked against `@deepseek-ai/dsh` 0.2.0-rc.2 as installed by this repository.

- **The signed cookie already survives restarts.** `dsh-client-connection` (`BrowserAuth`) signs cookies with an HMAC secret stored in the credential record `client-connection/browser-session`, which is created once per Harness home and loaded at activation. Only the launch token is per process. Cookies are bound to the request authority (the `Host` header) and expire after `cookieMaxAgeDays` (default 30, minimum 1), with no refresh.
- **The cookie names no device.** Its payload is `{version, authority, issuedAt, expiresAt}`. Every admitted request becomes the same `OperatorPeer`. Invalidating one holder's cookie means rotating the shared secret, which logs out every browser and device.
- **Unary has a refusal hook, the stream has none.** `connection/request` is a documented waterfall that runs after admission for the `/api` prefix route, so a plugin could refuse a unary request. The Remote stream mux upgrade (`dsh-api-gateway`, `/api/remote.mux`) calls `connection.admit()` directly and never runs that waterfall, and no hook lets a plugin close sockets the mux already accepted.
- **Plugin routes are not admitted by DSH.** `dsh-host-webserver` routes have no authentication of their own. Each owner checks its own requests, as BotHarness already does for the Computer and Browser viewers through `connection.requestRejection()`.

## Live spike on an isolated Host

Run on an isolated profile booted with `scripts/dev-instance.mjs`, with a throwaway gateway built into `@botharness/core` (not merged). `botharness/list` stands for a unary bridge call and `botharness/followRoster` for a Remote stream:

| Step                                                      | Unary                             | Remote stream                                 |
| --------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| DSH cookie, before restart                                | 200 `ok=true`                     | 101, first item frame                         |
| Same DSH cookie, after restart (old launch token now 401) | 200 `ok=true`                     | 101, first item frame                         |
| Pair: offer created by the operator, redeemed once        | second redeem 401 `offer-invalid` |                                               |
| Device credential, before restart                         | 200 `ok=true`                     | 101, first item frame                         |
| Same device credential, after restart                     | 200 `ok=true`                     | 101, first item frame                         |
| Revoke while a device stream is open                      |                                   | open socket closed (1006), `closedStreams: 1` |
| Device credential, after revoke                           | 401 `device-revoked`              | upgrade 401 `device-revoked`                  |
| Operator cookie, after revoke                             | 200 `ok=true`                     |                                               |

The probe printed no token, cookie or device credential. The spike code and probe are kept outside the repository as review material only.

## Considered Options

1. **DSH-native durable credential.** Rejected as the whole answer, kept as a mechanism. The cookie does survive restarts (proven above), but it cannot be revoked per device, expires after at most `cookieMaxAgeDays` with no refresh, and pairing would hand the device operator authority that is valid on any carrier until it expires.
2. **Exchange the device secret for a DSH cookie that the device keeps.** Rejected. The exchange is possible through public methods, and unary refusal is possible through `connection/request`. Streams are not: a revoked device could keep an open stream and open new ones with its cookie until the cookie expires. A copied cookie would also outlive revocation.
3. **Upstream device credentials in DSH.** Not chosen for v1, proposed as follow-up work. The fitting upstream shape is a credential verifier seam in `dsh-client-connection` that maps a request to a per-device Peer, with Peer disposal closing that Peer's mux sockets. If DSH ships it, the gateway shrinks to that verifier and the device returns to plain `/api` paths. Envelopes, device records and refusal codes stay the same.
4. **Separate listener or reverse proxy in front of `dsh web`.** Rejected, as in ADR-0159: a second port is more attack surface and duplicates what the same-listener routes already do.

## Trust boundaries

- `dsh web` stays loopback-bound. Phones arrive only through an authenticated route, Tailscale HTTPS first, and the Host's trusted-host configuration must name that route for the operator's own browser to work there.
- The device credential is an explicit header, not ambient browser state, so DNS rebinding and cross-site requests cannot spend it. The gateway refuses a request whose `Origin` names another host (`403 origin-refused`). Native HTTP requests send no `Origin`; native WebSocket stacks (iOS SocketRocket, Android OkHttp) stamp the socket's own origin, which is the same host and is accepted (amended in [#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652): refusing every `Origin` would have refused the phone's own stream).
- A paired device has the Human's full authority in v1, the same as the Web Client (spec user story 15). The gateway adds no per-device scopes.
- Gateway diagnostics are bounded, structured developer log entries (offer created, redeemed or expired; device admitted, refused or revoked), and never contain the secret, the DSH cookie, the launch token or a tailnet address.

## Consequences

- The Device Pairing module ([#1644](https://github.com/BotHarness/DeepSeekBot/issues/1644)) owns offers, device records, verification, revocation, the gateway routes and the route list offered to a device. The mobile app and a paired live CLI use the gateway prefix with the device credential instead of `/?token=`.
- The gateway depends on four public DSH surfaces: `webServer.register`, `webServer.registerUpgrade`, `connection.fetch.register` and `connection.authenticatedUrl`. A change to any of them is a pinned-DSH upgrade check.
- Each device request costs one loopback hop on the Host. Body limits come from the native `/api` carrier behind the gateway.
- Global sign-out of every browser and device remains a DSH operation (rotating `client-connection/browser-session`). It ends the gateway's loopback cookie too, and the gateway mints a new one on the next request.

## Implementation (#1652)

[#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652) built this decision in `packages/core/src/devices/`. Details the decision left open:

- **Prefix and routes.** The device-facing prefix is `/botharness-device`: `POST /botharness-device/pair` redeems an offer, `/botharness-device/api/*` forwards unary calls and `/botharness-device/api/remote.mux` splices the stream. Management is `GET /api/botharness/devices`, `POST /api/botharness/devices/offer` and `POST /api/botharness/devices/revoke`.
- **Pairing link.** The QR code and the copyable link are the same deep link, `deepseekbot://pair?p=<base64url JSON>`, carrying the Host id and name, the one-time offer, its expiry and the ordered route list. Offers live only in Host memory for five minutes, so a Host restart voids every unredeemed offer.
- **Routes.** The Host offers its Tailscale HTTPS name when `tailscale serve` publishes the `dsh web` port, the Web Client's own origin when it is a tailnet HTTPS origin, and loopback last for simulators. Device traffic never reaches DSH's Host/Origin fence (the gateway forwards with a loopback authority), so pairing needs no `--trusted-host`.
- **Forwarding.** Unary requests and responses are streamed, not buffered, and `Set-Cookie` is never passed back. When the loopback cookie stops verifying (global sign-out), a unary call answers `503 host-session-unavailable` and the next request mints a new cookie; a stream upgrade retries once with a fresh cookie.
- **Last seen** is written at most once a minute per device. Revocation also cuts in-flight unary responses, not only stream sockets.
- **Live proof.** `scripts/e2e-device-pairing.mjs` runs pair → Host restart → device call and stream → revoke → refused on an isolated Host, and checks that the credential is absent from the Host log and the developer log.

## Full Web Client in the app (#1654)

[#1654](https://github.com/BotHarness/DeepSeekBot/issues/1654) opens the Host's full Web Client in the app's WebView with the same device authority. A WebView cannot add the `Authorization` header to every subresource, script request and WebSocket, so the gateway also serves a web directory:

- **Directory.** `/botharness-device/web/*` forwards to the same path without the prefix over loopback with the Host-held cookie, and `/botharness-device/web/api/remote.mux` splices the stream. DSH already serves the Web Client for a sub-path (the index carries `<base href="./">`, and its `/api` calls and stream URL are relative), so BotHarness client code also uses relative `./api/botharness/…` paths. Browser and Computer viewer controls followed in [#1687](https://github.com/BotHarness/DeepSeekBot/issues/1687) (below).
- **Credential once, then a session cookie.** The app sends `Authorization: Device <id>.<secret>` only with the WebView's first load. The gateway admits it and answers with an `HttpOnly; SameSite=Strict` cookie scoped to `/botharness-device/web/` (`Secure` behind an HTTPS route). The cookie names a random web session kept only in Host memory for at most 12 hours; the device secret and the DSH cookie never reach the page. No token is put in the URL.
- **Revocation.** Every web request and stream upgrade re-checks the session's device record, so revoking the device refuses the next request with `401 device-revoked` and closes the WebView's open stream with the device's other streams. A Host restart forgets web sessions; the app re-presents the credential the next time the full client opens.
- **Landing.** The app adds a hash the Web Client reads once: `#botharness-private-input=…` (existing) for a private input request, `#botharness-open=dm:<slug>` for a PersonaBot DM and `#botharness-open=home` for Bot mode.

## Browser and Computer viewers in the app (#1687)

[#1687](https://github.com/BotHarness/DeepSeekBot/issues/1687) makes the Bot Browser and Computer entries work in the in-app full client.

- **Relative paths.** Their client calls use `./api/browser/…` and `./api/computer/…`, and a viewer URL the Host returns as `/botharness-browser/viewer/…` is loaded as `./botharness-browser/viewer/…`, so in the WebView everything resolves under `/botharness-device/web/`. The local Browser viewer page reaches the observation and takeover routes as `../../../api/browser/…` from its own directory.
- **Viewer sockets.** DSH upgrade routes match exact paths, and the Container Browser registers one viewer per profile at runtime. So each viewer also registers the device web twin of its socket paths (`/botharness-device/web` + path) and hands that socket to the gateway, which the core service exposes as `deviceWebUpgrade`. The gateway treats every upgrade under `/botharness-device/web/` the way it treats the stream mux: it checks the web session's device, opens the plain path over loopback with the Host-held cookie (where the viewer's own `requestRejection` admits it), and indexes the spliced socket by device id, so revocation closes it.
- **Unchanged.** The desktop Web Client keeps calling the same routes; relative paths resolve to them from `/`. Takeover hand-off links sent to IM stay absolute.
