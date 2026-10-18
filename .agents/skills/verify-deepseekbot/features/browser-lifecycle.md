# Default Bot Browser lifecycle

## Sub-features

Behavior `desktop.browser.open-observe-stop`: desktop Web + live CLI, English/dark,
1440 × 1100. One new disposable PersonaBot, default Local Bot Browser target and one
loopback HTTP fixture with the title **AX Browser lifecycle 1976** and **37 blue boxes**.
No model, external site, login or anti-bot challenge is involved. Multi-tab, uploads,
profile reset/isolation, takeover/resume and alternate Computer targets remain separate gaps.

## How to get to it (user POV)

Bot mode → select the newly created **AX Browser …** Bot → close Sessions/Bot Inbox
panels to give Browser room → **Browser**.
With Browser Access off, the panel shows its access description and **Enable Browser Access**.
The existing direct open tool must refuse without starting it. Only the enabled, stopped
Browser shows the **Stopped** card; do not accept a transient card before Access loads.
Enable **Browser Access**, click **Open Bot Browser**, click **Leave fullscreen**, then use the existing direct
`browser_open` tool to navigate the same tab to the fixture. The Browser panel must show
the fixture title, URL and actual picture with its **Open fullscreen** live-frame action available and no viewer error text.
If navigation leaves a viewer error, preserve the failed run. A separate recovery may use
the existing **Reconnect** button, but cannot turn the cold-start result into pass.
Reconnect is always offered in the inline footer; its presence alone is not a connection failure. A stale error banner is not a passing visible state. `browser-observation`, `browser_tabs list`
and `browser_observe` must agree on that Bot's current tab and fixture content.

Click **Stop** in the panel. Observation must show stopped, no tabs, no focused tab and
no frame. A subsequent direct observe must report the existing no-tab refusal and leave
it stopped. Disable Browser Access, then attempt direct open again: the Access-off
refusal must remain distinct, with Access still off and no replacement target/start.
The docked Browser panel stays open when Access is disabled; inspect the permission
explanation there. Clicking the sidebar Browser button again would close the panel.

## Driving it with verify-app

Use a clean committed source, locked dependencies, local Chromium and a uniquely named
isolated Host. Run as a regular user. The default local Browser starts its own dedicated
browser profile; do not use shared, daily, borrowed or production browser sessions.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/verify-app.mjs launch --name ax1976-your-task
node scripts/verify-app.mjs doctor --name ax1976-your-task
node scripts/e2e-browser-lifecycle.mjs --name ax1976-your-task
```

The runner owns its loopback fixture server and accepts only this worktree's named
isolated Host. Setup uses public PersonaBot create; lifecycle uses the real Web panel,
CLI browser tools and existing observation/log readers. It does not add a product API,
change the configured target or invoke a model. `computer-logs --plugin browser` is the
existing shared developer-log reader, not a Computer action.

Each immutable attempt saves four Web screenshots/full ARIA snapshots (off, running,
stopped, disabled), the Host's actual Browser frame, direct tool outputs, lifecycle and
Client diagnostics, selected DM identity, source/build identity and first failure.
Inspect all five images and the ARIA, then record a hash-bound visual receipt:

```bash
node scripts/browser-lifecycle-report.mjs <attempt> --visual-review pass \
  --reviewer Codex --note "Inspected the four Web states and Browser frame against the correlated CLI reads."
node scripts/verification-report.mjs --browser-run <attempt>
```

Use `--visual-review fail` for a visible mismatch. Missing/changed evidence, dirty source
or a different commit becomes **needs-revalidation**. No selected run is **not-run**;
missing prerequisites are **blocked**; failed actions are **fail**. HTTP success and
shell readiness never qualify the Browser row alone. Preserve failed attempts.

The runner stops only its created Bot's Browser and fixture, and closes its test Web
browser even after failure. Check `cleanup-browser.json` and `cleanup-observation.json`.
Then stop only this instance's recorded Host PID and retain its temporary Profile,
Memory and evidence; do not use `verify-app stop`, which deletes the Profile.

Publish a redacted immutable packet following the [sharing guide](../../../../docs/agents/verification-inventory.md),
with `--browser-evidence-prefix ./verified`. The fixture's loopback URL is non-sensitive
correlation evidence and not a reviewer service link. Host login URL/token and local
private paths stay local. Human QA can launch another named instance and follow this
recipe; agent screenshot inspection is recorded separately from Human QA.

## Gotchas

- Cold-start regression (#2012): a running process is not yet an owned current tab.
  The local viewer URL stays absent until that tab exists; its first frame has a bounded
  wait. First-frame failure is `503 frame unavailable`, distinct from stopped/no-tab
  `404`, and stops automatic viewer retries. Use the existing Reconnect control only
  as a separate recovery action; the lifecycle runner must pass without it. Keep the
  initial HTTP/console failure even if a manual reconnect later recovers.

- The default local target is required. Missing Browser prerequisites or a launch error
  must retain diagnostics, never switch targets or silently enable Browser Access.
- Disabled Browser Access is omitted by the canonical registry (or false); true is enabled.
- Access-off and stopped/no-tab currently use `host-refused` with distinct existing
  messages. Transport failure is not an acceptable substitute for either refusal.
- Opening the Browser enters fullscreen. Leave fullscreen before inspecting the inline
  panel and clicking Stop; a DOM-visible Stop behind the overlay is not an operable control.
- On failure, save Browser authority and lifecycle logs before cleanup; collection errors
  remain separate from the original failure.
- Browser frames are canvas pixels inside the real panel viewer. ARIA names identify
  the tab but do not establish its rendered contents; inspect the screenshot and frame.
- Dismiss onboarding before selecting the created Bot. Read the actual selected DM.
- An initial exploratory `verify-app shot --bot-mode` timed out with Chinese shell labels;
  its screenshot/ARIA were retained. This runner explicitly fixes browser language to
  English before navigation. An unrelated shell timeout is not Browser behavior proof.
- After surprises inspect the [observation guide](../references/observation.md), screenshot,
  ARIA, console and lifecycle logs before retrying; do not overwrite the first failure.
