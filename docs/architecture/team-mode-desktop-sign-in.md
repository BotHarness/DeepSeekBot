# Desktop Team sign-in contract

Issue [#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201), stacked on M8 [#4165](https://github.com/BotHarness/DeepSeekBot/pull/4165). This contract supplies logic for the desktop sign-in stepper; Claude owns its visual components. It implements the identity and transport boundaries of [ADR-0336](../adr/0336-hosts-have-members.md).

## Packages and ownership

- `@botharness/host-protocol/*` owns the pure wire contracts, Host carrier interface, Noise XK/channel implementation, route rules, pairing link codec and Team invitation codec. It contains no React, React Native or Expo implementation.
- `@botharness/host-client/*` owns saved Host identities, Team requests and the sign-in flow, pairing redemption, encrypted carrier, Host session, conversations, inbox, model/settings and notification clients. Shared appearance values and non-visual presentation helpers live here because desktop and mobile both consume them. The model cache uses `@tanstack/query-core`, without a React adapter.
- `apps/mobile` owns SecureStore, native transport, app version, Android key agreement, localization and platform UI. `HostCarrier.keyAgreement` injects Android's existing key agreement implementation; `HostCarrier.appVersion` supplies the installed version. No native module is imported by either shared package. Inbox localization is supplied with the `InboxQuery.activityUpdateHost()` callback so an active inbox reads the current language.
- `packages/client/src/client/remote-hosts.ts` adapts the shared flow to the desktop Owner's existing remote-host storage lock and connection lifecycle. This change does not deliver the stepper or H3 Host-side credential custody.

The computer-side bundles inline both private workspaces. Published plugin manifests keep them as build-time dependencies; installed plugins do not need unpublished workspace packages. Metro consumes the mobile workspace dependencies directly.

`pnpm lint` rejects every package import of `apps/**`, including test, type-only, re-export, dynamic import and require paths. It also rejects core imports of desktop Client source. Shared test fixtures reside under `packages/host-client/test`; cross-layer companion tests reside under `packages/client/test`.

## Entry points

Import `remoteHosts` and types from `packages/client/src/client/remote-hosts.ts` in the desktop Client. The `RemoteHosts` adapter exposes:

```ts
teamSignIn(
  target: TeamSignInTarget,
  localHostId?: string,
  signal?: AbortSignal,
): Promise<TeamResult<TeamSignInFlow, TeamSignInError>>;
```

`TeamSignInTarget` is either `{ kind: 'invitation', link }` or `{ kind: 'address', route, username }`. A manual address must be an HTTPS origin. Manual discovery reads `/botharness-device/channel` to obtain the Host id, name, public key and fingerprint, verifies their consistency, and sends no password. Display that fingerprint for independent comparison with the Host's fingerprint. Discovery alone is not identity verification.

The existing `pair(link, deviceName, localHostId, trust)` returns `{ ok: false, code: 'team-sign-in-required', invitation }` for a valid Team invitation. The UI must route this result to `teamSignIn({ kind: 'invitation', link }, localHostId)`. Invalid or expired Team invitations retain their invitation-specific refusal code. They never become relationship enrollment or ordinary pairing offers.

A UI can also use the framework-independent `prepareTeamSignIn` from `@botharness/host-client/team-sign-in`, injecting a `HostCarrier`, `previous(hostId)` and `commit(host, confirmed, signal)`. The commit callback must atomically recheck identity replacement and persistence ownership; use the desktop adapter for the built-in Client.

## State and actions

`flow.getSnapshot()` returns a discriminated `TeamSignInState`; `flow.subscribe(listener)` returns an unsubscribe function. Snapshots contain no password, credential or private key. The UI owns pending-button feedback while awaiting each action, and renders the last returned refusal alongside the current step. Refusals leave that step retryable.

| State                   | Data                                          | Action                                                                                                                             |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `fingerprint`           | `host: { id, name, fingerprint }`, `username` | Compare with the Host; call `confirmFingerprint(fingerprint)` with the exact displayed value.                                      |
| `sign-in`               | Same Host and username                        | `await signIn({ password, deviceName })`. No password is sent before confirmation.                                                 |
| `password-change`       | `member`                                      | `await changePassword({ current, next })`. Clear password fields after success; keep them local to the form.                       |
| `identity-confirmation` | `member`                                      | `await complete()`. If it refuses `identity-switch-required`, obtain explicit replacement confirmation and retry `complete(true)`. |
| `complete`              | `member`                                      | `complete` has returned `{ ok: true, value: SavedHost }`; close the stepper.                                                       |
| `cancelled`             | No identity                                   | Dismiss; start a fresh flow to retry.                                                                                              |

A returning member skips `password-change` when the Host says `mustChangePassword: false`. `complete()` never persists a Host while that gate is set. Repeated or out-of-order actions refuse `flow-busy` or `flow-step-invalid`. The UI should disable duplicate submission.

`await flow.cancel()` aborts sign-in work and attempts to revoke an uncommitted device grant. Unreachable revocation cannot guarantee remote cleanup. Cancellation waits for a commit already in progress: a completed save stays installed; a failed commit remains cancellable. The external `AbortSignal` cancels the flow as well. Dispose the subscription when closing the stepper.

## Identity and authority

`SavedHost.member` records member `humanId`, `username`, `displayName`, pinned `fingerprint` and `mustChangePassword`. Its absence is the backward-compatible Owner representation. `savedHostIdentity(host)` returns `{ kind: 'owner' }` or `{ kind: 'member', humanId, username }` for display and identity comparisons. Parsing refuses a `member.*` credential without valid member metadata.

One saved identity is active per Host. Replacing Owner with member, or switching Human id, needs confirmation; a changed pinned Host fingerprint is always refused, even with replacement confirmation. The desktop adapter rechecks these conditions under the storage lock, retires the old session and its viewers, installs the member session and attempts to revoke the superseded grant. Member traffic uses the M8 device grant and member Peer, never an Owner cookie. Relationship and E6 enrollment refuse member credentials and cannot manufacture a member grant.

Remote-host management is available only to the local Owner Client. This is independent of being a member on the remote Host. H3's credential custody migration remains a separate issue scope; existing desktop storage remains in place for this change.

## Refusals

All actions use `{ ok: true, value } | { ok: false, code, retryAfterSeconds? }`. Codes are stable machine values:

- Invitation: `invitation-invalid`, `invitation-expired`, `invitation-version-unsupported`.
- Trust/transport: `fingerprint-mismatch`, `insecure-transport`, `unreachable`, `response-invalid`, `request-cancelled`.
- Authentication: `credentials-invalid`, `rate-limited`, `team-mode-off`, `member-suspended`, `remote-access/denied`.
- Password: `password-change-required`, `password-weak`, `password-reused`, `invalid-input`.
- Lifecycle/persistence: `identity-switch-required`, `storage-failed`, `flow-step-invalid`, `flow-busy`, `owner-required`, `this-host`.

For `rate-limited`, honor a positive `retryAfterSeconds` and retain the username. A fingerprint mismatch must stop the sign-in attempt; do not offer a bypass. Passwords and device credentials never belong in logs or telemetry. Starting a new flow is required after cancellation.

No new Host bridge method, `/api` route or Bot tool is introduced: the adapter uses M8's device sign-in/password/unpair surfaces. Existing CLI member commands and their parity checks remain unchanged.

## Regression and performance limits

The extraction preserves existing session algorithms, caches and refresh intervals. It adds no session polling or always-running timer. Invitation preparation and fingerprint confirmation are local; a regression asserts zero requests before confirmation. Manual discovery uses one GET. A successful HTTPS sign-in uses one discovery GET and one sign-in POST; first-password change adds one POST. Network timeouts remain bounded by the existing Team client (30 seconds overall, eight seconds per route attempt); there is no new retry loop. These request-count guards bound added work without claiming end-to-end speedups.

Tests cover the complete adapter-to-storage path, first-password gate, invalid trust, identity switching, cancellation, retryable refusals, package lint and mobile CI selection. Existing mobile and desktop suites cover the moved surrounding journeys. Native-device, visual stepper and Human acceptance remain separate gates.
