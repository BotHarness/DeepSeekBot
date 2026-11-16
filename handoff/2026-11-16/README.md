# Claude Cloud handoff — BotHarness

Snapshot date: 2026-11-16 UTC. Repository: https://github.com/BotHarness/DeepSeekBot (use this exact repository for these issues/PRs; some older repo documents name BotHarness/BotHarness).

## Start here

1. Fetch `origin`, then read this directory on branch `handoff/20261116-cloud-transfer`. Keep separate Cloud sessions for Team mode and Skills. Read `team-mode.md` or `skills.md` before editing.
2. Read current GitHub spec, hub, issue comments, PR checks and unresolved review threads. The tables below are a point-in-time observation, not continuing monitoring. Run `git status` and preserve existing work before switching.
3. Claude Opus 5.5 medium orchestrates and writes UI/UX. Delegate core, CLI, permissions and non-visual logic to GPT-6.1 Sol medium/high (high for difficult authorization work). In T3 use `delegate_task`; outside T3 use the Cloud environment's available Codex integration. If that exact integration/model is unavailable, report the limitation; do not silently substitute another model or promise local T3 delegation from Cloud.
4. Set a persistent goal for completing all slices in the chosen spec, their required tests, narrow PRs and issue closure. Continue through all unfinished slices. Record source/CI, real-model Host/Web, installed Desktop, iOS Simulator, physical-device and Human acceptance separately.
5. Implementation, Node-based tests, docs, CLI, Web e2e and PR work run in Cloud. Connect to the user's Mac only for iOS Simulator or physical-device work. Hardware-only blockers do not block independent Cloud slices. Configure Cloud credentials via its secret mechanism; no credentials were included in this handoff.

## Remote state

Existing PR branches were already pushed. Five additional **unvalidated source checkpoint branches** preserve child work and the unfinished M8 merge. `snapshots.json` records full SHAs, original branches, merge parent, changed-file hashes and original unmerged index entries. Each checkpoint also contains `.cloud-handoff/source-state.json`.

These are source recovery branches, not review-ready PRs. They have an extra `.cloud-handoff` metadata file. Import only the intended source diff into the real feature branch; keep metadata out of feature PRs. Existing local worktrees, their actual indexes, dirty files and merge states were not changed by snapshot creation. No new tests were run for the transfer.

| Checkpoint branch (`origin/` prefix when fetching) | Meaning |
| --- | --- |
| handoff/20261116-skills-s2-review-wip | S2's two outstanding Bot Inbox fixes, 3 dirty files |
| handoff/20261116-skills-s3-review-wip | S3 committed fixes plus an unfinished retry-exhaustion regression |
| handoff/20261116-skills-s5-core | S5 core implementation; UI/integration/full verification pending |
| handoff/20261116-team-trusted-ingress-wip | Managed Tailscale TLS ingress implementation and tests, 22 dirty/new files |
| handoff/20261116-team-m8-merge-wip | Exact unfinished M8 merge working files; contains conflict markers |

## Local tasks stopped — confirmed after Human intervention

All four delegated tasks now report `completed`; each final response says its own tests/waiters stopped and unrelated services/devices were preserved. Task status and final reports were read again for this update. No task was restarted. The transfer session did not separately audit OS process ownership.

- Team trusted ingress finalized commit `149f6e4f9cea310bf9e54218152a75140955ab4a`; clean worktree. It is now pushed on `codex/team-trusted-ingress`. Prefer this real implementation commit over the earlier ingress WIP checkpoint. Source content is identical to the earlier snapshot; only the finalized commit and reporting changed.
- S5 remains clean at `744b8e595`; source checkpoint still current.
- S3 remains at `d86047589` plus its six-line dirty regression; checkpoint still current.
- S2 remains at `e942d795f` plus three dirty files; checkpoint still current.
- M8's unfinished merge checkpoint is unchanged.

Read the stopped-task reports in `reports/` for exact validation gaps. Local-only log paths are evidence pointers, not files available to Cloud. S2's stop/verification outcome is also recorded at https://github.com/BotHarness/DeepSeekBot/issues/4233#issuecomment-6908316834 .

## Import a checkpoint without importing its metadata

For ordinary child checkpoints, inspect `snapshots.json` for `head` (the child's base/current committed HEAD) and `snapshot_commit`. Committed child work is already in the checkpoint history. Review `git log` against the intended feature base, cherry-pick only missing implementation commits, then import the uncommitted delta with:

```bash
git diff --binary <original-head> <checkpoint-sha> -- . ':(exclude).cloud-handoff/**' > /tmp/child-wip.patch
git apply --check /tmp/child-wip.patch
git apply /tmp/child-wip.patch
```

Resolve overlapping changes deliberately. Re-run the issue's behavioral regression and required checks before committing to a PR branch. S2's child base predates the latest S2 UI/docs fixes; S3 and S5 must absorb upstream stack updates.

For **M8**, follow `team-mode.md`; its checkpoint is an unfinished merge, not a normal patch ready for cherry-pick.

## Cloud startup prompts

Team:

> 接手 BotHarness Team mode。先 fetch origin，读取 handoff/20261116-cloud-transfer 分支的 handoff/2026-11-16/README.md 和 team-mode.md，以及 snapshots.json。按最新 spec #4137/hub #4138 和附属 issues 完成所有未完成 slices。Claude Opus 5.5 medium 统筹及 UI/UX；非 UI 逻辑委派 GPT-6.1 Sol medium/high。先核对 PR #4258 的 4 条未解决审阅，再恢复 #4165 的未完成 main merge、集成 trusted-ingress checkpoint，继续 #4265 和其余 slices。所有常规开发/测试在 Cloud，只有 iOS Simulator/实机连接我的 Mac。旧子任务已停止；推送前仍需核对远端最新 head。设置持续 goal，完成验收、PR 和 issue closure；区分 CI/Web/installed native/real service/Human gates。

Skills:

> 接手 BotHarness Skills。先 fetch origin，读取 handoff/20261116-cloud-transfer 分支的 handoff/2026-11-16/README.md 和 skills.md，以及 snapshots.json。按最新 hub #4231 与 S1–S8 issues 完成剩余 slices。Claude Opus 5.5 medium 统筹及 UI/UX，非 UI 逻辑委派 GPT-6.1 Sol medium/high。S1 已合并；恢复 S2/S3 review checkpoints，按 S2→S3→S4 顺序集成，随后 S5/S6/S8。S7 已由 Human 决定 not planned，勿重新实现导入隔离/审阅。常规开发与 Web e2e 在 Cloud，iOS Simulator/实机才连接 Mac。旧子任务已停止；推送前仍需核对远端最新 head。设置持续 goal、开窄 PR、完成验收并 close 对应 issues。
