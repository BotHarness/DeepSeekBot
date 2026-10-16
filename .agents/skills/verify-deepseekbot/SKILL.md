---
name: verify-deepseekbot
description: Prove DeepSeekBot behavior in a real isolated DSH Host the way a user does, and keep the evidence. Use before claiming a feature or fix works, to reproduce a reported bug, or to capture PR screenshots; its feature map says how to reach and drive each mapped feature and what observable result proves it.
---

# Verify DeepSeekBot

Unit tests never boot DSH. A claim that a feature works needs a run against a real Host, driven through the user path, with saved evidence. `scripts/verify-app.mjs` is the lever for that run; `node scripts/verify-app.mjs --help` lists its flags.

Each run uses one named instance (`--name <n>`, default `default`). Its state and evidence live in `.humanlayer/verify/<n>/` (ignored by Git). Give each task its own name so two agents never drive the same Host.

## Launch

```bash
pnpm build
node scripts/verify-app.mjs launch --name <n>
```

`launch` wraps `scripts/dev-instance.mjs` with a fresh `DSH_HOME` under the OS temp dir and a free port, then records the launcher JSON in `.humanlayer/verify/<n>/instance.json`. It refuses to start a second Host for a running name. Ready means `health.ok` is `true` in its output.

The `model` field says which model credential the Host inherited. Without one (`missing (model calls will fail)`), every UI and API path works, but no Bot replies. Features that need a reply say so in their file. Credential setup is in `docs/agents/ax-model.md`. In a cloud container whose proxy injects the `opencode.ai` credential, `OPENCODE_GO_API_KEY=proxy-injected node scripts/dev-model.mjs setup --from-env` once is enough.

## Doctor

```bash
node scripts/verify-app.mjs doctor --name <n>
```

It checks that the recorded PID is alive, the Host runs from this worktree with the pinned DSH version, and an authenticated `/api` call succeeds. It exits non-zero when any check fails. Run it before the first drive and again after any drive that fails or surprises you. On failure, collect the observation below before stopping this task’s Host; preserve the failure evidence before relaunching.

## Observe

```bash
node scripts/verify-app.mjs observe --name <n>
```

Run after a failed or surprising drive, with the page still open. It saves Host health and
browser-reported Client diagnostics as timestamped JSON. Exit 0 means the shell was observed;
1 means failure; 2 means incomplete observation. Feature verification still needs the user
action, visible result and canonical read. Follow [the observation guide](references/observation.md)
to inspect Bot activity, tool traces and runtime logs without asking the Human to copy them.

## Drive

Drive through the Web Client with `shot`. Each call opens a fresh headless browser, logs in with the launcher URL, dismisses the preview notice, the API key prompt and the tutorial (`--keep-overlays` keeps them), runs the actions in order, then captures:

```bash
node scripts/verify-app.mjs shot <label> --name <n> --bot-mode \
  --fill "Message DeepSeek Bot=What is 6 times 7? Answer with digits only." \
  --press Enter --wait-text 42
```

- Address elements by accessible name (`--click`, `--fill`, `--wait`). Read names from the last `<label>.aria.txt`. When a name carries dynamic text, such as a Channel row with its last message, use `--click-text` with a stable part.
- `--right-click <name>` opens an element's context menu, such as a Channel row's menu in the Messages sidebar; follow it with `--click` on a menu row.
- `--wait-text` matches rendered text only, not the composer value. Pick a reply that the prompt does not contain.
- Use `rpc <namespace/method> [json]` to read canonical state (Channel timelines, Bot lists) after a UI action, or to seed preconditions through the same public API the Client calls. It is evidence of state, never a substitute for the UI step it follows.
- For scripted journeys, use the feature file’s launch contract. Some accept `BH_E2E_INSTANCE=.humanlayer/verify/<n>/instance.json`, the model suite accepts `--name <n>`, and others own their Host; check before running so the journey targets this task’s instance.

## Native mobile

The Web Client drives above do not cover the Expo app in `apps/mobile`. Before starting a
Simulator, Metro, a native build or a QA Host, follow [shared device QA](../../../docs/agents/device-qa.md).
Submit the feature's steps to the queue; only its designated runner drives the shared devices.
The runner uses `scripts/e2e-mobile-sim.mjs` and the Maestro flows in `apps/mobile/.maestro/`
([phone-notifications.md](features/phone-notifications.md)). Read every captured screenshot.
Web-export checks qualify their named web paths; native-only behavior remains untested until
its device result is recorded.

## Evidence

`shot` writes `<label>.png`, `<label>.aria.txt` and `<label>.console.txt` to `.humanlayer/verify/<n>/evidence/`, and `<label>.failure.png` plus `<label>.failure.aria.txt` when a step fails. Its JSON output lists every step it performed.

A proof has three parts: the user action, the visible result, and the canonical state behind it (a timeline entry, a persisted Bot, a Git Memory HEAD). A successful API call alone does not prove rendering, and a screenshot alone does not prove persistence. Read the console file: a page error during the journey is a finding even when the screenshot looks right. PR screenshots follow `docs/agents/pr-ui-visual-evidence.md`.

## Cleanup

```bash
node scripts/verify-app.mjs stop --name <n>
```

It stops only the recorded PID, deletes that instance's temporary `DSH_HOME` and leaves the evidence directory in place. Confirm the evidence files still exist after `stop`.

## Feature map

[`features/README.md`](features/README.md) indexes the mapped features. Before you verify a change, read the file for each feature the change touches and drive every entry point it lists. When the app no longer matches a file, fix the file in the same change, or report the product regression. A journey that cannot pass keeps its failure and records the reason in `Gotchas`.

When changing a user entry point, add or update its feature file and index row in the same PR.
Name every changed sub-feature and its visible/canonical proof. Run
`node scripts/check-feature-map.mjs` (also in lint): it checks index coverage, required sections,
local links and script paths, and inventories unmapped journeys. It cannot prove that selectors,
product semantics or runtime behavior are current. Re-run the touched journey and record its
commit/environment/result in the PR; keep unrun branches explicitly untested.
