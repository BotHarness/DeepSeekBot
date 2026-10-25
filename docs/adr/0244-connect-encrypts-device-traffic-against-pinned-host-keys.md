---
Status: Accepted — approved by Vain on 2026-10-22; Track B implementation in progress
Date: 2026-10-22
Issues: [#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542), [#2541](https://github.com/BotHarness/DeepSeekBot/issues/2541)
Amends: ADR-0241 and ADR-0242
---

# Connect encrypts device traffic against pinned Host keys

## LAN extension — 2026-10-23

The accepted [#2598](https://github.com/BotHarness/DeepSeekBot/issues/2598) design reuses this authority and Noise profile for opt-in LAN phone access. A trusted computer QR scanned in the installed app supplies the Host pin; pasted and external links retain independent comparison. Exact phone-key approval still occurs on the Host. LAN binds the final prologue field to `lan`; Connect stays `connect`. This restricted adapter refines ADR-0199's same-listener choice without moving DSH's operator listener off loopback. See [the LAN contract](../architecture/lan-phone-v1.md) for lifecycle, native policy and qualification limits.

Reported by Vain. On 2026-10-21 Vain rejected Cloudflare's ability to read Connect traffic. Connect has not shipped, so its protocol and pairing experience can change. Vain approved this ADR and its stacked implementation above Track A PR #2546 on 2026-10-22. It replaces ADR-0241's plaintext application channel; acceptance of this design is not evidence of runtime or native qualification. ADR-0199 remains the device-authority owner, ADR-0242 remains the browser pairing owner, and ADR-0243 remains the Host Feed contract.

## Decisions confirmed by Vain on 2026-10-22

| Question                         | Confirmed choice                                                                                    | Alternatives and cost                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated key exchange       | Noise `XK`, with no application payload until the handshake finishes (confirmed)                    | `IK` saves a flight but must also forbid early application data. Per-request HPKE is an alternative only if loss of forward secrecy after Host-key theft is accepted.                                                                                                   |
| First Host-key trust             | Compare a fingerprint from the local Host or an already authenticated device, then pin the full key | A Host-signed offer alone is insufficient when its verification key comes from the same untrusted relay. A separate pretrusted signing authority would need its own trust and recovery design.                                                                          |
| New-device authority             | A local Host or already trusted device confirms the exact new device key before granting authority  | Retaining ADR-0241's account-only auto-pairing explicitly accepts that a compromised relay can enroll an attacker. Checking the Host fingerprint on an honest phone does not prevent that attack.                                                                       |
| Full client in the phone WebView | Remove the full WebView client and its entry points on every route; do not bundle it or tunnel it   | A native bridge works only if it also authenticates every executable page/resource and excludes remote code. A bridge under a page still loaded through Cloudflare is insufficient. Alternatively, disable the Connect WebView and explicitly list unavailable screens. |
| Capability and downgrade         | Pin the encryption requirement with the Host key; fail closed on missing/unsupported capability     | No plaintext retry, including after timeout, reinstall, route changes or key mismatch. Old test clients must upgrade or use a separately trusted route.                                                                                                                 |

Vain confirmed Noise XK, first-pair fingerprint comparison, explicit approval of new devices, and removal of the full WebView client. The no-downgrade requirement comes from the original handoff. Vain subsequently approved the complete Noise XK implementation through the annotated handoff and invoked the implement workflow. The native, adversarial, independent-review and Human-QA gates below remain separate from that authorization. Vain also confirmed that DSH upstream does not accept external PRs: use BotHarness-owned adapters over supported native APIs, not an upstream patch.

## Trust boundary

Cloudflare Tunnel remains an outbound connectivity carrier. WorkOS and the relay discover Hosts and deliver pairing requests; neither can grant device authority or select a trusted Host key. The application-defined Connect Channel terminates inside the phone/browser and the Host process, before the existing Device Gateway admits a request. The Host's Device Pairing module remains the single durable authority for device membership and revocation.

DSH-native Typert/API Gateway still owns dispatch. The application-defined channel decodes authenticated messages into the existing Host capability path; it does not register a second `/api` interceptor, duplicate Host Feed state or invent another credential store. The owning Plugin/Fiber closes channels and erases live session state on disposal. BotHarness owns the device gateway admission adapter and mux framing proxy; it must qualify these against the pinned runtime without modifying DSH upstream. The present carrier limitations are recorded in the [Track A audit](../research/2026-10-22-connect-secret-safety-audit.md).

### Host and device keys

- The Host has a long-lived X25519 key pair stored through the DSH Credentials Provider, machine-local and excluded from config, operational rows, logs, exports and the repository. A device keeps its private key in Keychain/Keystore; the browser needs a separately qualified origin-local key store and must not claim hardware protection.
- A versioned pairing payload contains Host id, full Host public key, fingerprint algorithm, protocol requirement, offer id/expiry and the requesting device public key. Display names, account identity and DNS names never substitute for the key.
- X25519 is a key-agreement algorithm, **not a signature algorithm**. If a signed-offer design is selected, it needs a separate signature key (for example Ed25519), a specified binding to the X25519 key, and an independently trusted verification path. Self-signing an offer proves possession, not identity.
- First-device approval binds the exact Host key, new device key, offer, account link and expiry. It is single-use and race-safe. Approval on an existing device travels over an already authenticated session. The new phone compares an independently obtained fingerprint before sending a device credential or secret.
- Pairing redemption and issuance of the durable device credential happen inside the authenticated encrypted exchange. No bearer device secret, legacy device WebView cookie, offer secret or private-input value may be sent in an outer HTTP header, cookie, URL or WebSocket subprotocol. Public routing ids are not credentials.
- Key rotation is authorized through an existing authenticated channel and explicitly confirmed; a lost key requires a new trust ceremony. A relay advertisement cannot silently replace a pin. Revocation closes every live session for that device immediately and prevents reconnects.

### Session protocol

Recommended profile: `Noise_XK_25519_ChaChaPoly_SHA256`. A phone/browser initiates; the Host responds. The initiator already knows the responder's pinned static key. Every handshake payload is empty; application data starts only after the final XK message has been processed and device admission succeeds.

Each connection uses new ephemeral keys and a fresh transcript. Bind protocol/version, Host id, route kind, both static keys and the device/offer identity to authenticated handshake metadata and key confirmation. A connection becomes usable only after both endpoint authentication and current device admission succeed. Pairing-mode sessions have only the bounded pairing operation until approval; they cannot invoke ordinary Host methods.

After the handshake, frame encryption uses separate direction keys and monotonic counters, with a reviewed, versioned framing specification. Authenticate the session/transcript binding, direction, frame kind, length and counter; specify the exact AAD encoding and counter ownership before implementation. Reject replays, gaps, counter exhaustion, truncation and cross-session frames. A failed authentication closes the channel and never falls through to a plaintext decoder. Reconnection establishes fresh keys; it does not reuse an old nonce space or silently replay mutations. Existing idempotency identities remain authoritative.

Noise's message limit is 65,535 bytes. Images/files require bounded chunks, ordered reassembly, cancellation and aggregate limits. Do not compress secrets together with attacker-controlled content. Apply bounded queues, handshake deadlines, connection quotas and failure diagnostics without payloads. Test malformed lengths before allocating large buffers.

Erase ephemeral/session key buffers on close as far as the runtime permits; JavaScript garbage collection prevents a guarantee of complete memory erasure. Forward secrecy covers recorded completed sessions after later static-key theft when ephemeral state was not retained. It does not protect a live compromised endpoint, already copied plaintext, or recorded sessions whose ephemeral keys were stolen.

### Carry every application path

All Connect application traffic moves inside the encrypted session, including unary RPCs, the existing `remote.mux` logical streams, uploads/downloads, attachment resources, approval/private-input calls, push registration and revocation operations. Viewer signaling and any WebSocket/framebuffer fallback must be encrypted or explicitly unavailable on Connect; encrypting only chat is not sufficient. A WebRTC media channel must be audited separately for authenticated peer establishment and its fallback paths.

The outer origin listener allows only bounded handshake/transport messages and public liveness/version metadata. Authenticated capability negotiation occurs inside the handshake; a plaintext capability response is only a hint and can never clear a previously pinned requirement. A Host advertising the new protocol refuses every plaintext application route at the Connect listener, including legacy `/api`, WebView APIs, upload URLs and stream tickets. There is no retry through a legacy bearer path.

Loopback and Tailscale retain their existing transport contract. A selected route change establishes the appropriate channel again; the client never downgrades a Connect request on error. Persisting a pin and encryption requirement is atomic with pairing. Key mismatch, missing pin and unsupported version have distinct coded refusals and a clear repair path.

### Trusted client code

The full WebView client is removed on every route. Remove navigation buttons, the Expo screen, its authenticated source builder and the device-gateway HTML/cookie proxy. Old deep links cannot open it. Native screens remain; unsupported operations explain that they require the Host client, without an in-app WebView fallback. This is removal of the full Host client feature, not a claim that unrelated viewer technologies or every use of WebView in dependencies has been removed.

A browser's remote chat is served by its own trusted Host and encrypts calls to the Remote Host. If that serving page itself was loaded through Cloudflare, active Cloudflare can replace the encryption code: that browser is outside the claimed protection until its code-delivery path is independently authenticated. SRI fetched from the same compromised HTML origin does not solve this. Extension/plugin scripts, XSS and endpoint malware remain endpoint threats.

## Full-client removal and known gaps requiring sign-off

The removal decision is confirmed. The temporary loss of the following operations is **not** a completed native replacement or final acceptance of the gaps. Review this list with the complete ADR before Track B implementation or release.

| Former entry or operation                                                | Track A candidate                                                                       | Required native follow-up / acceptance                                                                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → Open the full client; `/full-client` deep link                | Screen, route, source builder and settings row removed on every route                   | Keep absent; verify old links cannot reopen remote page code.                                                                                                                                   |
| Chat header / overflow → full client                                     | Full-client actions removed; native chat remains                                        | Qualify DM, group, images, approvals and navigation on iOS and Android.                                                                                                                         |
| Chat private input and Activity private-input fallback                   | No phone fill action; notice directs the Human to the Host or trusted Tailscale browser | Native private-input form is required for Track B's tracer bullet. Hiding it is a temporary gap, not native submission support.                                                                 |
| Activity/create menu → new local Bot or Channel                          | Computer targets hidden; cloud creation remains in its existing native flow             | Build native local creation or obtain explicit acceptance of this gap.                                                                                                                          |
| Routines → advanced edit                                                 | Simple native schedule editing remains; unsupported schedules show Host-client guidance | Native advanced editing or explicit acceptance of the temporary gap.                                                                                                                            |
| Other Host-only management reached through the full client               | Full-client escape hatch removed                                                        | Host client remains the management surface; inventory and approve any additional phone workflow before claiming mobile parity.                                                                  |
| PersonaBot Browser/Computer HTML viewers under `/botharness-device/web/` | HTML, cookie session, mux and viewer socket registrations removed                       | Native viewers are separate. Carry signaling and all fallback resources over E2EE, or explicitly disable unsupported Connect viewers. Do not claim viewer confidentiality from chat encryption. |

ADR-0242's browser pairing and per-device authority remain. Its plaintext credential redemption and stream-ticket transport on Connect are replaced by the authenticated encrypted channel. Tailscale and loopback retain their current contracts. Browser code must come from a trusted serving Host, as described above.

## Threat model

| Adversary                             | Required protection                                                                                                                     | Remaining exposure / response                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passive Cloudflare                    | Cannot recover messages, images, tool arguments/decisions, private inputs or device credentials from application traffic                | Sees hostnames, endpoint IPs, timing, sizes, connection duration and public handshake material. This is content confidentiality, not anonymity or identical metadata privacy to Tailscale.   |
| Active Cloudflare                     | Cannot substitute keys, modify application messages, downgrade the channel, replay a mutation or replace trusted executable client code | Can drop, delay and block traffic. First-key pinning and trusted code delivery are prerequisites, not consequences of AEAD.                                                                  |
| Compromised relay / relay signing key | Cannot replace pins or enroll a new device without independent authorization; cannot decrypt established sessions                       | Can lie about discovery, request pairing and deny service. Keeping account-only auto-pairing would forfeit the enrollment guarantee.                                                         |
| Stolen Host static key                | Previously completed sessions remain confidential under the stated forward-secrecy assumptions                                          | Attacker can impersonate the Host on future connections until rekey/re-pair. This is not post-compromise security. Revoke affected trust through an independent trusted route.               |
| Stolen phone                          | Locked-device key protection and Host revocation limit future access                                                                    | An unlocked phone or extracted device key has that device's full Host authority. E2EE does not narrow ADR-0199 permissions or erase cached content. Revoke the device and its open channels. |
| Compromised Host or client runtime    | No claim that E2EE protects plaintext at a compromised endpoint                                                                         | Key storage, app signing/update trust, browser origin isolation and existing Host authorization remain essential.                                                                            |

Content-free push remains the ADR-0202/0243 projection. This change neither adds message bodies to Expo payloads nor claims that the existing Host ids, Bot names and item-kind metadata are hidden from push providers.

## Library decision and qualification

Candidate primitives are `@noble/curves` (X25519), `@noble/ciphers` (AEAD), and an explicitly pinned hash/HKDF implementation such as `@noble/hashes`. These are primitives, not a complete Noise implementation. Select and review a maintained Noise state machine or an independently reviewed implementation; do not treat assembling DH and AEAD as protocol qualification. Verify official vectors and cross-implementation interoperability before carrying user data. Browser, Node and Hermes need a secure-random-source check; no `Math.random` fallback.

`@hpke/core` implements the alternative RFC 9180 suite, but request sealing to a static Host key does not give forward secrecy against later theft of that key. Response exporter contexts, request identity, authentication and replay handling would still need a complete protocol specification.

## Tracer bullet and release gate

After approval, one isolated ADR-0241 test rig must demonstrate: a phone over Connect opens a DM, sends an image, approves a real tool call, and submits a disposable private input. Live model checks use the newest available DeepSeek model and record its exact catalog id. Repeat the affected paths for Web Client remote chat and prove that the retired full-WebView routes and deep links are unavailable. Exercise revocation, restart, disconnect/reconnect, route switching, key mismatch, negotiation stripping, replay, counter/length failures and malformed ciphertext.

Capture traffic **before decryption** at the cloudflared origin listener, including HTTP headers, cookies, queries, WebSocket handshake and application frames. Use synthetic sentinels, not real secrets, and verify none occur in those bytes or logs. A capture at the decrypted DSH loopback is not this proof. A negative string search alone is not proof of cryptographic security: accompany it with protocol tests, key-trust/adversarial tests and independent review.

The existing `deepseekbot connect-status` command (and `deepseekbot connect status` if the CLI adds that spelling) must report the supported/required protocol, current channel state (for example negotiating/encrypted/refused/disconnected), and a stable Host-key fingerprint. Enabling Connect alone must not report an active encrypted session. CLI tests, bilingual CLI docs, and a live Host run ship with that implementation.

Remove #2541's refusal only after all remaining supported Connect surfaces and resource paths use the channel, older clients fail closed, and native/runtime/Human gates are recorded separately. Keep the refusal when any path remains plaintext. Rollback disables Connect or retains the refusal; it never clears pins or re-enables plaintext automatically.

## Sources

- [Noise Protocol Framework](https://noiseprotocol.org/noise.html), especially handshake patterns, security properties, message limits and application responsibilities; checked 2026-10-22.
- [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html), especially §9.1 on key-compromise security.
- [noble-curves](https://github.com/paulmillr/noble-curves), [noble-ciphers](https://github.com/paulmillr/noble-ciphers), [noble-hashes](https://github.com/paulmillr/noble-hashes), and [hpke-js](https://github.com/dajiaji/hpke-js): candidate library sources, not a completed version or audit selection.
- ADR-0199, ADR-0202, ADR-0241, ADR-0242 and ADR-0243; [hosted Connect research](../research/2026-10-20-hosted-connect.md).
