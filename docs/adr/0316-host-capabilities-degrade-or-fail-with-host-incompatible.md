---
Status: Proposed
Date: 2026-11-10
Issues: [#3898](https://github.com/BotHarness/DeepSeekBot/issues/3898)
---

# Host capabilities degrade, or fail with HOST_INCOMPATIBLE

Amends [ADR-0087](0087-dsh-compatibility-is-a-semver-range-with-a-verified-floor.md): admission stays open (`>=0.2.0-0`), so a Host Tobs has never run on can load it.

## Context

DSH `0.2.2-rc.1` removed `tools.presentAs()`. Published Tobs 1.6.1 called it on every Orchestrator and Assignment setup, so every Bot turn on that Host failed with `agentCtx.tools.presentAs is not a function` ([#3536](https://github.com/BotHarness/DeepSeekBot/issues/3536)). The call only chose how tools are shown to the model: a local shim that skipped it let Bots work again. #3489 added an adapter for the new executor API, but two things stayed the same:

- The adapter knew two shapes. A third Host shape would fail the same way.
- Nothing ran Tobs on a new DSH release until a Human or user tried it.

## Decision

1. **Read the Host through the compatibility module.** `packages/core/src/runtime/native-agent-compat.ts` probes each Host capability by shape (`current`, `legacy` or `missing`). Source outside it may not add a new `ctx … as unknown as` cast; `scripts/check-host-casts.mjs` runs in `pnpm lint` against a baseline that only shrinks.
2. **Optional capabilities degrade.** Tool presentation and model-selection installation are optional. When the capability is missing, or calling it throws a `TypeError` (its shape changed), the turn continues without it and the Host writes `botharness.host_capability.degraded capability=… dsh=…` to the diagnostic log with the original error.
3. **Required capabilities fail clearly.** When a Bot cannot run without the capability (direct tool execution, the native tool executor), the turn fails with `HOST_INCOMPATIBLE: This Tobs version does not support DSH <version>: <capability> is unavailable. Update Tobs, then retry. Original error: …`. The failure notice shows a short message and the next step, and keeps the original error under the error details.
4. **Refusals stay refusals.** Any error that is not a shape mismatch (authorization, cancellation, model-route refusal) propagates unchanged and is never retried through another API generation.
5. **A canary runs Tobs on each new DSH release.** `.github/workflows/dsh-canary.yml` checks the npm `next` dist-tag every day and, only when it names a version that has not passed yet, runs `scripts/dsh-canary.mjs`: it starts the Tobs Bundle on that DSH, creates a Bot, sends a DM and requires the Orchestrator turn to reach the model. Without a model key the turn stops at `MISSING_CREDENTIAL`, which proves setup passed. Any degraded capability also fails the canary, so a soft fallback in production is still a red signal for us.

## Considered options

- **An upper admission bound** — rejected again (see ADR-0087's 2026-10-24 correction): it blocks Hosts that work and does not prevent breakage inside the range.
- **Catch every setup error** — rejected: it would hide refusals and our own bugs as success.
- **Patch DSH upstream** — not available to this project.
- **A live-model canary every day** — rejected for cost; the model-free turn covers the setup path that broke. A live run stays available through `workflow_dispatch` with an AX model configured.

## Consequences

- A changed optional Host API costs a feature, not the whole Bot, and leaves a diagnostic row naming the capability and DSH version.
- A changed required Host API tells the user what to do instead of `is not a function`.
- The canary turns red the day a breaking DSH release is published, before users upgrade.
- Classifying a capability as optional is a product decision; new Host calls are added to the compatibility module with that classification and a test.
