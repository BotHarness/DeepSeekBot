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

## Local writers were not stopped

At audit, four delegated Codex tasks were still shown as running: Team trusted ingress, Skills S5, S3 review fixes and S2 review fixes. Cross-thread `task_cancel` was rejected: `does not belong to thread`. Asking their parent threads to cancel them was also rejected because the Claude API provider was disabled for the project. **Do not assume they are stopped.** No alternate agent was started. The snapshots were internally stable when captured; a second hash comparison found no file changes at that moment. A still-running task may create later work. Ask the Human to stop those tasks in T3 UI, or paste the stop prompt below into each enabled parent, before treating Cloud as sole writer. Reconcile any later local commits before pushing to the same PR branch.

Parent stop prompt:

> 准备迁移到 Claude Cloud。请停止本线程继续实现、自动续跑和 PR 监控，用 task_cancel 取消本线程名下所有运行/等待/排队的子任务，不启动替代任务。保留 worktree、dirty 修改、未完成 merge、证据和 Simulator/Metro/测试 Host，不做 reset/clean/强推/merge/deploy。列出每个停止结果、分支、HEAD、未提交文件和剩余检查。若有持续自动运行的 goal，请暂停。

Individual child prompt when its parent is unavailable:

> 本任务迁移到 Claude Cloud，请在当前安全边界停止。停止自己启动的测试/等待进程，保留源码和所有未提交修改，不清理、不 reset、不 merge、不部署，也不要继续长测试。请输出分支、HEAD、dirty 文件、测试结果和剩余工作后结束本轮。保留其他任务的服务、设备和文件。

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

> 接手 BotHarness Team mode。先 fetch origin，读取 handoff/20261116-cloud-transfer 分支的 handoff/2026-11-16/README.md 和 team-mode.md，以及 snapshots.json。按最新 spec #4137/hub #4138 和附属 issues 完成所有未完成 slices。Claude Opus 5.5 medium 统筹及 UI/UX；非 UI 逻辑委派 GPT-6.1 Sol medium/high。先核对 PR #4258 的 4 条未解决审阅，再恢复 #4165 的未完成 main merge、集成 trusted-ingress checkpoint，继续 #4265 和其余 slices。所有常规开发/测试在 Cloud，只有 iOS Simulator/实机连接我的 Mac。先确认本地 4 个旧子任务停止或协调好单写者，再推送相同 PR 分支。设置持续 goal，完成验收、PR 和 issue closure；区分 CI/Web/installed native/real service/Human gates。

Skills:

> 接手 BotHarness Skills。先 fetch origin，读取 handoff/20261116-cloud-transfer 分支的 handoff/2026-11-16/README.md 和 skills.md，以及 snapshots.json。按最新 hub #4231 与 S1–S8 issues 完成剩余 slices。Claude Opus 5.5 medium 统筹及 UI/UX，非 UI 逻辑委派 GPT-6.1 Sol medium/high。S1 已合并；恢复 S2/S3 review checkpoints，按 S2→S3→S4 顺序集成，随后 S5/S6/S8。S7 已由 Human 决定 not planned，勿重新实现导入隔离/审阅。常规开发与 Web e2e 在 Cloud，iOS Simulator/实机才连接 Mac。确认本地旧任务停止或建立单写者协调后再推送相同 PR 分支。设置持续 goal、开窄 PR、完成验收并 close 对应 issues。
