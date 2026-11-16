> Transfer note: this is the stopped child task's report. Statements saying “not pushed” describe its stop time; source checkpoints and the final trusted-ingress commit were subsequently pushed by the transfer session. Local log links are retained as provenance and are not Cloud-accessible. The latest Human instruction runs normal development/verification in Cloud and connects to the Mac only for iOS Simulator/physical-device work.

# Claude Cloud 交接

用户已要求停止本地实现并迁移到 Claude Cloud。本任务的验证/等待进程已停止；进程查询确认没有遗留的 s3-fixes verify-all、run-check、run-batches 或 select-affected 进程。未停止其他任务的服务、测试或设备。

- Worktree: /Users/doodlebear/.t3/worktrees/BotHarness/t3-e326980b-907bf3492d9671a5
- Branch: s3-fixes
- HEAD: d8604758941e900fb610e0bd1268b3968866d9a9
- Base: 8098fe893bd4d46a8880ce4f14199aa1b1293663
- Commit: fix(skills): refresh pending catalogs and recover watchers
- Trailers: Issue: #4234; Agent-Task: codex/local/01a1e26f-ea49-7bc0-83b6-8b78a07ab072
- No push; no PR. Cloud 侧需要由上级迁移这个本地 commit 和未提交 diff。

## 已提交的文件与内容

- packages/core/src/skills/catalog.ts：Host 通知遇到尚未完成的冷读取时替换缓存条目，利用已有的条目身份检查丢弃并重读旧结果。
- packages/core/src/skills/refresh.ts：跟踪每个 Bot 当前选择的 Agent，选择变化时只 invalidateMemory；watcher 错误后以 100/200/400 ms 最多重试三次，移除、移动和 close 时取消。
- packages/core/src/runtime/native-agent-compat.ts：Agent 查询及 created/disposed 订阅；created 回调显式返回 undefined 以满足 DSH 类型。
- packages/core/src/plugin.ts：Skill view 与 watcher 使用同一个 Agent 选择函数，订阅 Agent 生命周期及 session-ownership 变化。
- packages/core/test/skill-catalog-refresh.test.ts：冷 Host 读取失效、Agent attach/replacement/detach 以及缓存读取预算回归。
- packages/core/test/skill-catalog-retry.test.ts：fake timers 覆盖恢复、退避、耗尽、初始化失败、移除、移动和关闭。
- packages/core/test/plugin.test.ts：真实 Plugin wiring 的 attach/detach 通知回归。
- changes/4234-skill-refresh-recovery.md：双语变更片段。

## Dirty 文件（已保留）

唯一 tracked dirty 文件：packages/core/test/skill-catalog-retry.test.ts。
新增 6 行断言：重试耗尽后，显式 reconcile() 应能恢复 watcher，并让 outage 期间的缓存失效。完整 diff 另存 UNCOMMITTED.patch。

这组新增断言尚未运行，预计当前实现会失败：refresh.ts 对同一 root/preset 的 failed 状态仅 continue，无法通过显式 reconcile 恢复。尚未实施对应修复。

## 测试与检查

- 原实现的 regression run：失败，证明冷 Host 返回旧 entries、Agent 选择缺少通知、watcher 不重试；插件 fixture 的初始化等待修正后，再次确认旧代码在缺少 attach 通知处失败。日志 red-regressions.log、red-plugin.log。
- focused run：5 文件、99 测试通过。此结果发生在后续类型修正和 dirty 新断言之前，不能声称当前 HEAD + dirty 已通过。
- pnpm -w exec tsc --noEmit：首次失败（created listener 的 void 返回类型，以及插件测试 3 处隐式 any）。这些问题已在 HEAD 修复，但修正后的重跑一直排队，未完成。
- pnpm lint：修改前后都在既有 migration 校验失败：generation 155 期待 channel-membership-basis，当前请求的基线缺失。未改动 schema/migration。
- 单独的 source policy、Host casts、CLI parity、ci-plan --check、changelog 检查通过；修改文件格式检查通过。
- CI-plan affected suite selection、所有 affected suites、slides build 和 docs test：未运行。
- 所有实际 Vitest 执行均使用 --maxWorkers=2。每次启动前检查 pgrep 并等待其他任务；测试设置隔离的临时 DSH_HOME/TMPDIR。没有访问 ~/.dsh，也没有手动启动 live Host、浏览器或设备。

精确执行命令及 exit code：commands.log。失败的 TypeScript 输出：tsc-first.log；focused 输出：focused.log；lint 输出：lint-baseline.log、lint.log。

## Cloud 剩余工作

1. 先运行 dirty 中“重试耗尽后显式 reconcile 恢复”的断言，建立 red。
2. 修复 refresh.ts 同 root/preset 且 state.kind === failed 时的显式恢复路径：重置 retry budget，重新 start；成功后 invalidateMemory、invalidateNative 并通知。保持已有 retrying 状态的定时器和退避不变，不引入轮询。
3. 按任务要求重跑 pnpm lint、pnpm -w exec tsc --noEmit、五个 focused suites，然后运行 CI-plan 选择的所有 affected suites（分批、最多两 workers）。不要把已有 99-pass 当作最终 HEAD 的验收。
4. 处理本任务引起的失败，保留既有 migration 阻塞的准确边界；更新本地 commit，保持 Issue: #4234 trailer；不 push、不建 PR。

## 资源和文件保留

- 本任务所有测试/等待进程已停止，未触碰其他任务进程。
- resources.log 所列唯一临时 dshHome/TMPDIR 已删除；未运行 build，没有构建产物待清理。
- 源码、未提交 diff、日志、交接记录均保留。
- 本地安装的 node_modules 约 3.0 GB 保留，未做额外删除；迁移后可按所有权确认再清理。
