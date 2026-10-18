# ADR-0229: Mobile cloud sessions are independent of Host pairing

- Status: Accepted for the T1 UAT slice; native qualification pending
- Date: 2026-10-18
- Issue: [#2101](https://github.com/BotHarness/DeepSeekBot/issues/2101)

## Context

TOB is an independent cloud group service. Its users must be able to connect from a phone without pairing a running DSH Host. Host owner tokens cannot authorize TOB requests, and a QR code must not copy another device's login.

## Decision

`src/cloud/CloudClient` owns imported instance configuration and cloud sessions. Screens use its public snapshot/actions. `native.ts` provides Expo SecureStore, explicit native `expo/fetch`, random/S256 crypto and the system authentication browser. Existing HostSession and push/telemetry owners remain independent.

The deployer produces complete public JSON after authenticated control-plane verification. The phone accepts that JSON through camera scanning or explicit text paste, with the same bounded parser and trust confirmation. The phone reviews the server and confirms trust, then compares credential-free discovery against fixed configuration. It never downloads a configuration URL from a QR. Critical replacement needs explicit confirmation and removes that instance's local session. Discovery consistency cannot prove server ownership; only the trusted delivery process establishes that choice.

WorkOS login uses a live ten-minute PKCE/state transaction and the exact registered development callback. The callback has a dedicated reverse-domain scheme. Router intent handling drops OAuth parameters; process death or cancellation starts a fresh login. A cold link cannot create a session. Custom schemes are not exclusive ownership proofs, so PKCE/state remain mandatory.

One bounded SecureStore record holds at most twenty instance entries and their separate token pairs, avoiding partial writes between credential fields. SecureStore failures fail the operation; there is no plaintext fallback. Unverified token fields never grant access: expiry is a refresh hint, and the service's signature-verified `/api/me` establishes current admission. Operations are serialized, rotated credentials are saved before readback, and logout distinguishes confirmed remote revocation from local-only cleanup. The UI snapshot never exposes token/code/verifier material. No offline identity admission is restored from storage.

The portable configuration validator is copied from the pinned TOB source named in `src/cloud/README.md`; this narrow protocol surface is not a new SDK or a second service authority. Contract changes require reviewing both repos and their compatibility cases.

## Consequences

This needs a new SDK58 development binary with Expo Crypto/WebBrowser and the callback scheme. Source tests/exports cannot qualify camera, secure storage, browser return or Human login. T1 closes only after native verification and the remaining organization/revocation slices. Organization controls, T2 group messaging, Prod and store releases remain outside this change.

## Ordinary-user onboarding extension

After verified cloud identity, the client calls the instance onboarding endpoint to ensure one default workspace. The service owns the stable operation identity; the phone never chooses another user ID. A setup failure retains the session and makes Check session the retry path. `admin` and `user` are distinct server-verified instance roles; both can use workspaces, while organization membership remains separately enforced by TOB. This requires the multi-user service candidate; older instances without onboarding cannot complete this updated login flow.

## Channel guest extension

Direct channel invitations reuse CloudClient and independent WorkOS sessions, but acceptance never selects or joins the host organization. The app offers a separate guest-channel entry; TOB Channel DO grants are the authority. Owner issuance persists an operation bound to user, organization, channel and email. Guest sends use a distinct `guest.send` pending scope, so a retry cannot accidentally become an organization-member request. The server enforces the grant's message-sequence history floor and current revocation on every read/send. Public invitation identifiers are not credentials. This initial inbox path targets existing verified users and does not claim email delivery or new-account registration.

### Channel Agent credential handoff

The mobile cloud client can provision an Agent through TOB's owner-authorized channel API. It persists a random secret, stable actor operation and target identity in the existing SecureStore vault before issuance; only the secret hash is transmitted at creation. Public snapshots omit the secret. A single outstanding handoff is retained across restart until explicitly cleared, revoked or the Human signs out; this does not add another credential authority.

Explicit Copy credential replays owner-authorized issuance to verify current rights, then exports the trusted instance configuration and this channel credential to the clipboard. It never exports a Human session or WorkOS key. Clearing the local copy is distinct from revoking the remote credential. Agent read/send scope confers neither organization membership nor local work authority. Channel lists and responses still use TOB's current server checks; no DSH transport is introduced here.

## Fixed work requests

The same cloud client lets an organization member request one fixed health check from a channel Agent. It saves an operation, actual signed-in user, target/channel and five-minute deadline in SecureStore before sending, then validates the returned canonical request. Retry after restart preserves the deadline and operation. Clearing that record or signing out is only local cleanup, not remote cancellation. TOB owns request/result messages; the Agent runtime separately owns its allow-list and execution ledger. A cloud membership never substitutes for local work authority. The initial UI uses explicit history reload, with no DSH or WebSocket claim.

## Unified workspace navigation

The root navigation shell hosts one shared workspace drawer, available from the existing computer chip and cloud screen headers. Its virtualized list has Computers and Cloud workspaces sections; choosing a computer returns to that Host's Chats, while cloud selection leaves Host pairing unchanged.

Cloud workspace rows are a disposable projection of current organization memberships and current channel-guest grants, keyed by instance and organization. Membership wins when both apply. A verified guest response may expose only the granted channel's organization name; that metadata does not create membership. Guest selection uses the guest-channel endpoint filtered by organization and never refreshes a token into that organization. Every channel request still enforces current server authority.

Opening the drawer refreshes the projection. Pagination preserves separate membership and guest cursors, including empty filtered pages. Closing or changing configured sessions invalidates in-flight display updates. No directory or grant cache is persisted. Sign-in, loading, empty, failure and retry states remain explicit. Native switching, maximum text sizes, revocation and separate platform acceptance must be recorded before claiming this navigation slice complete.

The display scope also includes the stored session's user ID. This is a local cache-partition hint, never admission: restored sessions still have no verified `identity`, and every operation uses the existing server checks. The hint remains stable during refresh while live identity is temporarily cleared, preserving drafts; logout, account replacement or critical instance configuration changes reset channel view state. A cancelled directory read stops before issuing the next page-source request and cannot publish results into the next account's directory.
