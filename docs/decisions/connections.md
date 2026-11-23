# Connection decisions

How phones, browsers and other Hosts reach a Host: the device gateway and its per-device credential, the one Host Feed every client reads, the routes (LAN, Tailscale, Tobs Connect, private tunnels and relays, SSH), the encrypted channel that runs over all of them except loopback and plain Tailscale, the hosted Connect service, and the durable Host Relationships between a Human's own Hosts. How it works lives in [the architecture](../architecture/botharness-architecture.md), the [Connect channel wire contract](../architecture/connect-channel-v1.md), the [LAN contract](../architecture/lan-phone-v1.md) and the [Environment panel design](../architecture/environment-panel.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0199, 0241, 0242, 0243, 0244, 0246, 0253, 0309, 0313, 0316, 0325, 0326, 0327, 0333, 0334, 0335, 0337, 0338, 0339, 0340 and 0350, and each section lists the ADRs it absorbed. Host member identity and sign-in are covered in the [Team mode decisions](team-mode.md#adr-0336).

Two rules run through every section:

- **Device Pairing is the only device authority.** A route, a relay, an account or a Host Relationship can carry or request enrollment, but only the Host's Device Pairing owner issues, records and revokes a device grant. No route keeps a second credential store, and no client holds a DSH credential.
- **Reachability never changes trust, and an uncertain write is never replayed.** Learning a new address, switching routes or recovering DNS keeps the pinned Host key and the encryption requirement. A request whose acknowledgement was lost stays unknown until the same Host confirms it; nothing retries it on another route.

## 1. A same-listener device gateway with a per-device credential

<a id="adr-0199"></a>
<a id="adr-0242"></a>
_Formerly ADR-0199 and ADR-0242._

BotHarness serves a device gateway on DSH's own web server under `/botharness-device`. A paired device sends its per-device credential (`Authorization: Device <id>.<secret>`) to BotHarness routes, and the gateway forwards the request to the native `/api` carrier and the Remote stream mux over loopback with a DSH cookie that never leaves the Host. The device speaks the same envelopes as the Web Client; only the prefix and the credential differ. Management (create an offer, list, revoke) sits on the authenticated `/api` carrier, so only the Human's own session reaches it.

A pairing offer is one-time and lives only in Host memory for 10 minutes. A device record holds id, name, created, last seen and revoked, and the secret is stored only as a hash and never logged or printed. Every request is checked against the current record, so revocation refuses the next request and closes the device's open streams and in-flight responses at once, with coded refusals (`device-revoked`, `device-unknown`, `device-credential-missing`). A browser pairs a Remote Host the same way and keeps its record in its own origin-local storage; the gateway answers cross-origin requests only from Host-shaped origins without cookies, and a browser opens streams with a 30-second single-use ticket because it cannot set a WebSocket header. The phone's full Host Web Client in a WebView has been removed on every route.

Why: DSH's cookie names no device, cannot be revoked per device and has no hook to close streams the mux already accepted. A second port or reverse proxy is more attack surface. The full WebView client was removed because a page loaded through a relay can be replaced by that relay.

Enforced by: `packages/core/test/device-gateway.test.ts`, `device-pairing.test.ts`, `device-pairing-resume.test.ts`, `cli-devices.test.ts`, `scripts/e2e-device-pairing.mjs`.

## 2. One Host Feed for every client; the device owns its alerts

<a id="adr-0243"></a>
_Formerly ADR-0243._

Every client reads every Host, This Host included, through one **Host Feed** over the device gateway, using the shared Host client in `packages/host-client` and `apps/mobile/src/host/`. New synced state is added to the Feed once. The Web Client moves its reads of This Host onto the Feed one area at a time. The Host decides what deserves attention from its Human Inbox; the **Device Notification Preference** belongs to each device, which pushes a copy to every Host it is paired with so the Host can decide sends while the app is closed. A phone is only ever a Paired Device. A browser on Host A is a Paired Device of Host B; A never relays B or stores B's credential. Host icons, colours and names are device-local, and the UI says This Host and Remote Host (本机 and 远程), never Computer.

Why: building every piece of synced state twice, once for the bridge and once for the phone, was the cost this removes. Attention belongs with the Host that saw the work; whether a person is alerted belongs with the device they hold.

