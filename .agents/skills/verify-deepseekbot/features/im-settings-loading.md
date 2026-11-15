# Saved IM settings before connection checks

## Sub-features

- External identities and conversations render saved configuration before bound-account checks settle.
- External connectors render persisted bridges and routes before status checks settle.
- Unchecked status says Checking; a failed check cannot erase saved configuration or authorize a mutation.
- Binding or advanced authorization explicitly discovers all apps; ordinary settings reads do not wait for unrelated Providers.
- Views coalesce reads within one Host/Human action scope; invalidated results cannot overwrite newer settings.

## How to get to it (user POV)

Open a Bot DM → Channel settings → External identities. Open External connectors from the same settings panel. Open Bind to discover additional apps, or advanced IM authorization to choose an app and target.

## Driving it with verify-app

1. Build and launch a task-owned isolated Host; run `doctor`. Seed a disposable Bot, a synthetic IM identity and conversation through the canonical owner using `scripts/fixtures/reception-recovery.mjs`.
2. Hold that fixture's account inspection with its `inspect-delay-ms` control. Open both settings entry points in the Web Client. Keep screenshots, ARIA snapshots and console output: saved names and policies must render while the status is Checking, then update in place when the inspection settles.
3. Read `im-status`, `messaging-grants` and `channel-bridges` with `--read-mode saved` and `--read-mode status` against that Host. Retain JSON showing pending/complete checks and the same saved identity, conversation and bridge references.
4. Open Bind and verify the full app catalog is discovered. Confirm a subsequent save still uses the canonical owner and expected revision. A stale fingerprint remains rejected; the automated owner tests hold this boundary without credentials.
5. Compare repeated baseline/candidate reads with the same bounded synthetic inspection delay. Record environment and delay explicitly; this isolates Provider-wait behavior and is not a claim about production latency.

## Gotchas

- Full app discovery intentionally remains live and may wait for Providers. It starts on explicit binding/authorization and remains available for that mounted settings scope.
- Saved mode is a projection of SQLite configuration and process-local recovery state. It is not evidence of a successful live connection and never authorizes mutations.
- The synthetic Provider proves settings and owner behavior, not real QQ delivery. Do not install production credentials or run a second production receiver.
- After a failed drive, run `verify-app observe` and keep its failure evidence before retrying.
