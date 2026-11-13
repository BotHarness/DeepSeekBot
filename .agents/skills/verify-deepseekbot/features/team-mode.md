# Team mode: members sign in and share public channels

## Sub-features

- S1: Owner turns on Team mode in Bot settings › Team; with no Owner password the switch first asks for one ("Save and turn on").
- S2: Owner adds a member (name + username); the one-time password is shown once with a Copy button and is never shown again.
- S3: A member opens the sign-in address in another browser, signs in, and must replace the one-time password before anything else (the dialog cannot be dismissed).
- S4: A member sees only the Tobs Client: Bot settings lists Profile, General, Appearance, Notifications, Keyboard shortcuts and Team; the New menu offers only channel, channel section and Browse channels. DSH-native calls are refused by the Host (`remote-access/denied`).
- S5: Browse channels lists public channels with member counts; Join adds the member and opens the channel. Owner and member messages show each other's names.
- S6: Refusals: wrong password, rate limit, plain HTTP from a non-loopback address (`insecure-transport`) unless the Owner allowed it, Team mode off.

## How to get to it (user POV)

Owner: Bot settings › Team. Member: open the address shown under Team › Sign-in › Address in a browser on another machine, sign in, choose a new password, then New (+) › Browse channels.

## Driving it with verify-app

No model is needed. Owner side:

```bash
node scripts/verify-app.mjs shot team-owner --name <n> --bot-mode --click "Skip" \
  --click "Bot settings" --click "Team"
node scripts/verify-app.mjs rpc botharness/channelCreate '{"name":"General","members":[]}' --name <n>
deepseekbot channels set-public group-general on
deepseekbot members create --username bob --display-name Bob --initial-password-file .tmp/bob.pw
```

Member side: sign in at the member address with a second headless browser profile (the `shot` login uses the Owner token, so drive the member page directly), change the password, open New › Browse channels and Join. Canonical state: `deepseekbot members list` shows Bob without `mustChangePassword`; the channel's `humanMembers` lists Bob; the member's message row carries Bob's Human ID.

CLI parity: every step above has a `deepseekbot` command; `--as bob` evaluates a command through Bob's Peer (`deepseekbot --as bob sessions list` must be refused).

## Gotchas

- Password sign-in from anywhere other than loopback needs HTTPS or the encrypted device gateway; a plain `http://<lan-ip>` page shows the insecure notice and a disabled form.
- The first-run "Switch views" tutorial covers the sidebar in a fresh Host; click `Skip` first.
- Member and Owner must use separate browser profiles: one browser holds one identity per Host.