Enforced by: `apps/mobile/test/host-client.test.ts`, `packages/core/test/cli-device-notifications.test.ts`.

## 3. Routes: LAN, Tailscale, Connect, private tunnels and SSH, chosen per client

<a id="adr-0246"></a>
<a id="adr-0309"></a>
<a id="adr-0333"></a>
<a id="adr-0338"></a>
<a id="adr-0350"></a>
_Formerly ADR-0246, ADR-0309, ADR-0333, ADR-0338 and ADR-0350, with the route amendments of ADR-0241._

One pairing can carry several routes for the same Host identity. LAN and Tailscale are independent optional preparations, and Connect has its own settings. Automatic selection prefers LAN, then Tailscale, then Connect. A client may instead save a manual route for one pinned Host; that client then uses only that route, shows failures and never silently falls back. Learned addresses are accepted only for the same Host ID and pinned key. Switching drains in-flight calls and uploads first.

- **Tailscale.** Enabling persists a managed intent and publishes the Host with `tailscale serve`, keeping unrelated Serve entries. Disable removes only a mapping this owner created and still matches. The managed mapping targets an in-process ingress bound to `127.0.0.1` that stamps a process-random tag, so member password sign-in trusts only that owned hop together with `x-forwarded-proto: https`; forwarded headers or hostnames alone are never trusted.
- **Private tunnels and relays.** One private connection owner manages two slots, `quick` (Quick Tunnel) and `custom` (Named Tunnel or HTTPS ingress), sharing one admission token in the credentials Provider. The Docker private relay serves up to 16 Hosts, each with its own claim and tokens, and forwards ciphertext only. Relay or tunnel admission grants no Host control: the encrypted gateway still checks the pinned Host key and the exact approved device key.
- **SSH.** The computer CLI runs system OpenSSH in strict, batch mode and forwards a local loopback port to the Host's existing listener. SSH gives reachability only; pairing, the pinned Noise channel and revocation are unchanged, and the forwarded port admits only the Noise WebSocket path, with cookies stripped.
- **DNS recovery.** For official Connect and Quick Tunnel names only, an `ENOTFOUND` from the system lookup triggers one fresh IPv4 query inside the request deadline. TLS, the hostname and the pinned key are unchanged, and the product never edits system DNS.

**Upgrading a Profile to two private routes.** The private connection owner migrates its credentials into a form the previous Host binary cannot read, so reverting the packages alone is not a rollback. Before first starting the upgraded Host, stop that Host and its private tunnel processes, take a complete protected backup of the Profile and its credentials Provider storage (machine-local, under the same secret protection, never in Git, logs or review evidence), record the matching pre-upgrade package revision privately, and check that the backup restores. To roll back, stop the upgraded Host and every tunnel it owns, restore that whole backup, then start the matching old packages; do not overwrite only the credentials record while an owner runs. Configuration and grants made after the backup are lost and must be reconciled by hand. A downgraded phone may reject an entry with two saved routes: rescan a single-route invitation with the same Host identity, never bypassing the fingerprint check.

Why: a person moves between home, office and mobile networks, so one Host needs several routes without several identities. Every route is a carrier; keeping trust in the pin and the device grant means a new route can never become a way in.

Enforced by: `packages/core/test/private-tunnel-configuration-revisions.test.ts`, `packages/core/test/private-tunnel-dns-recovery.test.ts`, `packages/core/test/private-tunnel-managed-routes.test.ts`, `packages/core/test/private-tunnel-phone-admission.test.ts`, `packages/core/test/private-tunnel-public-probes.test.ts`, `private-relay.test.ts`, `private-browser-admission.test.ts`, `managed-tls-ingress.test.ts`, `ssh-tunnel.test.ts`, `bot-tailnet.test.ts`, `connect-health.test.ts`, `apps/mobile/test/route-preference.test.ts`, `learned-routes.test.ts`, `deploy/private-relay/conformance.mjs`.

## 4. Device traffic is encrypted against pinned Host keys

<a id="adr-0244"></a>
_Formerly ADR-0244._

