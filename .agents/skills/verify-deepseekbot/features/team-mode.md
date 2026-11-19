# Team mode: members sign in and share public channels

## Sources

- `packages/core/src/team/**`
- `packages/client/src/client/team-*`
- `packages/host-client/src/team-*.ts`
- `packages/host-client/src/shared/team-sign-in-page.ts`
- `apps/mobile/src/team/**`

## Terms

- Team mode
- Host Owner
- Host Member
- Member Credential
- Host Role
- Host Permission

## Sub-features

- S1: Owner turns on Team mode in Bot settings › Team; with no Owner password the switch first asks for one ("Save and turn on"). The Owner can allow plain HTTP only through a warned confirmation.
- S2: Owner adds a member (name + username); the one-time password is shown once with a Copy button and is never shown again. A group's settings show a "Public channel" switch to the Owner.
- S3: A member opens `/botharness-device/team/` over Host-known HTTPS in another browser, signs in, and must replace the one-time password before anything else (the dialog cannot be dismissed; the Host refuses other calls with `password-change-required`).
- S4: A member sees only Tobs: the page enters Bot mode with no exit to the native shell; Bot settings lists Profile, General, Appearance, Notifications, Keyboard shortcuts and Team; the New menu offers channel and channel section, with no Browse channels entry. DSH-native calls are refused (`remote-access/denied`). Team › Account offers Sign out, which ends only that grant.
- S5: A public channel is already in the member's list without any join step, and one made public later appears without a reload; turning it private removes it at once, including when it is open. Owner and member messages show each other's names; each sees only their own messages as their own bubbles.
- S6a: Host-managed Tailscale Serve routes target a dedicated loopback ingress. `phone-route` reports `managed.trustedIngress` and `memberSignIn`; invitations and Team sign-in addresses exclude manual Tailscale mappings. Both browser and mobile password sign-in succeed through the managed route; forwarded headers and forged tags on the main listener refuse.
- S6: Refusals: wrong password, rate limit, non-loopback plain HTTP (`insecure-transport`, also with a forged `x-forwarded-proto: https`) unless the Owner allowed it, a private group opened by ID, Team mode off (all members disconnect, Owner keeps working).

- S7 (M3 Host/CLI): role catalog, built-in roles, custom role CRUD and union permissions. `permission-required` carries `details.permission`; removing a role permission refuses the same member's next call.
- S8 (M3 Host/CLI): `memberDevices { humanId }` is self-scoped without management permission; other targets require `members.manage`. `memberDeviceRevoke { humanId, grantId }` closes only that grant. `current` comes from the authenticated principal.
- S9 (M3 Host/CLI): `ownerTransfer { humanId, password }` verifies the current Owner password; the outgoing Owner gets Admin and the target has no roles. The outgoing Owner's paired devices and pending offers cannot inherit the new Owner, including an A→B→A round trip. Transfers require a credential issued by the current Owner and a completed forced change; `owner-transfer-target-unverified` requires current-Owner reset followed by the target's password change.

- S11: After a member's first sign-in, the Web Client and the phone ask once for a chat name (prefilled with the admin-set name) and photo. Done saves both on the Host; Later or closing skips. Either answer ends the prompt on every device (`human-identity --as <member>` no longer shows `profileSetup: "pending"`). The Owner, and a member who already has a photo, are never asked. Drive it with `node scripts/e2e-team-profile-setup.mjs --name <instance>` on a fresh instance; it captures the prompt in light and dark under `.humanlayer/verify/<instance>/team-profile-setup/`. The phone screen has a source test only until native QA (#4446).

- S10 (M14 Host/CLI): `channels member-candidates <id> [--query <name>]` and `channels add-member <id> <username>` enforce `addMembers` as the explicit calling Human. An invitation opens private/roles/public Channels immediately in list, stream and search. A role-based join exits on role revoke; a named invitation remains. Bots in the Channel do not cause invitation refusal. The Add people picker UI is verified separately by its UI owner.

## How to get to it (user POV)

Owner: Bot settings › Team. Member: open the address under Team › Sign-in › Address in a browser on another machine, sign in, choose a new password, then open the public channel from the list.

## Driving it with verify-app

No model is needed. Launch an isolated Host and run `doctor`. Seed with the CLI (secrets only through stdin and private files):

```bash
printf '%s\n' "$OWNER_PASSWORD" | deepseekbot team-mode owner-password --password-stdin
deepseekbot team-mode on
deepseekbot members create --username bob --display-name Bob --initial-password-file .tmp/bob.pw
deepseekbot channels set-public <group-id> on
deepseekbot --as bob channels
```

For the member browser, relaunch the Host's web server on a LAN address with a task-only certificate (DSH `webserver` patch `host`, `tls.certFile`, `tls.keyFile`) and drive two isolated browser contexts: the Owner through the launcher URL, the member through `/botharness-device/team/`. `shot` logs in with the Owner token, so drive the member context directly. Capture the Owner's Team section, the one-time password dialog, the member sign-in page, the forced password dialog, the member's Tobs view with the public channel already listed.

Canonical state: `deepseekbot members list` shows Bob without `mustChangePassword`; the group's `humanMembers` lists Bob; Bob's message author carries his Human ID and display name and its Source Event row carries `human_id`. Also check the plain-HTTP LAN page shows the insecure notice with a disabled form.

## Gotchas

