# AGENTS.md — BotHarness

Project-specific guidance for AI coding agents.

## What this is

BotHarness — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin layer that gives agents a persistent identity: **PersonaBots** with a persona and file-based memory that spans sessions, chats, and workspaces. **DeepSeekBot** is its first app (sidebar roster, delegation, IM adapters).

- DSH official docs (source of truth when DSH behavior/APIs are in question): <https://deepseek-harness.github.io/deepseek-harness/> — plugin authoring, packaging and install under `/develop/basic/` (`/publish` documents `dsh plugin`, bundle/profile manifests and layer order); CLI behavior reference upstream at `apps/cli/reference/README.md`.
- Product language: `CONTEXT.md` (English) and `CONTEXT.zh.md` (Chinese); integrated target architecture: `docs/architecture/botharness-architecture.md`; durable choices and rationale: `docs/adr/`. The old platform spec and app PRD are archived working drafts, not parallel authorities.
- IM adapter base: [dsh-im](https://github.com/xmanrui/dsh-im) (multi-bot + settings UI). Reliability patterns from [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link); group/thread routing from [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge).
- Current architecture baseline: ADR-0035–0045 and the living architecture; delivery status and sequencing live in GitHub Issues and Projects.

## Commands

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

Toolchain: pnpm 12.4.2 · Node ≥22 (`.node-version` = v24.21.0) · TypeScript 7 · oxlint · oxfmt · vitest · tsdown.
In WSL, use the fnm node and `corepack pnpm` — Windows pnpm cannot create symlinks on WSL paths.
Local DSH development uses the worktree's pinned `0.2.1-rc.2` CLI through `node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port <n> [--worktree <path>] [--build]`; the launcher links the local Bundle, verifies the authenticated `/api`, and rejects a mismatched CLI. Run `pnpm dev:client` for automatic Client builds; append `?botharness-dev-reload=1` in the Web tab for a full-page refresh when the RC publishes a rebuilt Client event. Host changes use `pnpm build`, stop the launcher's exact PID, then restart the same isolated Profile. Details: `docs/client-bridge.md` §7. Agents boot an isolated, verified instance with the helper; it injects a shared machine-local `DEEPSEEK_API_KEY` when available (env > `~/.config/botharness/dev.env` > Keychain `botharness-deepseek`) and prints the local login URL. DSH may also use that profile's `$DSH_HOME/.credentials.yaml`; `node scripts/dev-secret.mjs check` reports only the shared injection source. Verify model usability with a real DM reply before declaring a key missing. Secrets stay machine-local and never enter the repo.
For all future AX-launched isolated profiles to use the same DeepSeek key without re-entry, run `node scripts/dev-secret.mjs adopt-profile --home <existing-DSH_HOME>` once. This copies only the DeepSeek reference into a private machine-local file (0600); it never copies the full profile credential store or commits a secret. See `docs/client-bridge.md` §7. Direct `dsh web` launches outside the AX helper still need an inherited environment key or their own profile credential.

AX default model setup and credential reuse: follow `docs/agents/ax-model.md` for the machine-local `opencode-go` opt-in, local hidden-input setup, per-launch credential override and real DM verification. `dev-instance.mjs` applies the selected native model only to its own launched Host.

## Conventions

- TypeScript ESM; tests live in `packages/*/test/` (vitest).
- Never commit secrets: the Feishu App Secret goes to the DSH credentials service, never to config or the repo (ADR-0006).
- Memory terminology lives in `CONTEXT.md`; durable memory choices live in ADR-0002/0003/0004/0012/0014/0021 and are integrated into the living architecture.
- Record durable architecture choices as ADRs under `docs/adr/`, then integrate their current result into the living architecture instead of leaving decisions in chat or a mutable PRD.
- Living architecture doc: `docs/architecture/botharness-architecture.md` (inline mermaid) — update it when modules, data flow, or boundaries change; it syncs to the docs site (`apps/docs`, botharness.ai) via `scripts/sync-docs.mjs`.
- Docs site: Nimbus in `apps/docs` — content is generated from repo sources by `scripts/sync-docs.mjs` (never edit generated files); sections are `/docs` (user guides), `/dsh` (stable DSH/Cordis Context + Decision Tree, generated from `dsh-plugin-dev`) and `/dev` (BotHarness Design / verified Guides / code-generated Reference / ADR). Design is normative target state; Reference is current implementation fact. English is primary at the root; maintained Chinese counterparts live under `/zh/**`. Every docs page exposes a clean `.md` sibling; the legacy `/index.md` form remains compatible. The landing page uses **coss ui** (`src/components/coss/`, brand tokens in `design/tokens.css`); docs pages use Nimbus UI.
- Diagrams: edit `docs/architecture/diagrams/*.mmd`, run `pnpm diagrams`, and commit the rendered light/dark SVGs (`rendered/*.svg`); the architecture page embeds those committed SVGs via the `<Diagram>` component, while the runtime mermaid loader remains for ad-hoc `mermaid` fences in hand-authored content.
- OG cards: `apps/docs/src/pages/og/**` renders at build time with CanvasKit; Chinese titles use the committed Noto Sans SC subset. After editing Chinese page copy, run `pnpm og:font` (needs network) to regenerate `apps/docs/public/fonts/NotoSansSC-Bold.og-subset.otf`.
- Installed agent skills are third-party files under `.agents/skills/` — do not reformat them (locked by hash in `skills-lock.json`). First-party skills live in the same tree and are ours to edit — `dsh-plugin-dev` (stable DSH/Cordis Context and Decision Tree), `dsh-dev`, `dsh-ui`, `verify-deepseekbot` and `ios-hig` (all symlinked into `.claude/skills/`, not in the lock file).
- Local docs dev: `pnpm dev` (portless from `apps/docs` → https://docs.botharness.localhost; no-sudo variant `PORTLESS_PORT=8788 PORTLESS_HTTPS=0`) or `pnpm docs:dev` (http://localhost:4321); `syncDocs()` runs at Astro config load, so plain `astro dev`/`astro build` also works.
- Mobile app: Expo workspace in `apps/mobile`; its mobile-only rules and the Expo, EAS and React Native skills to load live in its own `AGENTS.md`.
- Presentations: open-slide workspace in `apps/presentations` (one deck per `slides/<id>/`, authoring rules in its own `AGENTS.md`); iterate with `pnpm slides:dev`, embed into the docs site at `/slides/` with `pnpm slides:build` (`scripts/sync-slides.mjs`, output `apps/docs/public/slides/` is generated — never edit or commit it). `pnpm docs:build` rebuilds the embed automatically.

### Developer diagnostics (AX)

Agent-facing debugging is a first-class concern. A plugin that owns long-running or external resources (containers, adapters, schedulers, external commands) records structured, bounded developer logs for its lifecycle transitions — initiator, phase, duration, external command summary, refusal reason — on a log surface that both Humans and agents can read, instead of ad-hoc `console` output. Messages stay stable and machine-parseable, never contain secrets, and remain process evidence rather than a second durable authority. The long-term tracing plan lives in [#160](https://github.com/BotHarness/BotHarness/issues/160); `CLAUDE.md` inherits this section because it delegates to `AGENTS.md`.

WSL egress fallback: if a task-local DSH Host cannot reach a provider while Windows can, follow [the AX restricted-relay runbook](docs/agents/ax-wsl-network.md) for standing authorization, isolation, live-model proof, and lifecycle.

### CLI parity (AX)

Every feature must be operable and testable by an agent through the `deepseekbot` CLI, without the Web UI and without the model. A change that adds or changes a Host bridge method, a Host `/api/...` route, or a Harness Bot tool ships the matching CLI command in the same PR:

- Online against a live Host, one JSON document on stdout, secrets only from stdin or files and never printed, the same Host owner and checks as the UI, coded refusals instead of fallbacks. Dangerous changes keep their explicit confirmation flag.
- Bot tools also need a direct path that runs the same tool code without the model (as `browser-tool` / `computer-tool` do), so a failure can be placed in the model, the Harness or the runtime; `bot-trace` shows what the Bot itself called.
- Tests for the command, an entry in `docs/bot-cli.md` and `docs/bot-cli.zh.md`, and a real run against a live Host.

`pnpm lint` runs `scripts/check-cli-parity.mjs`: a new bridge method, route or Bot tool without a CLI command fails unless `scripts/cli-parity-baseline.json` records an issue or an exemption reason for it. The baseline only shrinks — covering an entry means deleting it, and the check fails while a covered entry remains. Remaining gaps are tracked in [#1690](https://github.com/BotHarness/DeepSeekBot/issues/1690).

### IM browser QA (AX)

For Discord and Lark message/reaction tests, prefer their signed-in web clients in the **Codex in-app browser**. Discover the current tabs and verify the account and designated test conversation each run; login state is session-local. Reuse the existing login in place, with the Human completing login when it expires.

Within the Human-authorized destination and test cases, the agent can compose and send uniquely marked messages, inspect the actual replies/reactions, and capture cropped evidence in the browser. Correlate that visible result with canonical Source Event, Admission and Outbox facts; a successful API call alone does not verify rendering. Ask the Human to send manually only when browser interaction is unavailable or blocked.

Keep credentials and login tokens machine-local and crop unrelated conversations from published evidence. App permission changes and exclusive production-receiver windows still require their specific authorization; prepare cutoff/restore guards before cutover and verify normal replies after restoration.

### VPS over Tailscale (AX)

The dev VPS lives on the Human's Tailscale tailnet. Per-machine values (SSH host/user) belong in the gitignored `vps.local.env` at repo root (copy `vps.local.example.env`); never commit tailnet IPs, key material, fingerprints, or tokens. Any dev machine on the tailnet (MacBook, Windows, WSL) uses the same file shape.

- Onboard a dev machine key: Human opens the cloud console into the box, runs `whoami; hostname` to confirm identity, appends the machine's ed25519 `.pub` to `~/.ssh/authorized_keys` (700/600, expect `KEY_OK`), and the agent verifies with its own `ssh <user>@<host> whoami` from that machine.
- VPS baseline: git ≥ 2.28, `gh` (Ubuntu: official github-cli apt repo), pinned Node, Docker as needed. Authenticate `gh` with a repo-scoped fine-grained PAT of the machine account, then `gh auth setup-git`. Notes from the field: `gh auth login --with-token` demands a `read:org` scope the narrow PAT lacks — hand-write `~/.config/gh/hosts.yml` (`oauth_token` + `git_protocol: https`, 0600) instead; and GitHub's git HTTPS endpoints require `Basic base64(x-access-token:<pat>)` while `Bearer` only talks to the REST API.
- Memory pushes use the machine account plus private repos (one-time PATs are revoked right after the run); per-bot author identity is repo-local `git config user.name/user.email`, settable from a Bot DM with approval, no SSH involved.
- Hands off other sessions' stacks (e.g. `/opt/botharness/bot-seo`): observe, never restart, rebuild, or reconfigure without that session's owner.
- Phone QA without tailnet: keep DSH loopback-bound and publish it with a Cloudflare quick tunnel; see [the phone QA runbook](docs/agents/phone-qa-tunnel.md) for trusted-host, token rotation, and stale-shell handling.

### Shared device QA (AX)

Native checks for `apps/mobile` share devices and QA Hosts among coding agents. Before booting an emulator/Simulator, building the app, starting a Host or touching a phone, follow [shared device QA](docs/agents/device-qa.md): choose the Mac/iOS or Windows/Android queue, submit to its owner-cut batch, use the dedicated QA Host, and report redacted results. Windows emulator and USB-phone checks use the shared `android-qa.ps1` lease and scrcpy capture workflow.

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
For every PR, follow [merge-risk classification](docs/agents/pr-merge-risk.md) and summarize reversibility, blast radius, and review focus in one `Special things to note` bullet.
For every PR that changes visible UI or user interactions, embed GitHub-rendered before/after screenshots in the PR `Change outline` and verify they render; follow [UI/UX PR visual evidence](docs/agents/pr-ui-visual-evidence.md) for capture, exceptions and the required `<img src=".../raw/<sha>/...">` reference format.

Pull requests run only the tests their diff can reach; see [CI test plan](docs/agents/development-scripts.md#ci-test-plan) for the rules and `node scripts/ci-plan.mjs --base origin/main` to preview them. Add the `ci:full` label to force a full run on a risky change. When a PR adds a kind of file or test input that the plan misses, update `RULES` in `scripts/ci-plan.mjs` in the same PR; `pnpm lint` fails until it does.

For every PR, assess whether a detailed explanation would help review; follow [PR HTML explainers](docs/agents/pr-html-explainer.md). Use the repository's `answer-me-with-html` skill for nontrivial behavior, lifecycle, permission, persistence, or cross-module changes; simple edits may omit it. Keep `visual-pr` as the PR description authority, bind explainers to the exact head SHA, and do not treat local HTML as reviewer-accessible or as runtime evidence.

For PRs that change architecture or data flow across modules, read [the optional PR Lens supplement](docs/agents/visual-pr-pr-lens.md) and use a diagram when it clarifies the review. HTML explains the details; PR Lens provides focused architecture/data-flow views. Neither replaces required GitHub-rendered UI evidence or the Human-QA gate.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/` (extended lazily by the domain skills). Root `CONTEXT.md` is the sole authority for BotHarness product terms such as PersonaBot, Channel, Source Event, Bot Inbox, Orchestrator Session, and Assignment Session; product runtime relationships live under `docs/architecture/`. See `docs/agents/domain.md`.

### UI guidelines

Building or changing in-harness UI follows the `dsh-ui` skill: DSH tokens (central alias table, no inline hex), `ui-primitives`, the native inset contract, and the measure-the-shell workflow (ADR-0028). For net-new UI, the skill's `references/design-references.md` names the external precedents (coss.com/ui, Beautiful UI, shadcn/ui, Lucide) — patterns to adapt rather than dependencies, except vendored Lucide glyphs (ADR-0032).

### Verify behavior

Before claiming a feature or fix works, reproducing a bug in the running app, or capturing PR screenshots, follow the `verify-deepseekbot` skill: it launches an isolated Host, drives the Web Client by accessible name, and keeps screenshots, ARIA snapshots and console output as evidence. Its feature map names each mapped feature's user path and the observable result that proves it; update the map in the same change when the app moves. `node scripts/check-feature-map.mjs` (in lint) checks map references; run the touched journey to verify behavior. For a failed or surprising drive, use `verify-app observe` and the skill’s observation guide before retrying.

### DSH development

Developing, running, or debugging against a local DSH instance follows the `dsh-dev` skill: dev-loop/profile operations, the `/api` transport contract (api-gateway owns the single interceptor — never `connection.rpc.intercept('/api')`), and the headless debugging playbook. Diagnosed DSH traps must be recorded there in the same change (pitfall log).

For every DSH/Cordis plan, PRD, ADR, or implementation, enter through `dsh-plugin-dev`: read its Context, then its Decision Tree. Use its canonical leading words—Plugin/Fiber/Bundle/Profile/Patch; Service Definition/Provider/Consumer/Capability seam; Registry/Registration/Agent Scope/Service Isolation; Cordis Event dispatch; Agent/AgentHandle/Subagent/Agent Inbox; SessionEvent/`session/event`/Projection/Session Persistence/Session Query; Execution World/Sandbox/Shell/Subprocess/Job/PTY/Schedule/Spill/Storage Domain; Slots/Typert/API Gateway/Conversation Assembly—and label downstream concepts as application-defined. The skill deliberately does not cache version-specific Host/Client/Slots APIs or community patterns; after choosing a seam, verify its concrete mechanism against the current official DSH docs/source and running Host. Do not put BotHarness product vocabulary or architecture into the DSH skill or `/dsh/**`; a design that crosses both layers reads root `CONTEXT.md` for product nouns and the DSH Context for platform nouns.
