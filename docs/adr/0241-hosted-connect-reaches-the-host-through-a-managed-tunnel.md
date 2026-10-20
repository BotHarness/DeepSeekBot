---
Status: Accepted
Date: 2026-10-20
Issues: [#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# Hosted Connect reaches the Host through a managed tunnel

Testers must install Tailscale, sign in on both devices and run `tailscale serve` before the phone app can reach their computer ([#2385](https://github.com/BotHarness/DeepSeekBot/pull/2385)). The Human wants a T3 Connect–style option instead: sign in with the same account on the computer and on each phone, and the devices connect without Tailscale. Research and sources: [`docs/research/2026-10-20-hosted-connect.md`](../research/2026-10-20-hosted-connect.md).

The Human chose this direction on 2026-10-20: **an account only discovers Hosts and brokers a one-time pairing credential. Application traffic reaches the Host through one Cloudflare Tunnel per Host that a BotHarness relay Worker provisions; it never passes through the Worker. The tunnel is one more route in the ADR-0199 route list and admits only the device gateway.**

## Decision

- **Identity.** WorkOS AuthKit, in TOB's existing WorkOS environment, so one account serves cloud groups and Connect. The phone uses the native PKCE flow it already has for TOB (ADR-0229); the Host signs in through the Web Client or `deepseekbot connect`, which uses WorkOS CLI Auth (the device authorization grant) so headless and SSH Hosts work.
- **Opt-in per Host.** Signing in does not make a Host reachable. The Human turns Connect on for that Host in Bot settings → Devices or with `deepseekbot connect enable`, and off again at any time.
- **Relay Worker.** A new Worker owned and deployed from this repository (not TOB's) owns accounts' Host links and tunnel allocations, provisions the tunnel and its DNS record through the Cloudflare API, and hands the Host a connector token. It reclaims tunnels that stay offline (Cloudflare counts inactive tunnels toward the account limit) and keeps the hostname so the phone's route stays valid.
- **Host side.** The Host runs a pinned `cloudflared` with that token. Each platform's `cloudflared` binary is published as its own optional npm package (the esbuild pattern), so installing the plugin installs only the current platform's binary and works through npm mirrors; when that package is missing, enabling Connect downloads the same pinned version and verifies its hash. `cloudflared` is Apache-2.0. The ingress admits only `/botharness-device/*` to the loopback DSH port and answers 404 for every other path, so DSH's own `/api`, the Web Client and plugin routes are not published.
- **Pairing through the account.** A signed-in phone lists the account's Hosts. Choosing one asks the relay to have the Host mint a one-time offer bound to the phone's public key; the phone redeems it at the Host through the tunnel and receives the ordinary per-device credential (ADR-0199). The relay never sees that credential. This uses the device-key field ADR-0199 reserved.
- **Routes.** The Host offers LAN, then Tailscale HTTPS, then the Connect hostname. The phone uses the first route that answers and returns to a faster one when it recovers. The phone and the Host route checks accept the Connect domain in addition to `*.ts.net` and loopback.
- **Unchanged.** Device revocation, the gateway, the Remote stream mux, the full Web Client directory and content-free push (ADR-0202) stay as they are.

## Decisions by the Human

1. **Auto-connect.** A signed-in phone connects without a step on the computer. Every new device triggers a notice on the computer and on the other paired phones with one-tap revoke. MFA or a passkey is recommended to the Human but not required. The accepted risk: a paired device has full Host authority, so a stolen account is enough to reach a Host that has Connect enabled.
2. **WorkOS environment.** Reuse TOB's environment. Connect still does not depend on TOB cloud Channels being enabled.
3. **Relay location.** A new Worker in this repository, so Connect works without a TOB deployment and its protocol is visible to self-hosters.
4. **Mainland China later.** Connection convenience is the priority, so implementation does not wait on mainland China. Connect is built and qualified outside mainland China first. A tester in mainland China later checks pairing and DM reachability on China Mobile, China Unicom and China Telecom networks and outbound port 7844 from common computer setups. If that fails, this ADR still governs the account and pairing design, and a domestic relay is a separate decision; moving to a Durable Object relay on Cloudflare would not fix it.
5. **Free with reclamation; five Hosts per account.** Connect is free. The relay deletes a tunnel after its Host has been offline for a few minutes and recreates it when the Host returns, so the free 1,000 tunnels per Cloudflare account bound computers online at the same time, not registered users. Pricing is decided when computers online at the same time approach 800; beyond 1,000 each tunnel costs $4.50 per month. An account can link at most five Hosts, as an abuse limit.
6. **Hostnames.** Connect uses the dedicated domain `deepseekbot.dev` in a Cloudflare account BotHarness owns. Each Host gets `<host-id>.deepseekbot.dev`, one level below the zone, so Cloudflare's free Universal SSL certificate covers it. Other services must not live on subdomains of this zone. The relay's Cloudflare API token is limited to tunnels and that zone's DNS.
7. **Allowlist while testing.** While few people run the test phone app, only allowlisted WorkOS accounts can link Hosts, using TOB's authenticated-user policy. Opening Connect to every account is a later change.
8. **All three desktop platforms.** macOS, Linux and Windows ship together. The Windows package needs signing and an antivirus false-positive check before release.

## Considered options

1. **Managed Cloudflare Tunnel per Host (proposed).** Same shape as T3 Connect. The phone gets a plain HTTPS origin, so the WebView full client and viewer sockets work unchanged. The first 1,000 tunnels per Cloudflare account cost nothing; each further tunnel costs $4.50 per month. TLS ends at Cloudflare's edge, so Cloudflare (not BotHarness) can read gateway traffic.
2. **Our own relay on Workers and Durable Objects.** Can be end-to-end encrypted and needs only outbound 443, but we would have to carry HTTP and WebSocket over the relay ourselves to give the WebView a real origin, which amounts to writing a tunnel. Kept as a fallback if `cloudflared` cannot be shipped or port 7844 is commonly blocked.
3. **Hosted mesh (Headscale, embedded WireGuard).** End-to-end by construction, but the iOS app would need its own VPN Network Extension. Rejected.

## Trust boundaries

- `dsh web` stays loopback-bound; the tunnel reaches it only for `/botharness-device/*`, and the gateway still authenticates every request with a device credential.
- A relay account token is never a Host credential. Holding the one-time offer without the phone's private key does not redeem it.
- A compromised relay signing key can request offers for linked Hosts. Keep that key only in Worker secrets; the Host checks that the request names its own link and the linked account.
- Cloudflare can read device traffic on this route. Tailscale remains available for Humans who do not accept that.

## First tracer bullet

One isolated Host and the iOS Simulator, against a test Cloudflare account and a WorkOS staging environment: sign in on the Host with CLI Auth, enable Connect, the relay provisions a tunnel limited to the gateway path, the phone signs in, lists the Host, pairs through the account, and opens a DM over the Connect route; then revoke the phone, disable Connect and check the tunnel is gone.

## Consequences

- New hosted service to operate: Worker, database for links and allocations, Cloudflare API token with tunnel and DNS rights, tunnel reclamation, and the five-Host limit per account.
- We publish and update one pinned `cloudflared` npm package per platform.
- `deepseekbot connect …` CLI commands ship with the Devices UI (CLI parity).
- Store builds keep `EXPO_PUBLIC_DEEPSEEKBOT_CLOUD` separate from Connect, so Connect can ship in test builds without exposing TOB cloud Channels.
