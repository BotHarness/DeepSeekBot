# Environment implementation handoff

The Human approved implementation of [spec #4108](https://github.com/BotHarness/DeepSeekBot/issues/4108) through [execution hub #4109](https://github.com/BotHarness/DeepSeekBot/issues/4109). First read the latest issues, claims, PRs, repository guidance and source; this handoff is a starting point, not proof that a dependency has merged.

## Set the goal first

Create a goal to complete E1–E11 (#4110–#4120): first demonstrate real reciprocal Host/Channel access, then deliver each slice as its own stacked PR with actual before/after screenshots and final-head required CI passing. Include real verification, applicable CLI parity and owned-resource cleanup. No token budget was requested. Do not stop after planning or opening the first PR. Follow the first-slice Human feedback gate before expanding surfaces; continue fixing that slice while awaiting feedback. This authorizes implementation/PR delivery, not merging or release unless the Human separately grants it.

## Git-based source transfer

Two previously uncommitted groups were committed and pushed separately; both are available through GitHub:

- `codex/environment-panel-design`: bilingual glossary/design/architecture, ADR-0334 and amendments to ADR-0203/0327; accepted target, not runtime implementation.
- `codex/connection-review-polish`: follow-up to original Connections delivery: installation/advanced row alignment, fixed footer, grouped connection management, bounded preparation logs, QR image and name/icon flow, first-remote-tab form lifetime and DNS/probe responsiveness. It is based on the original stack tail #4101, not independent main history.

[Design PR #4121](https://github.com/BotHarness/DeepSeekBot/pull/4121) is merged. [Connection review PR #4122](https://github.com/BotHarness/DeepSeekBot/pull/4122) carries the second group, stacked on original slice #4101. The original delivery order is #4090 → #4091 → #4093 → #4094 → #4095 → #4096 → #4097 → #4098 → #4101 → #4122. Check their current merged state before choosing an implementation base. Each integration head must pass CI; do not infer that older green checks qualify conflict-resolution commits. The original phone Feed acknowledgement decision is ADR-0335 after resolving its number collision with main's Desktop capture decision.

Once that chain is merged, start E1 directly from current main in a new worktree:

```bash
git fetch origin main
git worktree add -b codex/4110-reciprocal-host ../botharness-4110 origin/main
cd ../botharness-4110
```

The earlier seven-file archive (handoff, T3 reference notes, two patches, source manifest, publication verification and issue map) is obsolete for source transfer. The commits and this maintained handoff replace it. Credentials, machine-local Profiles, private logs, captures and running services never belonged in a source commit and are not needed on the next machine.

Existing clone:

```bash
git fetch origin main codex/environment-panel-design codex/connection-review-polish
git log -1 --oneline origin/codex/environment-panel-design
git log -1 --oneline origin/codex/connection-review-polish
```

New clone:

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git
cd DeepSeekBot
git fetch origin main codex/environment-panel-design codex/connection-review-polish
```

Inspect without disturbing another checkout:

```bash
git worktree add -b codex/environment-docs-local ../environment-docs origin/codex/environment-panel-design
git worktree add -b codex/environment-review-local ../environment-review origin/codex/connection-review-polish
```

After checking current PR/merge state, start E1 from current main if its prerequisites are merged, otherwise explicitly stack on the verified dependency head. Do not blindly cherry-pick both groups into an unrelated main, duplicate the original nine slices, or assume an old CI result covers a newer head. No archive, credentials, machine-local Profile, localhost service or device lease is required to transfer this source.

## One slice, one complete delivery

1. Claim the exact issue using this thread's own task identity and the repository trace rules. Preserve unrelated work.
2. Implement a runnable owner/persistence (where needed) → authenticated API/CLI → Client UI → observable result. Never substitute a backend foundation, mock or generated invitation for a live connection.
3. Use one branch/PR per slice, based on the previous verified parent where stacking. Name the parent PR and source head. A verified stacked dependency may support later work without falsely closing its unmerged issue.
4. Capture actual matched base/head Before/After images for each changed view/state; for a new surface show the old entry/absence state. Review/redact and publish via existing Cloudflare R2 evidence tooling; embed images in the PR and verify readback. No Git/LFS screenshots or private account/connection data.
5. Follow final-head required CI to completion; diagnose/fix failures and rerun affected checks after changes. Do not use older green checks or local tests as replacement for current CI.
6. Distinguish Web, installed Desktop, Simulator/emulator, physical-device and Human acceptance. Follow shared device leases. Report untested work explicitly and continue other authorized progress while waiting for external access.
7. Record issue/Hub PR links, exact head, evidence, tests, limitations and resource release before moving on. Do not close issues merely to unblock a stack or merge/release without authorization.

## First real closure

[E1 #4110](https://github.com/BotHarness/DeepSeekBot/issues/4110): A1 initiates, A2 verifies and approves the explicitly reciprocal relationship once. Both registered Clients read distinguishable remote Host Feeds, each sends a uniquely marked Channel message and reads it back on the owning Host. Verify wrong/expired/cancelled approval, late issuance, persistence/restart and basic disconnect while an independent phone grant remains usable. A model reply is not required for connection acceptance.

## Delivery map

| Slice | Issue | Blocked by |
| ----- | ----- | ---------- |
| E1    | #4110 | None       |
| E2    | #4111 | E1         |
| E3    | #4112 | E1         |
| E4    | #4113 | E2, E3     |
| E5    | #4114 | E1         |
| E6    | #4115 | E4, E5     |
| E7    | #4116 | E5         |
| E8    | #4117 | E5         |
| E9    | #4118 | E8         |
| E10   | #4119 | E8         |
| E11   | #4120 | E3, E4, E8 |

All belong to [Project #24](https://github.com/orgs/BotHarness/projects/24). Original #4069/#4070 and #4071–#4079 retain their own scope and acceptance; published new issues do not prove reciprocal authorization already exists. The panel follows Simple replacement/Advanced independent-column behavior; Client filtering and exact Settings Target are distinct. Each desktop Client has its own grant, phones inherit no relationship, and Bot collaboration is separate. Same-account automatic access uses verified enrollment, never input flags. Offline peer revocation stays pending until acknowledged, and explicit disconnect suppresses automatic reenrollment. See the [accepted design](../architecture/environment-panel.md) for the complete target.

The previous Mac's retained Human-review Host and device reservations are not shared verification resources for a new computer. Create and record local isolated fixtures through the normal dev/verification helpers. Use a dedicated QA account for live account checks, never production deletion or copied credentials. Stop and verify your own processes/ports, or record an explicit retained handoff.
