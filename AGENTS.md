# AGENTS.md — BotHarness

Project-specific guidance for AI coding agents.

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- DSH official docs (source of truth when DSH behavior/APIs are in question): <https://deepseek-harness.github.io/deepseek-harness/> — plugin authoring, packaging and install under `/develop/basic/` (`/publish` documents `dsh plugin`, bundle/profile manifests and layer order); CLI behavior reference upstream at `apps/cli/reference/README.md`.
- Product language: `GLOSSARY.md` (English) and `GLOSSARY.zh.md` (Chinese); integrated target architecture: `docs/architecture/botharness-architecture.md`; durable choices and rationale: `docs/adr/`. The old platform spec and app PRD are archived working drafts, not parallel authorities.
- IM adapter base: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current architecture baseline: ADR-0035–0045 and the living architecture; delivery status and sequencing live in GitHub Issues and Projects.

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:changed
pnpm build
```

`pnpm test:changed` runs the tests CI selects for your diff against `origin/main` (`scripts/ci-plan.mjs`); it falls back to the full suite only when CI would. Run `pnpm test` only when asked for a full run.

Lint rules with an existing backlog run through `scripts/lint-ratchet.mjs` (type-aware oxlint, registered in `scripts/guardrails.json`): new findings fail at edit (Claude Code hook), commit and CI; fixing old ones means running `pnpm lint:baseline`, which only lowers `scripts/lint-baseline.json`. A rule added to the registry seeds its backlog once with `node scripts/lint-ratchet.mjs --seed=<rule>`; repo-specific rules live in `scripts/lint-rules/botharness.mjs`.

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.
Local DSH development boots an isolated, verified Host with `node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port <n>`. Before launching or restarting a Host, reloading the Client, or reusing the shared DeepSeek key, follow [local DSH Hosts](docs/agents/dev-instance.md) and the `dsh-dev` skill. Verify model usability with a real DM reply before declaring a key missing; secrets stay machine-local.

AX default model setup and credential reuse: follow `docs/agents/ax-model.md` for the machine-local `opencode-go` opt-in, local hidden-input setup, per-launch credential override and real DM verification. `dev-instance.mjs` applies the selected native model only to its own launched Host.

## Conventions

- TypeScript ESM; tests live in `packages/*/test/` (vitest). A rule that must hold for every input (an ADR invariant, a parser, a fold) gets a fast-check `*.property.test.ts` named after its ADR; a failure prints the seed and path to replay it with `fc.assert(..., { seed, path })`.
- Database migrations: append a stable kebab-case id, never a generation; keep both entries in merge order when branches conflict. Follow [named schema migrations](docs/agents/schema-migrations.md) for ledger validation, body-hash protection and fixtures.
- Repo scripts are Node `.mjs` run as `node scripts/<name>.mjs` — no new `.ps1`/`.cmd`/`.bat` files. Spawn child processes with direct `argv` (`shell: false`; resolve `.cmd` shims through `scripts/dev-package-manager.mjs`) and `windowsHide: true` on every spawn so no conhost window flashes on Windows; keep CLI action/flag names, exit codes and JSON shapes stable when porting a helper.
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (ADR-0006).
- Memory terminology lives in `GLOSSARY.md`; durable memory choices live in ADR-0002/0003/0004/0012/0014/0021 and are integrated into the living architecture.
- Record durable architecture choices as ADRs under `docs/adr/`, then integrate their current result into the living architecture instead of leaving decisions in chat or a mutable PRD.
- Living architecture doc: `docs/architecture/botharness-architecture.md` (inline mermaid) — update it when modules, data flow, or boundaries change; it syncs to the docs site (`apps/docs`, botharness.ai) via `scripts/sync-docs.mjs`.
- Docs site (`apps/docs`, Nimbus): content is generated from repo sources by `scripts/sync-docs.mjs`, so edit the sources, never generated files. Before editing docs pages, diagrams, OG cards or running the docs dev server, follow [docs site maintenance](docs/agents/docs-site-maintenance.md).
- Third-party skills under `.agents/skills/` stay unedited and are locked by hash in `skills-lock.json`; first-party skills in the same tree (`dsh-plugin-dev`, `dsh-dev`, `dsh-ui`, `verify-deepseekbot`, `ios-hig`, `android-material`, `promo-pv`) are ours to edit. Before adding, syncing or renaming a skill, follow [vendored skills](docs/agents/vendored-skills.md). `visual-pr` stays the PR description authority.
- Mobile app: Expo workspace in `apps/mobile`; its mobile-only rules and the Expo, EAS and React Native skills to load live in its own `AGENTS.md`.
- Presentations: open-slide workspace in `apps/presentations` (one deck per `slides/<id>/`, authoring rules in its own `AGENTS.md`); iterate with `pnpm slides:dev`, embed into the docs site at `/slides/` with `pnpm slides:build` (`scripts/sync-slides.mjs`, output `apps/docs/public/slides/` is generated — never edit or commit it). `pnpm docs:build` rebuilds the embed automatically.

### Developer diagnostics (AX)

Agent-facing debugging is a first-class concern. A plugin that owns long-running or external resources (containers, adapters, schedulers, external commands) records structured, bounded developer logs for its lifecycle transitions — initiator, phase, duration, external command summary, refusal reason — on a log surface that both Humans and agents can read, instead of ad-hoc `console` output. Messages stay stable and machine-parseable, never contain secrets, and remain process evidence rather than a second durable authority. The long-term tracing plan lives in [#160](https://github.com/BotHarness/BotHarness/issues/160); `CLAUDE.md` inherits this section because it delegates to `AGENTS.md`.

WSL egress fallback: if a task-local DSH Host cannot reach a provider while Windows can, follow [the AX restricted-relay runbook](docs/agents/ax-wsl-network.md) for standing authorization, isolation, live-model proof, and lifecycle.

### Verification resource cleanup (AX)

Before launching a task-owned Host, watcher, preview, browser driver or tunnel, and before finishing or handing off that task, follow [verification resource cleanup](docs/agents/ax-resource-cleanup.md). Record ownership at launch; finish by verifying owned processes have exited and ports are released, or record an explicit retained-environment handoff. Preserve source changes and evidence, stop processes before removing their Profile/worktree, and retain shared E2E/QA resources under their queue owner's control.

### CLI parity (AX)

Every feature must be operable and testable by an agent through the `deepseekbot` CLI, without the Web UI and without the model. A change that adds or changes a Host bridge method, a Host `/api/...` route, or a Harness Bot tool ships the matching CLI command in the same PR:

- Online against a live Host, one JSON document on stdout, secrets only from stdin or files and never printed, the same Host owner and checks as the UI, coded refusals instead of fallbacks. Dangerous changes keep their explicit confirmation flag.
- Bot tools also need a direct path that runs the same tool code without the model (as `browser-tool` / `computer-tool` do), so a failure can be placed in the model, the Harness or the runtime; `bot-trace` shows what the Bot itself called.
- Tests for the command, an entry in `docs/bot-cli.md` and `docs/bot-cli.zh.md`, and a real run against a live Host.

`pnpm lint` runs `scripts/check-cli-parity.mjs`: a new bridge method, route or Bot tool without a CLI command fails unless `scripts/cli-parity-baseline.json` records an issue or an exemption reason for it. The baseline only shrinks — covering an entry means deleting it, and the check fails while a covered entry remains. Remaining gaps are tracked in [#1690](https://github.com/BotHarness/DeepSeekBot/issues/1690).

### Performance observation and verification (AX)

Every new feature and dependency carries a performance-impact assessment and a regression guard on its hot path, Host/CLI work included; a docs-only change records a no-runtime-impact exemption. Budgets only tighten; raising one needs the Human's approval. Before profiling, an A/B comparison, or a timeline or rendering change, follow [performance observation and verification](docs/agents/ax-performance.md).

When adding or changing a client refresh of Host-owned state, follow [live Host state](docs/agents/live-host-state.md) for Host push, reconnect snapshots, and slow fallback. The lint check flags fast timers for review.

Before changing how the Bot Inbox is rendered for the Orchestrator (`inbox-render.ts`), run the [Bot Inbox rendering eval](docs/agents/inbox-eval.md) against a same-day baseline and record the verdict in its ledger.

### IM browser QA (AX)

For Discord and Lark message/reaction tests, prefer their signed-in web clients in the **Codex in-app browser**. Discover the current tabs and verify the account and designated test conversation each run; login state is session-local. Reuse the existing login in place, with the Human completing login when it expires.

Within the Human-authorized destination and test cases, the agent can compose and send uniquely marked messages, inspect the actual replies/reactions, and capture cropped evidence in the browser. Correlate that visible result with canonical Source Event, Admission and Outbox facts; a successful API call alone does not verify rendering. Ask the Human to send manually only when browser interaction is unavailable or blocked.

Keep credentials and login tokens machine-local and crop unrelated conversations from published evidence. App permission changes and exclusive production-receiver windows still require their specific authorization; prepare cutoff/restore guards before cutover and verify normal replies after restoration.

### VPS over Tailscale (AX)

Before onboarding a machine to the dev VPS, setting up `gh` or git there, or touching another session's stack on it, follow [VPS over Tailscale](docs/agents/vps-tailscale.md). Per-machine values live in the gitignored `vps.local.env`; tailnet IPs, keys and tokens never enter git.

### Shared device QA (AX)

Native checks for `apps/mobile` share devices and QA Hosts among coding agents. Before booting an emulator/Simulator, building the app, starting a Host or touching a phone, follow [shared device QA](docs/agents/device-qa.md): choose the Mac/iOS or Windows/Android queue, submit to its owner-cut batch, use the dedicated QA Host, and report redacted results. Windows emulator and USB-phone checks use the shared `android-qa.mjs` lease and scrcpy capture workflow.

### QA evidence (AX)

Before capturing development screenshots or recordings, handing off macOS/iOS or Windows/Android QA, or retaining release images, follow [local QA evidence and release archives](docs/agents/qa-evidence.md). Keep an indexed task folder in the machine's main checkout and preserve accepted evidence by release and SHA; platform queues still own devices and capture tooling.

### Machine-local secrets (AX)

Files that device QA and store builds need but git must never hold (Firebase `google-services.json`, FCM and Play keys) live in the gitignored `.secrets/` folder of each machine's main checkout; every worktree resolves to the same folder. Read [machine-local secrets](docs/agents/device-secrets.md) for the file list, how the app finds them, local push builds and clean-clone EAS builds.

### SEO research and tracking (AX)

Before SEO research, blog planning, channel adaptation, or ranking tracking, read [the SEO AX adapter](docs/agents/seo-ax.md). It routes agents to the canonical bot-seo shared-VPS workflow; do not substitute a machine-local OpenSEO instance or treat multi-agent capacity as publishing permission.

## Delivery workflow — tracer bullets

For a feature that crosses layers, deliver a sequence of **tracer bullets**: the smallest production-shaped end-to-end slice that reaches the owning Host module, durable authority, adapter/RPC, Client surface, and a Human-testable runtime path. Validate that slice before expanding the next one. This follows the [tracer-bullet practice](https://www.aihero.dev/tracer-bullets): build one narrow vertical path, test it immediately, get feedback, then extend it.

- Start from one observable user behavior, not a complete horizontal layer. Implement only the contracts and data needed to exercise that behavior through the real architecture.
- Keep authority boundaries real in the first slice. A demo path still uses the owning deep module, canonical persistence, trusted adapter context, and existing Host↔Client seam; it does not introduce a temporary second store or lifecycle.
- Include the smallest useful Host behavior and Client interaction together whenever the feature has both. A backend-only foundation or disconnected UI mock is preparatory work, not a completed tracer bullet.
- End each slice with focused automated coverage plus a runnable verification path. For in-harness UI, provide a state the Human can open, operate, and judge; capture evidence when the issue or PR requires it.
- Seek Human feedback after the first working slice before broadening sibling views, providers, variants, policies, or edge cases.
- Order issues and sub-issues by runnable vertical slices. Open research or grilling only when an unresolved decision blocks the next slice; defer speculative branches that would only create more unvalidated tickets.
- A slice is complete when one coherent behavior works end-to-end through production seams and its regression is observable automatically. Then start the next slice with a fresh, narrow scope.
- Never work in the main checkout: one task, one worktree and branch, following [worktree discipline](docs/agents/worktree-discipline.md).

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `BotHarness/BotHarness` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

For issue-backed coding work or a PR, follow [the coding-agent issue trace](docs/agents/agent-work-trace.md): check existing claims, record this task's claim before implementation, carry its reference into commits and the PR, then record completion or handoff.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Release Ledger

DeepSeekBot release notes use the bilingual canonical Release Ledger in `CHANGELOG.md` and `CHANGELOG.zh.md`. For a user-visible change, public documentation change, release PR, revert, or prerelease, follow `docs/agents/changelog.md`: a feature PR adds a bilingual change fragment under `changes/` instead of editing either ledger, and runs `pnpm changelog:check`.

For a DSH Skill behavior or public-documentation change, release PR, revert, or prerelease, follow
`docs/agents/changelog.md`, update `.agents/skills/dsh-plugin-dev/CHANGELOG.md` and
`CHANGELOG.zh.md`, and run `pnpm skill:changelog:check`. This release train uses independent Skill
SemVer; every published Skill release separately records the DSH version and upstream revision it
verified.

### Pull requests

When creating or updating a PR, use the `visual-pr` skill to write the description: one-sentence "why", `/show-me`-style change outline, saved under `.humanlayer/tasks/` and applied with `gh pr edit --body-file`.
When a PR delivers an issue's feature or fixes its bug, write `Closes #N` as plain text in the PR body (not inside a Markdown link, which GitHub does not act on) so the issue closes on merge. Do not keep the issue open for a release or for pending device/Human QA; track remaining QA in its own issue. Use `Refs #N` only when part of the issue's scope is still unbuilt. GitHub acts on `Closes #N` only when the PR merges into `main`: once a stacked PR's parent has merged into `main`, retarget the stacked PR to `main` before merging it, or close the issue by hand once its work reaches `main`.
For every PR, follow [merge-risk classification](docs/agents/pr-merge-risk.md) and summarize reversibility, blast radius, and review focus in one `Special things to note` bullet.
Before merging an agent's PR, follow the [merge gate](docs/agents/model-tiers.md#merge-gate-by-task-tier).
For every PR that changes visible UI or user interactions, embed before/after screenshots in the PR `Change outline` and verify they render, following [UI/UX PR visual evidence](docs/agents/pr-ui-visual-evidence.md). **All new PR screenshots, recordings and other review artifacts go to Cloudflare R2 through `pnpm evidence:publish`, never Git, Git LFS or a Git evidence branch;** the guide covers privacy review, URL length, readback and cleanup.

Pull requests run only the tests their diff can reach; see [CI test plan](docs/agents/development-scripts.md#ci-test-plan) for the rules and `node scripts/ci-plan.mjs --base origin/main` to preview them. Add the `ci:full` label to force a full run on a risky change. When a PR adds a kind of file or test input that the plan misses, update `RULES` in `scripts/ci-plan.mjs` in the same PR; `pnpm lint` fails until it does.

Every PR that changes who can read, write, run or reach something in Team mode (roles, Role Policy, Bot visibility, Channel access, folders and grants, member execution confinement, devices, offboarding, model allowlists) runs the Team mode security suite on its head commit and attaches the result: `node scripts/e2e-team-security.mjs --launch` (real model, isolated Host). Publish `report.md` and the transcripts with `pnpm evidence:publish`, never Git. A failing scenario blocks the merge unless the PR names it as a known gap with a tracking issue.

For a nontrivial behavior, lifecycle, permission, persistence or cross-module PR, add an explainer bound to the head SHA with the `answer-me-with-html` skill ([PR HTML explainers](docs/agents/pr-html-explainer.md)); for an architecture or data-flow change, add a [PR Lens](docs/agents/visual-pr-pr-lens.md) diagram when it clarifies review. Neither replaces `visual-pr` as the description, the required UI evidence or the Human-QA gate.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/` (extended lazily by the domain skills). Root `GLOSSARY.md` is the sole authority for BotHarness product terms such as PersonaBot, Channel, Source Event, Bot Inbox, Orchestrator Session, and Assignment Session; product runtime relationships live under `docs/architecture/`. See `docs/agents/domain.md`.

### UI guidelines

Every new or changed Web, desktop or mobile interface follows [UI design](docs/agents/ui-design.md) ([中文](docs/agents/ui-design.zh.md)): its product principles (common actions within easy reach, background colour over borders, layout and icons instead of long text with explanations behind an info button, the shortest natural path, guiding empty states and steppers, links to docs or copyable prompts) and its design rules. Apply its review gate alongside the platform-specific rules.

Every component that reads the desktop Client store follows [UI state subscriptions](docs/agents/ui-state.md) ([中文](docs/agents/ui-state.zh.md)): select only the fields it reads, typed `Pick<ClientState, ...>` with a field-level comparison (the zustand selector pattern), select sub-fields of large slices, and never subscribe to or pass down the whole state. `pnpm lint` rejects whole-store subscriptions, and the render benchmarks assert that unrelated writes cause no commits.

**Name the component.** When discussing, planning, reviewing or implementing UI (issues, PRs, commits, code comments, chat), name the concrete component by its platform term from `GLOSSARY.md` → Native UI components: the Material 3 name on Android, the HIG name on iOS, and the API name (Compose, SwiftUI, UIKit, `@expo/ui`) when you mean code. Say "Android `ModalBottomSheet`" or "iOS pull-down button", not "popup", "弹窗", "drawer", "dropdown" or "the bottom thing". When a change covers both platforms, name both sides of the pair (Android `ModalBottomSheet` ↔ iOS form sheet). If a job has no counterpart, say so and name the custom surface recorded in `apps/mobile/DESIGN.md`. A component missing from the table is added to `GLOSSARY.md` and `GLOSSARY.zh.md` in the same change.

For in-harness UI, use the [`dsh-ui` skill](.agents/skills/dsh-ui/SKILL.md) for Tobs components and tokens, DSH Slot integration and measured shell geometry. The [Desktop/Web UI decisions](docs/decisions/desktop-ui.md#adr-0348) link the token, style theme and Base UI overlay contracts.

### Motion

Animation is part of the product's feel. Any new or changed animation on web, desktop or mobile follows Emil Kowalski's skills (third-party, locked in `skills-lock.json`): `animate` to build web motion, `animate-expo` for React Native and Expo, `review-animations` before you ship it, `improve-animations` to audit existing motion, `animation-performance` for dropped frames, and `emil-design-eng` / `animation-vocabulary` for the shared rules and words. They decide whether something animates, which properties and its reduced-motion behavior. On mobile the platform decides the curve: iOS uses SwiftUI's springs and Android uses Material 3 Expressive springs, through the `spring` roles in `apps/mobile/src/ui/design/motion.ts` (ADR-0264). Extend the repo's motion tokens instead of adding parallel curves.

### UI copy

Visible text on web, desktop and mobile follows [UI copy](docs/agents/ui-copy.md): call a PersonaBot "Bot" in the UI, and keep hints, captions and errors short and plain in both English and Chinese. `PersonaBot` stays the term in code and developer docs.

### Verify behavior

Before claiming a feature or fix works, reproducing a bug in the running app, or capturing PR screenshots, follow the `verify-deepseekbot` skill: it launches an isolated Host, drives the Web Client by accessible name, and keeps screenshots, ARIA snapshots and console output as evidence. Its feature map names each mapped feature's user path and the observable result that proves it; update the map in the same change when the app moves. `node scripts/check-feature-map.mjs` (in lint) checks map references; run the touched journey to verify behavior. For a failed or surprising drive, use `verify-app observe` and the skill’s observation guide before retrying.

### DSH development

For a new DSH RC, SDK/CLI baseline change, or compatibility qualification, follow [the recurring DSH upgrade workflow](docs/agents/dsh-upgrade.md): preserve the 0.2.0 admission floor, qualify minimum/previous/new runtimes and Windows/macOS separately, then reuse the existing Tobs release and Site synchronization gates. Routine tracking excludes Alpha releases.

Developing, running, or debugging against a local DSH instance follows the `dsh-dev` skill: dev-loop/profile operations, the `/api` transport contract (api-gateway owns the single interceptor — never `connection.rpc.intercept('/api')`), and the headless debugging playbook. Diagnosed DSH traps must be recorded there in the same change (pitfall log).

For every DSH/Cordis plan, PRD, ADR, or implementation, enter through `dsh-plugin-dev`: read its Context, then its Decision Tree, and use its canonical leading words. After choosing a seam, verify its concrete mechanism against the current official DSH docs/source and the running Host. BotHarness product vocabulary and architecture stay out of the DSH skill and `/dsh/**`; a design that crosses both layers reads root `GLOSSARY.md` for product nouns and the DSH Context for platform nouns.