Connect, LAN, private routes and SSH carry application traffic inside a `Noise_XK_25519_ChaChaPoly_SHA256` channel that ends in the client and the Host process, before the device gateway admits a request. The Host's long-lived X25519 key lives in the DSH Credentials Provider; a device keeps its private key in Keychain or Keystore. The client pins the full Host key at pairing, together with the requirement to encrypt. No application data flows until the handshake finishes and the device is admitted, and pairing itself runs inside the channel, so no device credential, offer secret or private input travels in a header, cookie, URL or subprotocol. The one exception is the private-route admission token: a browser sends it in a WebSocket credential subprotocol, and the tunnel ingress or private relay checks and strips it before forwarding. It only opens the route and grants no device authority. Unary calls, streams, uploads, approvals, private input and push registration all go through it. A key mismatch, a missing pin or an unsupported version is refused with its own code, and there is never a plaintext retry. Loopback and plain Tailscale keep their earlier contract. Viewer signalling and media on Connect stay unavailable until separately qualified.

Why: on Connect, TLS ends at Cloudflare's edge, and the Human rejected Cloudflare being able to read device traffic. Pinning the key, not the relay's word, keeps a relay from substituting a Host. Forward secrecy protects completed sessions if the Host key is stolen later; it does not protect a compromised endpoint.

Enforced by: `packages/core/test/connect-noise.test.ts`, `connect-encrypted-gateway.test.ts`, `connect-channel.test.ts`, `connect-secret-route.test.ts`, `device-lan.test.ts`.

### Remote Host password sign-in uses the same encrypted device channel on every route

