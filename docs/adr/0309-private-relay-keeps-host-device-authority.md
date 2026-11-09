---
Status: Proposed — direction approved in #3742; first-slice implementation and native qualification in #3746
Date: 2026-11-09
Issues: [#3742](https://github.com/BotHarness/DeepSeekBot/issues/3742), [#3746](https://github.com/BotHarness/DeepSeekBot/issues/3746)
---

# Private relay admission does not replace Host device authority

Docker private deployment is the recommended first route. Official connectivity is optional, and Cloudflare user self-deployment is deferred. A public HTTPS endpoint is a prerequisite stated before setup; a home-only container does not create NAT traversal.

The application-defined private relay owns one initial owner's admission and a live ciphertext carrier. Exclusive durable first claim stores only credential hashes. The Host stores private relay credentials in the existing credentials Provider and opens an outbound WebSocket; each admitted phone is forwarded to the existing encrypted device gateway. The gateway alone verifies the pinned Noise Host key and exact approved phone key, issues the existing per-Host Paired Device credential, and applies revocation. Relay admission grants no Host control.

The first slice has one Host per deployment. Phone relay admission is shared within that deployment and is carried privately in the QR and mobile secure storage. Host-level revocation is enforced even if the old phone retains relay admission. Fine-grained relay admission rotation, second-Host directory and route migration remain separately scoped slices; do not claim this token is a per-device relay revocation capability.

The Host's Plugin/Fiber owns the outbound connection, bounded sockets, reconnection and cleanup. Operator actions use the existing authenticated API Gateway route family and CLI. Relay state and Host credentials are application-owned durable state; ciphertext forwarding is process-local and is never a cloud message queue. The existing Host identity, pairing persistence and Noise `connect` profile remain unchanged; the private HTTPS origin is permitted only when explicitly bound in pairing admission, and the token is sent only to that origin.

Lost remote claim responses are uncertain: persist credentials before the request, preserve them on interruption, reconnect without replaying claim, and report failure honestly. The configured private route does not learn official fallbacks. No custom encryption, direct NAT traversal, media expansion, production migration or spend is authorized by this ADR.

Local protocol tests qualify exclusive claim, ciphertext transport, device admission and revocation. A real phone must still pair through the deployed private service, send a Bot message and receive its actual reply with official services unavailable. Mainland network and broader lifecycle gates remain separate. Integrate the accepted result into living architecture only with its measured qualification limits.

Update (2026-11-09, [#3798](https://github.com/BotHarness/DeepSeekBot/issues/3798)): protocol v2 serves up to 16 Hosts per deployment. Each Host claims with its own one-time key and gets its own owner and phone tokens; the relay routes by token hash on the same paths, so v1 Hosts and phones are unchanged and the v1 setup key is the `default` Host's claim key. A Host can release its own claim without affecting others. The standard and a black-box conformance script are in `docs/private-relay-standard.md` and `deploy/private-relay/conformance.mjs`.
