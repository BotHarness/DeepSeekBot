# Team mode M1

## Sub-features

- Owner password setup, Team mode enable/disable, member creation and warned plain-HTTP exception.
- Member sign-in, mandatory initial-password change and grant-local sign-out.
- Member index and stream dispatch through a member Peer; default denial of native business methods.
- Public group browse, explicit join and Human-authored messages with identity.
- Local CLI parity with private password files and `--as` member evaluation.

## How to get to it (user POV)

As Owner, open Settings → Team mode, set an Owner password, enable Team mode and create Bob. In a separate clean browser context, open `/botharness-device/team/` over Host-known HTTPS, sign in and change the initial password. Browse public Channels, join one and exchange messages with the Owner. Confirm both viewers show the speaking Human's name. Sign out and confirm only that grant ends. Disable Team mode and confirm all members disconnect while the Owner keeps working.

## Driving it with verify-app

Launch an isolated Host and run doctor. Seed Owner password, Team mode, Bob and a public group through the documented CLI. Use stdin and private files for secrets. Keep Owner and member browser contexts separate. Save console output and the member index's access baseline; confirm calls and streams use the member transport.

Before changing the initial password, `teamMode` works and other operations refuse `password-change-required`. Afterwards, member `session/list` refuses `remote-access/denied`; public browse and joined-Channel reads/sends work. Another private group remains inaccessible by ID. Non-loopback plain HTTP refuses sign-in despite `x-forwarded-proto: https`; the warned Owner exception permits it. Qualify real TLS separately.

Check canonical membership, message author Human ID/display name and Source Event Human ID. Run the CLI with `--as bob`, including suspended and mode-off refusals. Run the focused `team-mode.test.ts` and `cli-team.test.ts` suites. Stop the recorded Host and verify its watcher and port have exited.

## Gotchas

M1 returns an empty member Bot roster and defers private Bots and per-member Activity to M2. Clients must read `author.humanId` and `author.displayName`; legacy Human authors denote the Owner. Initial Client calls outside the allowlist require a UI change. Keep failed shell/asset loads and run `verify-app observe` before retrying. Packaged consumers may bundle another copy of DSH's Connection class: test required capabilities at the boundary, since `instanceof` does not establish the live service's API.