Accepted design for [#4896](https://github.com/BotHarness/DeepSeekBot/issues/4896). The first delivery covers standalone Owner sign-in over HTTPS in the desktop and Web Clients. [#4898](https://github.com/BotHarness/DeepSeekBot/issues/4898)

Desktop, iOS, and Android can add a Remote Host with a Host-owned username and password. The Web Client shares the path when its existing Owner-authorized Add remote action is available. Clients verify a saved Host key or a fingerprint supplied over a trusted channel before submitting a password. For a first connection by address alone, the Human supplies a trusted HTTPS origin. The Client validates its certificate and uses that origin to establish initial trust in the Host key.

A Host sign-in link or QR code supplies the route and fingerprint for first contact, including on an HTTP-only LAN. The Client can also use a fingerprint the Human verifies independently. A first-time HTTP address alone can discover a Host and requires proof of its identity before sign-in. A saved key mismatch ends the attempt before credential submission. Changing a route retains the Host identity and its pinned key.

The Client and Host complete their authenticated Noise channel before exchanging credentials. Tailscale, Cloudflare Tunnel, Quick Tunnel, and other proxies can carry the channel if they forward it to the device gateway. The Host uses the same admission checks on every route. A sign-in link carries public Host discovery data and requires the Human's own credentials. The existing pairing QR continues to obtain approval on the Host.

Clients connecting by HTTPS address read `signIn.password` from `GET /botharness-device/channel`. It is true when the Owner has enabled password sign-in or Team mode has an active member with a password credential. The Noise gateway accepts one unified password attempt per channel and resolves the role from the Host's credential store. An unknown username and a wrong password both perform an Argon2id verification and return the same refusal. A disabled Owner account returns a distinct refusal only after password verification. [#4962](https://github.com/BotHarness/DeepSeekBot/issues/4962)

After authentication, the Host enrolls the exact Client device key with a revocable grant for that Human. The current Host Owner receives the same authority as an Owner-paired device. A Team member receives a member grant and completes any required first-password change before normal access. The Host records how it issued the device grant so the Host Owner can revoke password-enrolled Owner devices together when changing the password. See [Host password policy](team-mode.md#host-password-sign-in-and-team-mode).

Password-enrolled Owner devices keep the Noise requirement on HTTPS, including Tailscale. Browser and Computer viewers need their own media and signaling support on the encrypted device channel. They remain available through direct Host access and the existing QR-paired Tailscale path.

Why. The URL controls how a Client reaches the Host. The authenticated Host key controls which Host receives the password. This supports HTTP-only LANs and TLS-terminating relays with the same credential protection.

Enforced by the [Remote Hosts verification journey](../../.agents/skills/verify-deepseekbot/features/remote-hosts.md#standalone-owner-password-sign-in-4898) and the remaining acceptance cases in [#4896](https://github.com/BotHarness/DeepSeekBot/issues/4896).

## 5. Tobs Connect: an account discovers Hosts; a managed tunnel carries ciphertext

<a id="adr-0241"></a>
<a id="adr-0313"></a>
<a id="adr-0326"></a>
<a id="adr-0327"></a>
_Formerly ADR-0241, ADR-0313, ADR-0326 and ADR-0327._

A WorkOS AuthKit account (in the Tobs environment) discovers Hosts and brokers enrollment. Connect is opt-in per Host. The relay Worker in `packages/connect-relay` provisions one Cloudflare Tunnel and DNS record per online Host. The Host runs a pinned `cloudflared` whose ingress admits only `/botharness-device/*`. Sign-in uses PKCE on the phone, CLI Auth on the Host, and email/password through four bounded relay routes when the relay advertises it. WorkOS stays the only password authority.

**Enrollment.** When a phone or a desktop Client is signed into the same account as a Host, the account's Host list authorizes enrollment directly. The Host verifies the relay signature, the exact account and registration, the offer freshness and the verifier hash. It then approves only the exact Noise peer key, so no operator is needed at the computer. QR, pasted and private pairing keep explicit approval of the device on the Host. Trusting the account means a compromised account or relay can enroll a new device, and the Human accepted this. Existing pins still cannot be replaced. Signing out stops discovery and new enrollment but does not revoke existing devices. Remote sign-out of another linked computer writes a session tombstone before removing its tunnel, so a still-valid token cannot re-link.

**Capacity.** A DNS record lives exactly as long as its tunnel, and a re-created Host gets a fresh random label because resolvers cache a missing name for 30 minutes. The relay's database row is authoritative. A once-a-minute reconciler repairs differences within a bounded call budget. It reclaims tunnels that have been offline for 5 minutes. Zones form one pool, capped at 980 tunnels, and each account can link at most 3 Hosts. When the pool is full, the relay evicts gone, then offline, then least recently used idle tunnels. A tunnel is always kept for 30 minutes after it connects and for 30 minutes after its last use. Hosts that find no slot wait in one queue, and the Host and phone show their place in line and the earliest free time.

Why: signing in with the same account is the setup the Human chose instead of making every tester install Tailscale. The tunnel gives a plain HTTPS origin without writing a relay transport. The encrypted channel (section 4) keeps the content private from that tunnel. The pool rules came from production: DNS records, not tunnels, ran out first.

Enforced by: `packages/connect-relay/test/connect-relay.test.ts`, `tunnel-lifecycle.test.ts`, `password-auth.test.ts`, `packages/core/test/connect-account.test.ts`, `account-enrollment.test.ts`, `connect-pairing.test.ts`, `connect-zones.test.ts`, `cli-connect.test.ts`.

## 6. Onboarding targets the owning Client, and old releases keep working

<a id="adr-0253"></a>
<a id="adr-0325"></a>
<a id="adr-0335"></a>
_Formerly ADR-0253, ADR-0325 and ADR-0335._

One Connections entry with **Add connection** covers both inviting a device to This Host and joining a Remote Host. A command to enroll a Remote Host goes through a bounded control relay to one explicitly chosen Client, which runs its own pairing and keeps the credential in its own origin-local storage. This Host only carries the command. Phone onboarding first shows the install guide and waits for an explicit "App installed". It completes only when that exact device reports its first loaded roster (`feed_read_at`), not when it is approved or admitted.

The phone and the computer ship separately, so each tolerates the other's older release. A missing bridge method (HTTP 404) means "update Tobs on the computer", not an outage. `ping` returns the Host's version and `minAppVersion`. The phone sends `x-tobs-app-version` on every JSON bridge call. Each side recommends a minimum for the other (`MIN_PHONE_APP_VERSION`, `MIN_HOST_VERSION`) and never blocks: a version below the floor shows a dismissible chip. A missing, `0.x` or malformed version never trips a floor. A floor rises only with the release that needs it, to a version already shipped.

Why: a credential generated in a CLI process does not add a Remote Host to a browser, so the command must reach the Client that will hold the credential. Treating a missing method as an outage made a new phone drop an older Remote Host every 20 seconds.

Enforced by: `packages/core/test/client-compat.property.test.ts`. That property test checks the following for any version string:

- A missing, development or malformed version is never below a floor.
- A release is below a floor exactly when it orders before it.
- Version order is a total order with SemVer prerelease precedence.

Other tests: `cli-connection.test.ts`, `onboarding.test.ts`, `apps/mobile/test/home-host-compatibility.test.tsx`.

## 7. Host Relationships enroll each Client independently and durably

<a id="adr-0334"></a>
<a id="adr-0337"></a>
<a id="adr-0339"></a>
<a id="adr-0340"></a>
_Formerly ADR-0334, ADR-0337, ADR-0339 and ADR-0340._

A **Host Relationship** is a durable link between two of the Human's Hosts. Each side owns it in its operational database. One side starts it, and the other approves it once (or same-account trust qualifies it, section 5). From a relationship, each supported desktop or Web Client obtains its own revocable device grant. A relationship is not a shared credential, a Feed mirror or Bot collaboration. Phones still enroll each Host on their own. In Team mode, relationships serve only the Host Owner's Clients. Authorization and reachability are tracked separately, and each direction is checked on its own; a relationship is shown as bidirectional only after both directions verify.

- **Durable enrollment.** The source writes an intent before it asks for an offer, with the 10-minute offer deadline. The target redeems atomically against that intent. Cancellation writes a tombstone and revokes matching devices in the same transaction, so a late reply or a late offer cannot leave an unknown grant active. Cleanup retries at most 8 times. Records are capped at 1,024, and new intents are refused instead of evicting authority.
- **Disconnect.** Disconnect revokes the derived grants and keeps phone grants. It suppresses automatic re-enrollment until an explicit reconnect. When the peer is offline, the revocation stays pending, with at most 8 automatic retries per budget. Up to 256 relationships are retained, and an old acknowledgement never retires a later generation.
- **Uncertain writes.** A management write that can cut its own route (revoke, LAN off, stop a private route, sign out) records an execution guard before it is sent. The guard is released only by a readback from the same pinned Host. It binds an opaque configuration revision, so an old confirmation cannot stop a replaced route. At most 32 unresolved writes are kept, and the guard is never turned into a replay queue.

Why: a reply can be lost after the Host has already acted, so cancellation must not depend on knowing the device ID, and a retry must not mint a second grant. Copying one Client's credential to others would make independent devices impossible to revoke one by one.

Enforced by: `verification/enrollment/Enrollment.tla`, checked by `node scripts/verify-tla.mjs enrollment`. The model checks four properties:

- A key gets at most one grant.
- A cancelled key has no active grant.
- No grant is issued after the deadline.
- A grant whose reply was lost is eventually revoked, assuming cleanup keeps getting a turn (weak fairness). The model does not bound attempts. In the code, automatic cleanup stops after 8 failed attempts; a manual cleanup attempt resets that budget, and revocation needs a cleanup that succeeds.

Other tests: `packages/core/test/host-relationships.test.ts`, `account-relationships.test.ts`, `relationship-admission.test.ts`, `relationship-control.test.ts`, `cli-relationships.test.ts`, `cli-relationship-deadline.test.ts`, `cli-relationship-private-file.test.ts`.

## 8. Host capabilities degrade or fail with an actionable code

<a id="adr-0316"></a>

Tobs keeps the [DSH admission floor](release.md#adr-0087) and probes tool API shapes in the Host compatibility adapter. Missing optional tool presentation or a signature `TypeError` lets setup continue and records `botharness.host_capability.degraded` with the capability and DSH version. Model-selection installation is also optional. Missing required native execution reports `HOST_INCOMPATIBLE` with update guidance and retains the original error when present. Other refusals propagate through the selected API.

The daily canary checks the npm `next` release until that version passes. It starts a Bot DM and accepts a reply or a model-credential refusal as evidence that Orchestrator setup reached the model boundary. Any degraded capability in the canary run fails qualification.

Why: An open floor admits compatible Hosts as they ship. Capability-specific handling preserves working turns across API changes, and the canary exposes a degraded setup before it becomes routine.

Enforced by: [native API compatibility](../../packages/core/test/native-agent-compat.test.ts), [Host cast guard](../../scripts/check-host-casts.mjs), [canary results](../../scripts/test/dsh-canary.test.mjs), and [scheduled canary](../../.github/workflows/dsh-canary.yml).
