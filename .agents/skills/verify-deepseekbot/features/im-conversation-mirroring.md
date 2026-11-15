# IM conversation mirroring

## Sub-features

- Message reception is distinct from app connection and Bot activity. Temporary startup failure shows reconnecting, its reason and next retry time; permanent failure needs attention. Reconnect now uses the existing binding without changing conversation permissions.
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


## Reception ownership regression (#3261)

A default DM or addressed group mention must retain its Inbox Admission when optional Channel
sync stops. New direct intake records grant-backed reception, independently of Bridge evidence.
Read historical no-path Sources without backfilling routes; deleting a route must not create a
fallback receiver. The automated historical fixture also preserves the two-stage top-20 and
pending/retryable digest distinctions.

Use an isolated Host with `scripts/fixtures/messaging-readiness.mjs` as a controlled Provider;
its local command file accepts prepare, ordinary, query and mention actions for a QA Bot.
Send one ordinary message (no run), then a second (one digest), inspect the Inbox and native Bot
trace through the CLI, and send a mention to verify an actual model reply. This qualifies the
Host/Provider/Runtime seam, not production IM delivery. Preserve the report and stop the owned
Host after verification.

## Startup recovery regression (#4242)

Use `scripts/fixtures/reception-recovery.mjs` in a task-local Profile, never a production receiver.
Its command file accepts `bind` and `mention` for a Bot named `Reception QA…`; the `offline`
file delays receiver acquisition while the app remains connected. Bind while ready, admit
one fresh group mention, then restart the same isolated Profile with readiness delayed beyond
the previous three-attempt budget. Keep the real settings mounted: app connection and message
reception must remain distinct, with retry reason and next retry time. Once ready, the view
updates to Receiving without a reload. `im-status` and `messaging-grants` must show the same
canonical recovery state and clear it on success. Exercise Reconnect now (pending and failure
are covered by component tests), disable/resume, permanent fingerprint refusal and Provider
replacement. Keep Source/Admission/Outbox proof for one fresh post-recovery event, with no
history replay. This proves the local Provider seam, not real QQ delivery. Stop the owned Host.
