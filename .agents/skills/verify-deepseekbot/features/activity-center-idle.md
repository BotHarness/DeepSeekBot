# Desktop Activity Center: one idle PersonaBot

## Sub-features

- Behavior ID: `desktop.activity-center.idle-personabot`.
- Platform: desktop Web Client (1440 × 1100, English, dark) plus the existing live CLI.
- Scope: create one isolated PersonaBot, open Activity Center from desktop Bot mode,
  choose **Show idle Bots**, and confirm its **Idle** card against `bot-activity`,
  `bot-attention` and `activity-overview` for the same PersonaBot ID.
- Normal no activity means the card says **Idle**, with no sessions or actions, and
  the CLI reports idle activity and an empty attention page. No pending work is seeded.
  An empty page, unavailable Host, missing Client observation or another Bot's card
  cannot satisfy this behavior. This does not verify the full Inbox, model execution,
  native devices or IM.

## How to get to it (user POV)

Enter **Bot mode** from the native sidebar. Open the **Activity Center** pinned card
(its accessible name can include an unread count), then **Show idle Bots** in Overview.
Close Sessions and Bot Inbox panels if needed to give Activity Center room.
Find the `AX idle <timestamp>` PersonaBot. Its name and **Idle** label must be visible;
its existing `data-bot-id` must match the ID returned by the public create command and
both authoritative CLI readers. Global unread messages are separate from pending Bot work.

## Driving it with verify-app

Prerequisites: installed pinned dependencies, a clean committed source checkout, Node/pnpm
as in AGENTS, local Chromium/Puppeteer, and a disposable isolated Host owned by this
worktree. No model credential, model reply, device, IM login or production receiver is needed.
The runner refuses another worktree/profile and checks `release-info` against the built
source revision. A successful `doctor` is only a preparation check.

From the repository root, use a unique name for this task:

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax1972-your-task
node scripts/verify-app.mjs doctor --name ax1972-your-task
node scripts/e2e-activity-idle.mjs --name ax1972-your-task
```

The journey reads the private launcher internally. It supplies the token to the existing
`deepseekbot` CLI through the environment, never command arguments. It creates a Bot using
`create --name ... --persona ...`; it does not send messages, invoke a model, open the
profile database or add a test API. Each run creates a new Bot and distinct evidence folder;
never retry an unknown create outcome without first inspecting the Host.

The printed directory contains `run.json`, the independent `coverage.md` row, screenshot,
full ARIA, visible-card fields, creation identity, before/after CLI reads, Host/Client
observations and console errors. The run records base/head, dirty state, time, environment,
expected/actual results, actions and SHA-256 evidence digests. Read the image and ARIA yourself.

Recompute the row against the current checkout before presenting it:

```bash
node scripts/activity-idle-report.mjs
node scripts/activity-idle-report.mjs <printed-attempt-directory>
node scripts/activity-idle-report.mjs <printed-attempt-directory> --json
```

After inspecting both the image and ARIA, record a visual review (this is not Human QA):

```bash
node scripts/activity-idle-report.mjs <printed-attempt-directory> --visual-review pass --reviewer Codex --note "Inspected screenshot and ARIA: named Bot is Idle with no sessions or actions."
```

Use `--visual-review fail` with the observed mismatch instead when the image disagrees.
The receipt is bound to this commit and both evidence digests and cannot overwrite an earlier
review. A failed review requires a new run after correcting the cause; it is never relabeled.
The automated journey exits nonzero while visual inspection is pending. Regenerate `coverage.md`
from the report command after review, and publish the receipt alongside the original `run.json`.

No selected run is **not-run**. Completed matching Web/CLI proof with an inspected screenshot/ARIA receipt is **pass**; a user-path or
observation failure is **fail**; unavailable setup is **blocked**. Missing/changed required
evidence, an incomplete record, dirty source or a different commit is **needs-revalidation**.
`--commit <full-sha>` inspects a historical record explicitly; it does not qualify current HEAD.
A newer pass never overwrites an earlier failure. Preserve all attempt directories in a review
packet, including failed/blocked attempts and their partial evidence.

For Human QA, run the same commands in a local clean checkout. Open the launcher's local
login URL privately, enter Bot mode → Activity Center → Show idle Bots, and inspect the
named Bot from `run.json`. Review the generated row and evidence names. Record feedback
on behavior and format on [#1972](https://github.com/BotHarness/DeepSeekBot/issues/1972);
Human QA stays **not-run** until actual feedback is recorded and corrections handled.

Cleanup after collecting evidence:

```bash
node scripts/verify-app.mjs stop --name ax1972-your-task
```

Stop removes this disposable Profile (including its test Bots), retains the attempt evidence,
and leaves other sessions alone. Before publishing, inspect/redact the entire packet; never
publish `instance.json`, login URLs, credentials or raw private profile/Host files. Use pinned
GitHub evidence links in the review; local paths alone do not deliver shared evidence.

## Gotchas

- Run `node scripts/verify-app.mjs observe --name ax1972-your-task` while a failed page is
  still open; use [the observation guide](../references/observation.md). The journey captures
  diagnostics before closing its page, even on failure. `shell-ready` alone never creates a pass.
- A missing Host before setup is blocked; a lost Host after the journey starts is failed.
  Missing Client observation is failed even when the Host answers HTTP successfully.
  An incomplete or absent screenshot/ARIA cannot keep a passing result.
- Full-page screenshot capture can resize/remount this view and reset Show idle Bots. This journey captures the fixed viewport and rechecks the card after capture; a changed view fails.
- The drawer may contain other panels. The script scrolls the named Bot card into view;
  it does not infer Activity Center state from sidebar readiness or unrelated loading regions.
- On macOS the runner uses the existing sidebar journey's CDP language override so English
  accessible names are deterministic. Selector failures retain their original evidence.
- This is one sample row, not a repository-wide coverage denominator or script classification.
  Use `node scripts/check-feature-map.mjs` for the current discovery inventory; mapping rate
  is neither feature verification nor code coverage. Follow-up scope remains #1973–#1978.
