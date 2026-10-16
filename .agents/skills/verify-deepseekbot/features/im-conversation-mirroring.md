# IM conversation mirroring

## Sub-features

- Two independent preferences on the exact Binding and external DM: mirror the IM conversation locally; forward newly sent local DM messages to that IM. Both default off.
- Clickable, keyboard-accessible info buttons explain each direction. Changes take effect when the connector form is saved.
- Inbound mirror placement shares its Source Event with the Inbox. Accepted replies retain their Outbox lineage; purge removes associated content.

## How to get to it (user POV)

Bot mode → the Bot's chat menu → Channel settings → External connectors → the paired owner's connector. WeChat is the first qualified platform. Receiving into Inbox alone remains the default.

## Driving it with verify-app

Preconditions: an isolated Host passes `doctor`, with a qualified WeChat identity and an enabled paired-owner connector. A task-local simulated Provider can prove UI and Host settings; label its evidence explicitly. It cannot prove real WeChat delivery.

1. Open the connector form with accessible names from the current ARIA snapshot. Capture both switches off before changing them.
2. Click each adjacent info button. Close it with Escape, activate the focused button with Enter, and capture its visible help. Repeat in light/dark themes; help must not change a switch.
3. Enable one direction, save, reopen, and verify the other is still off. Read `deepseekbot channel-bridges dm-<slug>` against the same Host. Repeat for the other direction and for both off. The CLI `channel-bridge ... --input-stdin` uses the returned Grant and route revisions.
4. With an authorized real test destination, send one uniquely marked IM message after opt-in. Verify one local DM row, the original Source Event ID and one Inbox admission. Verify the accepted Bot response appears once. A local Human DM forwards only when the independent forwarding switch is on.
5. Verify disabling, two-account isolation, restart recovery and original-content purge. Correlate actual external delivery with canonical Source Event/Admission/Outbox state; keep real-provider acceptance separate from browser evidence.

## Gotchas

- For Chinese `--locale zh`, use `--click 'Bot 模式'` instead of `--bot-mode`, whose current selector is English.
- Each `shot` opens a fresh browser; repeat the complete settings navigation. Use the actual connector row name from the last ARIA file.
- Off/on starts a new opt-in period; it does not backfill history. Turning off does not recall already sent IM messages or erase existing local history. Content purge is a separate operation.
- Keep Profile credentials and login URLs out of published evidence. Simulated QA is not real WeChat or Human QA.
