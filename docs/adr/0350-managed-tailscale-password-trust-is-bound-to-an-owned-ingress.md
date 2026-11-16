---
Status: Accepted
Date: 2026-11-16
Issues: [#4146](https://github.com/BotHarness/DeepSeekBot/issues/4146), [#4140](https://github.com/BotHarness/DeepSeekBot/issues/4140)
---

# Managed Tailscale password trust is bound to an owned ingress

Member invitations advertised Tailscale Serve HTTPS, but Serve forwards to the Host over HTTP loopback. M1 correctly refuses a loopback proxy's password request: forwarded headers cannot establish encryption. The Human chose to trust the Host's own managed Serve route.

## Decision

The application-defined device-access Plugin's publishing owner opens a dedicated in-process HTTP ingress on an ephemeral port bound only to `127.0.0.1`. Its managed Serve HTTPS mapping targets this listener. The listener streams requests to the existing Host origin, preserving Host, cookies and authorization, and proxies WebSocket upgrades in both directions. It strips client route tags and stamps a process-random internal tag distinct from Connect's. Responses never expose that tag. It does not mint or change any principal or credential; the existing Device Gateway, member Peer, and native DSH API Gateway retain admission and dispatch.

Browser and mobile password paths accept this internal tag only together with the exact `x-forwarded-proto: https` value. The header is a second check, never the identity of the hop. Ordinary main-port requests with forwarded headers or caller-invented route tags remain refused. HTTPS origins and Secure member cookies also recognize the tagged hop.

The publisher persists its existing exact mapping receipt. Before retargeting it also records the attempted target; after an interrupted or unverifiable update, recovery accepts only an exact match to the old receipt or that recorded attempt. A verified replacement retires the pending target. Publish and startup retarget a still-owned old main-port or previous ingress mapping in place, preserving its HTTPS address. Unowned/manual mappings are neither adopted, changed nor trusted; a new publication uses a free bounded candidate. An externally edited mapping is left intact. Disable closes the ingress and removes only the still-matching owned mapping. Host disposal closes connections and the ingress; enabled publication remains recoverable on restart.

Status freshly verifies mapping ownership and HTTPS configuration, reporting `managed.trustedIngress` and each Tailscale route's `memberSignIn` (`managed-tls` or `untrusted`). Invitations, member pairing offers and `teamMode.memberUrls` share eligible routes: non-loopback direct TLS, Connect and the verified managed ingress. The browser's explicit insecure-network opt-in does not advertise HTTP to members; mobile passwords still refuse that exception.

## Boundary and alternatives

This is a transport boundary against network clients, within ADR-0336's same-user OS trust. A local process able to connect to the private ingress is inside that OS boundary, just as for Connect's local origin. The random tag is process-local, never persisted or logged. No hostname, Tailscale identity header, forwarded header or arbitrary main-port proxy becomes trusted. DSH upstream is unchanged.

Trusting `x-forwarded-proto`, tailnet hostnames, or every loopback proxy was rejected because a remote caller can supply those values. Requiring DSH to terminate TLS was rejected for this slice because Host-managed Serve already owns the verified HTTPS route.

This narrowly amends ADR-0199's rejection of a separate proxy: Device Gateway and native dispatch remain on the original listener; only the explicit managed publishing ingress adds a loopback port. No alternate application server or authorization store is introduced.

## Verification and cost

Real loopback tests cover forged main-port headers, both password carriers, exact binding, non-forwardable tags, HTTP streaming/backpressure, WebSocket messages, disposal, owned retarget and manual mappings. Publishing tests use a fake Tailscale command, never machine configuration. Live qualification uses one isolated Host and compares Serve configuration before publication and after disable, preserving unrelated entries.

One extra local hop affects managed-route traffic only. Bodies and upgrades remain streamed with Node backpressure; neither payloads nor streams accumulate in an application queue. The regression guard verifies first upload/download chunks arrive before completion and active sockets close on disposal. No new dependency or password derivation cost is introduced; local timing observations do not claim an end-to-end network speedup.
