# AGENTS.md — BotHarness

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- [DSH docs](https://deepseek-harness.github.io/deepseek-harness/) own DSH APIs and behavior. See `/develop/basic/` for authoring and publishing, and upstream `apps/cli/reference/README.md` for the CLI.
- [Glossary](GLOSSARY.md) ([中文](GLOSSARY.zh.md)), [living architecture](docs/architecture/botharness-architecture.md), and [decisions](docs/decisions/) own product language and architecture. ADR-0035–0045 set the baseline. GitHub Issues and Projects track delivery.
- IM precedents: [dsh-im](https://github.com/xmanrui/dsh-im) for adapters, [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link) for reliability, [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge) for routing.

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:changed
pnpm build
```

Use `pnpm test:changed` for CI-selected tests against `origin/main` and `pnpm test` only for a requested full run. Use the Node and pnpm pins. For WSL and lint baseline maintenance see [development scripts](docs/agents/development-scripts.md#lint-backlog-and-toolchain).

## Conventions

- Work in a task branch and worktree. Stage explicit paths and inspect the staged diff before committing. Follow [worktree discipline](docs/agents/worktree-discipline.md).
- Keep secrets machine-local. Feishu App Secrets belong in DSH credentials. See the [credential decision](docs/decisions/im-providers.md#adr-0006).
- Keep TS/JS tests comment-free. [Source policy](docs/agents/source-policy.md) covers the lint gate.
- Use TypeScript ESM and Vitest in `packages/*/test/`. Universal invariants get a fast-check `*.property.test.ts` named for the decision. Replay failures with the printed seed and path.
- Use stable migration IDs and preserve ledger order when resolving collisions. Follow [named schema migrations](docs/agents/schema-migrations.md).
- Use Node `.mjs` for repo scripts. [Lint and toolchain](docs/agents/development-scripts.md#lint-backlog-and-toolchain) covers the shell and spawn checks.
- Record new decisions in `docs/decisions/<topic>.md` and update the [living architecture](docs/architecture/botharness-architecture.md) for changes to modules, data flow or boundaries.
- Edit docs site sources and regenerate. Follow [docs site maintenance](docs/agents/docs-site-maintenance.md) for Markdown, diagrams, OG cards and local previews.
- Follow [vendored skills](docs/agents/vendored-skills.md) before adding or syncing skills. Edit first-party skills in place and update third-party skills through their pinned upstream.
- Follow [tracer-bullet delivery](docs/agents/issue-tracker.md#tracer-bullet-delivery) for production-shaped cross-layer slices, sequencing and Human feedback.

### CLI parity (AX)

A new or changed Host bridge method, Host route or Harness Bot tool ships its `deepseekbot` CLI command in the same PR. Follow [CLI parity](docs/agents/cli-ui-coverage.md#cli-parity-contract) for the live owner, direct tool path, docs, tests and coded refusals. `pnpm lint` runs `scripts/check-cli-parity.mjs`.

### IM browser QA (AX)

For Discord and Lark message and reaction tests, use the signed-in Codex in-app browser in the authorized conversation. Follow [IM browser QA](docs/agents/im-test-apps.md#im-browser-qa-ax) for target verification, evidence, and receiver cutover.

## Pull requests

- Follow [issue trace](docs/agents/agent-work-trace.md) for claims, commit trailers and handoffs. Record every contributing harness and served model in provenance labels.
- Use the [`visual-pr` skill](.agents/skills/visual-pr/SKILL.md), record [merge risk](docs/agents/pr-merge-risk.md), and use [issue closing and stack rules](docs/agents/pr-merge-risk.md#issue-closing-and-stacked-prs). Use `Closes #N` for completed scope and `Refs #N` for partial work.
- Follow the [merge gate](docs/agents/model-tiers.md#merge-gate-by-task-tier). Leave `needs-human` PRs for the Human to merge.
- [CI plan](docs/agents/development-scripts.md#ci-test-plan). PRs default to affected tests. Add `ci:full` only for known gaps. Classify new inputs in `scripts/ci-plan.mjs`.
- For a visible UI change, follow [PR visual evidence](docs/agents/pr-ui-visual-evidence.md) and publish new review artifacts through `pnpm evidence:publish` to R2.
- For Team mode authority changes, run the [head-bound security suite](docs/agents/development-scripts.md#team-mode-security-suite).
- For nontrivial behavior, lifecycle, permissions, persistence or cross-module changes, follow [PR HTML explainers](docs/agents/pr-html-explainer.md). For architecture or data flow, use [PR Lens](docs/agents/visual-pr-pr-lens.md) when it clarifies review.
- For release notes, public docs, a release or a revert, follow [the bilingual Release Ledger and DSH Skill changelog workflow](docs/agents/changelog.md).

### Domain docs

[Glossary](GLOSSARY.md) owns product terms. Follow [domain docs](docs/agents/domain.md) when changing terminology, decisions or architecture.

## Task runbooks

- **Issue tracker and labels** — [issues](docs/agents/issue-tracker.md) and [triage roles](docs/agents/triage-labels.md).
- **Live DSH Host** — Follow [local DSH Hosts](docs/agents/dev-instance.md), [AX model setup](docs/agents/ax-model.md), and [dsh-dev](.agents/skills/dsh-dev/SKILL.md) for isolation, reloads and credential reuse. Verify a real DM reply before declaring a model key missing.
- **DSH/Cordis plans and implementation** — Start with [`dsh-plugin-dev`](.agents/skills/dsh-plugin-dev/SKILL.md), its Context and Decision Tree. Use DSH terms for platform seams and the product glossary for BotHarness concepts. Verify the chosen API against upstream and a running Host. Record diagnosed traps in [`dsh-dev`](.agents/skills/dsh-dev/SKILL.md).
- **DSH upgrade or compatibility qualification** — Follow [the DSH upgrade workflow](docs/agents/dsh-upgrade.md) for the admission floor, runtime and platform matrix, and release handoff.
- **Running behavior and PR captures** — Use [`verify-deepseekbot`](.agents/skills/verify-deepseekbot/SKILL.md). Update affected feature-map journeys and run them. Use `verify-app observe` for failed or surprising drives.
- **Host, watcher, browser or tunnel lifecycle** — Follow [verification resource cleanup](docs/agents/ax-resource-cleanup.md) at launch and handoff.
- **Lifecycle diagnostics** — See [developer diagnostics](docs/agents/development-scripts.md#developer-diagnostics) for bounded structured logs.
- **WSL provider egress** — Follow [the restricted relay runbook](docs/agents/ax-wsl-network.md).
- **VPS, SSH or phone tunnel** — Follow [VPS over Tailscale](docs/agents/vps-tailscale.md) and [phone QA tunnels](docs/agents/phone-qa-tunnel.md).
- **Native builds, QA Hosts and devices** — Reserve [shared device QA](docs/agents/device-qa.md), use [machine-local build credentials](docs/agents/device-secrets.md), and retain [QA evidence](docs/agents/qa-evidence.md).
- **New features, dependencies and hot paths** — Assess impact and follow [performance observation and regression guards](docs/agents/ax-performance.md). Record a reasoned exemption for docs-only changes.
- **Web, desktop or mobile UI** — Follow [UI design](docs/agents/ui-design.md) ([中文](docs/agents/ui-design.zh.md)), [UI state subscriptions](docs/agents/ui-state.md), [component names and motion](docs/agents/ui-design.md#component-names-and-motion) and [UI copy](docs/agents/ui-copy.md). Use [`dsh-ui`](.agents/skills/dsh-ui/SKILL.md) for in-harness work and [the mobile guide](apps/mobile/AGENTS.md) for Expo.
- **Presentations** — Follow [presentation commands and generated outputs](docs/agents/development-scripts.md#presentation-workspace).
- **SEO research, tracking or publishing preparation** — Follow [the SEO AX adapter](docs/agents/seo-ax.md).

## Guardrails

[Rule registry](scripts/guardrails.json) records each check and its fix.

<!-- guardrail-table:start -->

| Rule                        | Enforced by                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `floating-promise`          | [lint-ratchet.mjs](scripts/lint-ratchet.mjs)                     |
| `bug-patterns`              | [lint-ratchet.mjs](scripts/lint-ratchet.mjs)                     |
| `spawn-options`             | [lint-ratchet.mjs](scripts/lint-ratchet.mjs)                     |
| `no-api-intercept`          | [lint-ratchet.mjs](scripts/lint-ratchet.mjs)                     |
| `package-no-console`        | [lint-ratchet.mjs](scripts/lint-ratchet.mjs)                     |
| `pr-provenance`             | [check-pr-provenance.mjs](scripts/check-pr-provenance.mjs)       |
| `pr-needs-human`            | [check-needs-human.mjs](scripts/check-needs-human.mjs)           |
| `source-policy`             | [check-source-policy.mjs](scripts/check-source-policy.mjs)       |
| `tobs-design-tokens`        | [check-design-tokens.mjs](scripts/check-design-tokens.mjs)       |
| `tobs-style-literals`       | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-breakpoint-tokens`    | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-motion-tokens`        | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-icon-source`          | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-control-names`        | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-focus-disabled`       | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-component-catalogue`  | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-settings-composition` | [check-ui-rules.mjs](scripts/check-ui-rules.mjs)                 |
| `tobs-token-outputs`        | [generate-tokens.mjs](scripts/generate-tokens.mjs)               |
| `regression-proof`          | [check-regression-proof.mjs](scripts/check-regression-proof.mjs) |
| `pr-body`                   | [check-pr-body.mjs](scripts/check-pr-body.mjs)                   |
| `file-length`               | [health.mjs](scripts/health.mjs)                                 |
| `tsc-exclude`               | [health.mjs](scripts/health.mjs)                                 |
| `agent-prose`               | [health.mjs](scripts/health.mjs)                                 |
| `feature-sources`           | [check-feature-map.mjs](scripts/check-feature-map.mjs)           |
| `ai-review`                 | [.coderabbit.yaml](.coderabbit.yaml)                             |
| `ui-monkey`                 | [health.yml](.github/workflows/health.yml)                       |
| `perf-trend`                | [health-trend.mjs](scripts/health-trend.mjs)                     |
| `host-readers`              | [check-host-readers.mjs](scripts/check-host-readers.mjs)         |

<!-- guardrail-table:end -->