- Password sign-in from anywhere other than loopback needs HTTPS or the encrypted device gateway; a plain `http://<lan-ip>` page shows the insecure notice and a disabled form.
- The first-run "Switch views" tutorial covers the sidebar in a fresh Host; click `Skip` first.
- Member and Owner must use separate browser contexts: one browser holds one identity per Host.
- M2 Host methods return only the calling Human's private Bots, private Tob and Activity. Verify `ownerHumanId`/`owner`, `bots list|create|show|delete --as <member>` and `activity list --as <member>`. A private target refuses with `bot-not-found`; Host administration by a member Tob refuses with `permission-required`. Client activation and rendered acceptance remain separate from the logic branch. Legacy Human authors without a Human ID denote the Owner.
- Packaged consumers may bundle another copy of DSH's Connection class: test capabilities at the boundary, since `instanceof` does not establish the live service's API.

M3 canonical verification: `roles catalog`, `roles list|create|update|delete`, `members roles <username> --set <roleIds>`, `devices --member <username> [--revoke <grantId>]`, and `team-mode transfer-owner <username> --password-stdin --confirm`. Run allowed and refused operations with `--as`. Browser admission and device revocation must also be exercised through the member HTTP carrier. M3 rendered Client dialogs/sheets are a separate UI-owner gate.

M3 review regressions: suspended Humans have no effective permissions, role deletion requires CLI `--confirm`, and live roster/Channel gates recheck the current Owner after transfer for baselines, queued frames, new publications and SSE. See the [transfer credential rule](../../../../docs/architecture/team-mode.md#m3-owner-transfer-credential-rule) before qualifying ownership changes; clearing `mustChangePassword` alone does not establish eligibility.

M10 Host/CLI: `usage members --period week`, `models allowed`, and `roles update <roleId> --models all|provider/model,provider/model`, including `--as`. `usageByMember` requires `usage.view`; refusal is `permission-required` with `details.permission`. Route selection and the next turn refuse `model-not-allowed` with `details.route`; `get`/`list` mark `modelAllowed: false` without changing the plan. Members receive no credential readiness. The per-member table, Role Models editor and filtered Client pickers belong to the separate UI half.


M14 canonical verification: launch `m14-logic` and run `doctor`; enable Team mode, create two members and change their initial passwords through `--as`. Create private and roles Channels as Owner. Use Owner and member `channels member-candidates <id> --query <name>` and `channels add-member <id> <username>`; verify `channels`, `channel-messages`, `channel-timeline` and `message-search --query <marker>` as the invited member. Open `followChannel` through the authenticated member carrier. The person whose role matches a roles Channel is in it automatically; invite the other person by name. Revoke both people's matching role with `members roles <username> --set member`: the role-joined person's list/search and stream lose access, the invited person's retain it. Set `--add-members admins` and prove both candidate search and invitation refuse a regular member with `permission-required` / `details.permission: 'addMembers'`. Exercise `--as` for both successes and refusals. Upgrade/restart classification is covered by `packages/core/test/team-channel-membership-migration.test.ts`; see [M14 runtime notes](../../../../docs/architecture/team-mode.md#m14-runtime-invitations-and-membership-basis). Stop the verified task Host and check its process/port release. This logic journey does not qualify rendered Web, installed Desktop, native mobile or Human acceptance.

Managed Tailscale qualification: launch a named isolated Host, save private Serve configuration before publication, run `phone-route-publish --confirm`, verify its mapping targets the new ingress rather than the main Host port, and sign in with the invitation fingerprint at `/botharness-device/team/device-sign-in`. Use a private password file; record only the HTTP status and credential presence. Run `phone-route-disable --confirm`, stop the owned Host and verify unrelated mappings are unchanged. Automated tests use a fake Tailscale command; never run automated tests against machine Serve configuration.

#4222 automatic Channel membership: launch a fresh named instance and run `node scripts/e2e-team-auto-join.mjs --name <instance>`. It creates a Finance role, public, roles and private Channels and two members, then checks through `--as` that each member is in exactly the Channels they can see, that pins stay per user, that granting the role joins its Channel, that revoking it removes the Channel even while it is open in the member Web Client, and that making a Channel private removes every automatic member. It captures the member Web Client in light and dark under `.humanlayer/verify/<instance>/team-auto-join/`. Native mobile and Human acceptance are separate.

#4222 Human DMs: run `node scripts/e2e-team-human-dm.mjs --name <instance>` on a fresh named instance. Opening a person with `--as <user> dm <username>` returns the DM but lists it for neither side; the first `channels send` lists it for both, and the recipient's member Web Client shows it without a reload. Light and dark captures land under `.humanlayer/verify/<instance>/team-human-dm/`. Native mobile and Human acceptance are separate.

M15 security suite: `node scripts/e2e-team-security.mjs --launch` (or `--name <instance>` on a running Host) drives real model turns against Role Policy (A), file, Shell and grant boundaries (B) and the shipped hard boundaries (C), asserting on Host state and tool results. Shell boundaries count only when `team-mode status` reports `isolation: enforced`. Publish `.humanlayer/team-security/<time>/` with `pnpm evidence:publish`; AGENTS.md requires it for permission-affecting PRs.

B4 and B5 in `scripts/e2e-team-security-engines.mjs` use Claude Code and Codex on disposable folders. B4 checks that native file and shell tools leave both in-Grant and outside fixtures unchanged. B5 checks that both tools can update an outside fixture when Full access was acknowledged for new Assignments. Sign the isolated Host into test subscriptions with `deepseekbot engine login claude` and `deepseekbot engine login codex`, confirm with `deepseekbot engine status`, and run `node scripts/e2e-team-security.mjs --name <instance> --scenario B4 --scenario B5`. With no test subscriptions, `--no-subscriptions` records those cases as blocked and still runs the rest of M15.
