# Disposable Memory history and safe restore

## Sub-features

- Behavior ID: `desktop.memory.read-restore`; desktop Web + live CLI, English/dark, 1440 × 1100.
- One new disposable PersonaBot, one `AX-1975.md` file, two distinct owner-saved versions.
- Read version one's historical commit diff, restore that content from version two,
  and reject an obsolete expected HEAD without changing the restored content or HEAD.
- No model, remote publication, credentials, branch switching, full Self-Record or
  checkpoint-restore UI qualification. Preserve the separate #1281/#1305 work.

## How to get to it (user POV)

Bot mode → select the newly created **AX Memory …** PersonaBot → **Memory files** toolbar button →
Memory file list → **AX-1975.md**. Version two is visible. Open the **Memory evolution** toolbar button, then
select version one's commit (its accessible listitem name is the full SHA); the historical diff shows version one.
The existing `memory-restore-commit` CLI then restores version one through the same
Memory owner. Reload, reselect that Bot and open the file: version one is visible.

A restore creates a new commit whose parent is the pre-restore HEAD; it does not rewind
HEAD to the historical commit. The owner saves a recovery checkpoint before restoring.
The CLI's subsequent stale `--expected-head` request must return `memory-conflict`;
reload the Web Client, reopen the file and confirm the restored contents remain. UI agreement alone does
not prove the Git relationship: inspect the saved graph and checkpoint reads.

## Driving it with verify-app

Use a clean committed checkout, locked dependencies, local Chromium, and a uniquely
named isolated Host from this worktree. No model credentials are required for this path.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax1975-your-task
node scripts/verify-app.mjs doctor --name ax1975-your-task
node scripts/e2e-memory-restore.mjs --name ax1975-your-task
```

The runner accepts only its own worktree's named loopback Host. It creates a fresh Bot
with public `create`, reads `memory-snapshot`, and saves both versions with
`memory-save --body-stdin --expected-head`. It never opens a product database, writes
Memory files directly, or executes Git mutations against the Memory repository.
`memory-file`, `memory-commit-diff`, `memory-graph` and `memory-checkpoints` provide
current content, historical content/diff, ancestry and recovery evidence. Restore uses
`memory-restore-commit --sha <v1> --expected-head <v2>`. The refused request selects v2
but still expects v2 after the restore; both current content and HEAD must remain unchanged.

Each immutable attempt saves four screenshots/full ARIA snapshots (before, history,
after, refused), separate lifecycle diagnostics, console errors, public CLI outputs,
source/build identity and the first failure. Inspect every image and ARIA before:

```bash
node scripts/memory-restore-report.mjs <attempt> --visual-review pass \
  --reviewer Codex --note "Inspected all four screenshots and ARIA; current and historical content agree with the same Bot's CLI reads."
node scripts/verification-report.mjs --memory-run <attempt>
```

Use `--visual-review fail` for a mismatch. Missing/changed evidence, dirty source, stale
commit or an inapplicable visual receipt becomes **needs-revalidation**. No selected
run is **not-run**; failed prerequisites are **blocked**; failed actions remain **fail**.
A successful shell/API response alone cannot pass the row. Preserve every failed attempt.

Cleanup: close the runner's browser, then stop only the PID recorded in this named
instance's private `instance.json`, verify it exited, and **retain its temporary Profile
and Memory repository**. Do not use `verify-app stop` for this slice: it deletes that
Profile. Keep the private instance metadata for inspection, without publishing its URL,
token or paths. No Memory folder deletion or remote operation is authorized by this path.

Publish a redacted immutable packet using the [sharing guide](../../../../docs/agents/verification-inventory.md),
with `--memory-evidence-prefix ./verified`. Human QA can launch another named instance,
run the same setup, open its private URL and compare the four views and CLI results.
Agent visual review is recorded separately from Human QA.

## Gotchas

- Historical reading uses the existing commit-diff view. **Open current file** is not a
  historical file reader; do not substitute it for the selected historical commit.
- Restore may produce an additional backup commit for dirty Memory. This bounded fixture
  is clean, so it requires `backup: null` and exactly one new descendant restore commit.
- Transport errors are not the expected conflict code. Preserve the before/after reads.
- Select the created Bot explicitly; dismiss onboarding before entering Memory.
  Desktop dock entries are toolbar buttons, not a Memory tab. The first failed attempt
  preserved the obsolete-tab timeout with healthy Host/Client diagnostics.
- After an unexpected drive, inspect the screenshot, ARIA, console and
  [observation guide](../references/observation.md) before retrying. Never repeat an
  unknown-outcome mutation automatically or overwrite the first failure.
