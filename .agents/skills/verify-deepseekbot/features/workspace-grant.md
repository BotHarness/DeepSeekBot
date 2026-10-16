# Temporary Workspace Grant: authorize, read and revoke

## Sub-features

- Behavior ID: `desktop.grants.temporary-read-revoke`.
- Desktop Web Client, English/dark, 1440 × 1100, plus live CLI; no model required.
- Web authorization of one dedicated temporary directory for one new PersonaBot, then
  the same Bot's direct `channel_attachment_import` read while that Grant is active.
  CLI revocation requires `--confirm`; the same direct read must then be refused.
- This qualifies the existing attachment-import read (which copies a selected regular
  file into an independent Attachment), not native `read`, Shell, Assignment execution,
  every Workspace safety boundary, or deletion of already imported copies.

## How to get to it (user POV)

Bot mode → the test PersonaBot DM → **Workspace Grants · <Bot name> · 0 workspaces**
under the composer → **Advanced: enter Host path** → enter the dedicated fixture path →
**Authorize workspace** → inspect the Bot/path confirmation → **Authorize workspace**.
The folder appears in the Workspace Grants dialog. Select the test Bot explicitly and
dismiss **Skip tutorial** if onboarding appears before opening the dialog. Wait for its
folder content and opening animation before capturing it. Keep Memory Repository collapsed.

Read the owning Host's `grants` list and use the same Bot ID with the existing
`channel_attachment_import` tool. Revoke the exact Grant with the CLI's explicit
confirmation, reload the Web Client, reopen Workspace Grants, and verify the folder
is absent. UI disappearance alone is insufficient: the repeated direct tool call must
fail with `tool-failed` and `outside current authorized directories`.

## Driving it with verify-app

Prerequisites: clean committed checkout, pinned dependencies, local Chromium/Puppeteer,
Node/pnpm as in AGENTS and an isolated task-owned Host. Follow the existing
[verification skill](../SKILL.md). Never target another task's Profile.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax1974-your-task
node scripts/verify-app.mjs doctor --name ax1974-your-task
node scripts/e2e-workspace-grant.mjs --name ax1974-your-task
```

The runner creates its own temporary Workspace containing only `README.md`. It checks
that this is outside the Host Profile and is neither the Host data directory nor an
ancestor of it, the repository or the Human home. It never accepts an arbitrary fixture
path. File preparation is ordinary test setup; authorization uses the existing Web
form and Host Workspace/Grant owners. No product database is opened by the runner.

Before authorization, `grants <bot>` is empty and the direct read is refused. After Web
authorization, `grants` identifies the exact Bot, Workspace and active Grant;
`bot-tool <bot> channel_attachment_import --args-stdin` with
`{"file_path":"<temporary-workspace>/README.md"}` returns a new file reference with the
sample's name and byte count. No message is sent. A call to
`grant-revoke <bot> --grant <grant>` without `--confirm` must return the CLI usage exit code `2` and leave the Grant
active. `grant-revoke <bot> --grant <grant> --confirm` then marks that same Grant
revoked. The original record remains in the authoritative history; it disappears from
the active set. Repeating the exact file-read tool call must fail on current authority.

Each attempt preserves before/granted/after screenshots and full ARIA, CLI JSON,
Host build identity, first failure, diagnostics, console errors and direct-tool trace.
Read all three images and ARIA before recording visual inspection:

```bash
node scripts/workspace-grant-report.mjs <attempt> --visual-review pass \
  --reviewer Codex --note "Inspected before/granted/after screenshots and ARIA; the same test folder appears only while authorized."
node scripts/verification-report.mjs --workspace-run <attempt>
node scripts/verify-app.mjs stop --name ax1974-your-task
```

Use `--visual-review fail` for a visible mismatch. Receipts are immutable and bound to
all six visual files and the source commit. Missing/changed evidence, dirty source or
a different commit becomes **needs-revalidation**; absent evidence is **not-run**,
unavailable preconditions **blocked**, and failed actions **fail**. A successful API
or shell observation never qualifies this row. Preserve failed attempts before retrying;
never blindly repeat creation after an unknown outcome.

The runner removes only its own unchanged temporary sample directory. Unexpected file
changes are retained and reported as failure. Stop the exact named Host after collection
to delete its disposable Profile and independent imported attachment, retaining evidence.
If interrupted, stop that task Host and inspect the private fixture metadata before
removing its own sample directory. Never clean another Profile or arbitrary path.

Use the [report sharing guide](../../../../docs/agents/verification-inventory.md): keep
the whole packet external/ignored during generation, publish redacted immutable evidence,
and use `--workspace-evidence-prefix ./verified` for shared Workspace proof links.
Human QA: open the private launcher URL, repeat the same dedicated-folder actions,
and compare visible state, authoritative IDs and the explicit refusal. Record Human
feedback separately; agent screenshot inspection is not Human QA.

## Gotchas

- [#1841](https://github.com/BotHarness/DeepSeekBot/issues/1841) remains open: broad Grants
  may expose the operational database. Never grant the Host data directory or its ancestors.
  This narrow fixture does not resolve or qualify that boundary.
- [#1957](https://github.com/BotHarness/DeepSeekBot/issues/1957) remains open: Bot scratch
  files can clutter granted roots/home. This test creates one named temporary sample,
  runs no model or Shell, and does not claim scratch policy is fixed.
- `channel_attachment_import` is an existing direct Bot tool that checks current active
  Grants on each file-read chunk. Native DSH `read` is not a tool in `bot-tools`; do not
  add a testing API or substitute full-access execution to make this test pass.
- DSH may retain the directory in its collapsed registered-folder picker after revocation.
  Inspect rendered active Grant rows, not hidden DOM text in that picker.
- The CLI list retains a revoked record; checking list length zero would be wrong.
  A transport failure or unavailable tool is not the expected authorization refusal.
- After a failed or surprising drive, inspect the saved console, ARIA, screenshot and
  [observation guide](../references/observation.md). Keep partial evidence and the first failure.
  Private launcher URLs, credentials and real user paths must never enter shared evidence.
