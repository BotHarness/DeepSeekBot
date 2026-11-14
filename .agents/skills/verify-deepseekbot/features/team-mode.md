# Team mode: members sign in and share public channels

## Sub-features

- S1: Owner turns on Team mode in Bot settings › Team; with no Owner password the switch first asks for one ("Save and turn on"). The Owner can allow plain HTTP only through a warned confirmation.
- S2: Owner adds a member (name + username); the one-time password is shown once with a Copy button and is never shown again. A group's settings show a "Public channel" switch to the Owner.
- S3: A member opens `/botharness-device/team/` over Host-known HTTPS in another browser, signs in, and must replace the one-time password before anything else (the dialog cannot be dismissed; the Host refuses other calls with `password-change-required`).
- S4: A member sees only Tobs: the page enters Bot mode with no exit to the native shell; Bot settings lists Profile, General, Appearance, Notifications, Keyboard shortcuts and Team; the New menu offers channel, channel section and Browse channels. DSH-native calls are refused (`remote-access/denied`). Team › Account offers Sign out, which ends only that grant.
- S5: Browse channels lists public channels with member counts; Join adds the member and opens the channel. Owner and member messages show each other's names; each sees only their own messages as their own bubbles.
- S6: Refusals: wrong password, rate limit, non-loopback plain HTTP (`insecure-transport`, also with a forged `x-forwarded-proto: https`) unless the Owner allowed it, a private group opened by ID, Team mode off (all members disconnect, Owner keeps working).

## How to get to it (user POV)

Owner: Bot settings › Team. Member: open the address under Team › Sign-in › Address in a browser on another machine, sign in, choose a new password, then New (+) › Browse channels.

## Driving it with verify-app

No model is needed. Launch an isolated Host and run `doctor`. Seed with the CLI (secrets only through stdin and private files):

```bash
printf '%s\n' "$OWNER_PASSWORD" | deepseekbot team-mode owner-password --password-stdin
deepseekbot team-mode on
deepseekbot members create --username bob --display-name Bob --initial-password-file .tmp/bob.pw
deepseekbot channels set-public <group-id> on
deepseekbot --as bob channels browse-public
```

For the member browser, relaunch the Host's web server on a LAN address with a task-only certificate (DSH `webserver` patch `host`, `tls.certFile`, `tls.keyFile`) and drive two isolated browser contexts: the Owner through the launcher URL, the member through `/botharness-device/team/`. `shot` logs in with the Owner token, so drive the member context directly. Capture the Owner's Team section, the one-time password dialog, the member sign-in page, the forced password dialog, the member's Tobs view and Browse channels.

Canonical state: `deepseekbot members list` shows Bob without `mustChangePassword`; the group's `humanMembers` lists Bob; Bob's message author carries his Human ID and display name and its Source Event row carries `human_id`. Also check the plain-HTTP LAN page shows the insecure notice with a disabled form.

## Gotchas

- Password sign-in from anywhere other than loopback needs HTTPS or the encrypted device gateway; a plain `http://<lan-ip>` page shows the insecure notice and a disabled form.
- The first-run "Switch views" tutorial covers the sidebar in a fresh Host; click `Skip` first.
- Member and Owner must use separate browser contexts: one browser holds one identity per Host.
- M1 returns an empty member Bot roster; private Bots and per-member Activity arrive in M2. Legacy Human authors without a Human ID denote the Owner.
- Packaged consumers may bundle another copy of DSH's Connection class: test capabilities at the boundary, since `instanceof` does not establish the live service's API.
