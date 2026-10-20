---
Status: Proposed
Date: 2026-10-20
Issues: [#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# Hosted Connect reaches the Host through a managed tunnel

Testers must install Tailscale, sign in on both devices and run `tailscale serve` before the phone app can reach their computer ([#2385](https://github.com/BotHarness/DeepSeekBot/pull/2385)). The Human wants a T3 Connect–style option instead: sign in with the same account on the computer and on each phone, and the devices connect without Tailscale. Research and sources: [`docs/research/2026-10-20-hosted-connect.md`](../research/2026-10-20-hosted-connect.md).

We propose that **an account only discovers Hosts and brokers a one-time pairing credential. Application traffic reaches the Host through one Cloudflare Tunnel per Host that a BotHarness relay Worker provisions; it never passes through the Worker. The tunnel is one more route in the ADR-0199 route list and admits only the device gateway.**

## Decision (proposed)

- **Identity.** WorkOS AuthKit. The phone uses the native PKCE flow it already has for TOB (ADR-0229); the Host signs in through the Web Client or `deepseekbot connect`, which uses WorkOS CLI Auth (the device authorization grant) so headless and SSH Hosts work.
- **Opt-in per Host.** Signing in does not make a Host reachable. The Human turns Connect on for that Host in Bot settings → Devices or with `deepseekbot connect enable`, and off again at any time.
- **Relay Worker.** A BotHarness Worker owns accounts' Host links and tunnel allocations, provisions the tunnel and its DNS record through the Cloudflare API, and hands the Host a connector token. It reclaims tunnels that stay offline (Cloudflare counts inactive tunnels toward the account limit) and keeps the hostname so the phone's route stays valid.
- **Host side.** The Host runs a pinned `cloudflared` with that token. The ingress admits only `/botharness-device/*` to the loopback DSH port and answers 404 for every other path, so DSH's own `/api`, the Web Client and plugin routes are not published.
- **Pairing through the account.** A signed-in phone lists the account's Hosts. Choosing one asks the relay to have the Host mint a one-time offer bound to the phone's public key; the phone redeems it at the Host through the tunnel and receives the ordinary per-device credential (ADR-0199). The relay never sees that credential. This uses the device-key field ADR-0199 reserved.
- **Routes.** The Host offers LAN, then Tailscale HTTPS, then the Connect hostname. The phone uses the first route that answers and returns to a faster one when it recovers. The phone and the Host route checks accept the Connect domain in addition to `*.ts.net` and loopback.
- **Unchanged.** Device revocation, the gateway, the Remote stream mux, the full Web Client directory and content-free push (ADR-0202) stay as they are.

## Open decisions for the Human

1. **Auto-connect or confirm once.** Proposed: a signed-in phone connects without a step on the computer, as asked, and every new device triggers a notice on the computer and on other paired phones with one-tap revoke. Alternative: the first connection of each new device waits for a click on the computer. A paired device has full Host authority, so with auto-connect a stolen account is enough to reach the Host.
2. **WorkOS environment.** Reuse TOB's environment (one account for cloud groups and Connect) or a separate one.
3. **Where the relay lives.** In the TOB repository and deployment, or a new Worker owned by this repository.
4. **Mainland China.** Cloudflare's network and outbound port 7844 may not be reliable for users in mainland China. If the spike fails there, neither this option nor a Durable Object relay on Cloudflare fixes it, and a domestic relay is a separate decision.

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

One isolated Host and the iOS Simulator, against a test Cloudflare account and a WorkOS staging environment: sign in on the Host with CLI Auth, enable Connect, the relay provisions a tunnel limited to the gateway path, the phone signs in, lists the Host, pairs through the account, and opens a DM over the Connect route; then revoke the phone, disable Connect and check the tunnel is gone. Before that, a manual spike with one hand-made tunnel measures reachability from mainland China mobile networks.

## Consequences

- New hosted service to operate: Worker, database for links and allocations, Cloudflare API token with tunnel and DNS rights, tunnel reclamation, and an abuse limit on Hosts per account.
- The Host ships or downloads a pinned `cloudflared` per platform and keeps it updated.
- `deepseekbot connect …` CLI commands ship with the Devices UI (CLI parity).
- Store builds keep `EXPO_PUBLIC_DEEPSEEKBOT_CLOUD` separate from Connect, so Connect can ship in test builds without exposing TOB cloud Channels.
