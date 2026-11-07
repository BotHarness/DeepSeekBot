# DSH 0.2.2-rc.1 qualification

Work tracked in [#3477](https://github.com/BotHarness/DeepSeekBot/issues/3477).
Follow the recurring [DSH RC runbook](dsh-upgrade.md); this record describes one
qualification attempt and does not replace the product release gates.

## Inputs and compatibility contract

- Upstream: [`dsh-v0.2.2-rc.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1), published 2026-11-04; source `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`.
- Previous development baseline: `0.2.1-rc.3`. Candidate baseline: `0.2.2-rc.1`, Cordis `4.1.0`, Loader `1.1.0`, Schemastery `3.19.0`.
- Admission remains `>=0.2.0-0`, including prereleases, without a new upper cutoff.
- Artifact targets: `0.2.0-rc.2`, `0.2.1-rc.2`, `0.2.1-rc.3`, `0.2.2-rc.1`. Inclusion in this list is not a passing result.
- Published Tobs identity and immutable IM Provider provenance remain unchanged.
- Routine upstream tracking follows RCs; Alpha qualification requires a separate explicit scope.

## Changed contracts

| Seam              | Adaptation and regression                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool execution    | Detect `setExecutor` before dispatch. Older Hosts retain `presentAs('native')` and single calls. Newer Hosts use the native executor and a one-call batch for direct CLI operations, without invented model-step logging. Require one result with the original call ID; never retry a failed call through another API. `native-agent-compat.test.ts` and `orchestrator-file-tools.test.ts` cover dispatch and policy. |
| Executor lifetime | A modern executor belongs to its Agent scope. Releasing a borrowed application handle must not dispose it: native disposal deliberately leaves an unavailable selection instead of inheriting the root provider. Reattachment reuses the Agent-owned installation; a conflicting provider remains an explicit failure.                                                                                                |
| Model selection   | New Agents record choices through `agent.model.select()` before step preparation; old Agents retain their mutable native selection. Idle native-parent wake captures the current model synchronously at Inbox claim, before the new loop reads its model. Asynchronous ownership and run preparation still gate prompt assembly. Active application turns retain their selected route.                                |
| Approval reviewer | New prompt presentation waterfalls no longer own tool declarations. A reviewer executor describes zero tools, including Agent-local registrations, and its guard still rejects execution. Restricting inherited tools alone is insufficient.                                                                                                                                                                          |
| Config types      | Loader's volatile-update event still exists. Mixed Loader versions produced misleading missing-event/type errors. Align Loader versions; annotate public Browser/Computer schema output because the separately retained theme package imports an older global Schema namespace.                                                                                                                                       |
| File tools patch  | Retain the `read_image` injection fix and relocate it to the new native artifact. Do not externalize it to discard the fix.                                                                                                                                                                                                                                                                                           |
| AX Go patch       | Preserve the RC3 template for old isolated CLIs; add a reviewed RC1 template around the new native header-preparation call. Match the actual adapter code shape uniquely, retain native header processing and request attribution, and refuse unknown or ambiguous shapes.                                                                                                                                            |

The legacy theme package remains separately pinned. After integrating #3641, the
product also retains its independently qualified RC1 theme and runtime selection.
A DSH SDK upgrade does not by itself qualify replacing either transformed input.

### Current versus legacy Subagent paths

Orchestrators have delegated through Assignments since #2968 (`486369c1201e`).
The earlier direct-child recovery path from #2759 (`7f984cd5d`) remains in main
for retained Session ownership graphs; the RC1 Inbox-time model capture adapts that
existing path. Its ordering test is a mocked event-boundary regression, not proof
that a current Orchestrator can create such a child. The runtime regression also
reconstructs real native Session snapshots and reads persisted child ownership,
but still uses an adapter fixture rather than a real model-driven Host.

Current-product qualification must independently exercise an Assignment's background
child completing after that Assignment becomes idle, and a new Human DM after the
Bot model changes while idle. A direct CLI call on an idle Assignment lacks active
execution authority and must refuse; pair it with an authorized active-Assignment
call. Do not relax authority or manufacture new direct Orchestrator children to
make the historical test diagram reachable.

## Evidence status

Qualification is **in progress**. Windows source checks are not a substitute for
frozen-product installation, real model behavior or macOS Desktop checks.

The earlier qualification scope deferred macOS testing to the Human. On 2026-11-07
the Human superseded that deferral for the idle Assignment report fix: official
macOS Desktop verification is now required for that fix, serialized with the
parent task's published-version upgrade check. Windows is outside the fix task's
scope. Historical Windows/Linux results remain separate and do not establish
macOS compatibility.

Local evidence is retained in the task's ignored `dsh-022` directory. Failed attempts
remain alongside retries:

- Focused runtime checks passed: 144 tests across Agent adaptation, native file policy,
  reviewer behavior, native wake/runtime and Browser configuration.
- Additional tool API/lifetime and reviewer checks cover legacy dispatch, batch result
  correlation, denial propagation, zero reviewer schemas and borrowed-handle reuse.
- The first full build failed while generating declarations due to mixed Schema versions;
  its partial bundle successes were not a successful complete build. Explicit schema
  output types address that boundary.
- The first linked Host launch returned API 404 because those failed builds left component
  entrypoints absent. A later attempt refused surviving preparation descendants. Neither
  attempt is runtime compatibility evidence.
- The default-concurrency full suite produced many Windows timeouts. Its log is retained;
  a bounded-concurrency rerun is separate evidence.
- The final complete build and root/mobile typechecks passed. Final focused regression:
  eight files, 144 passing tests (`final-focused.log`). The bounded full suite also
  encountered failures and was stopped; neither full-suite attempt is a passing gate.
  Lint, formatting and both release-ledger checks passed.
  The follow-up classification and fixes are recorded below; neither interrupted
  Windows run becomes a passing full-suite gate retroactively.
- A linked RC1 Host passed authenticated API health and a real Web DM returned `42`
  for seventeen plus twenty-five. Its canonical turn completed with a committed
  `bot_send_message` result. This was the earlier linked build, not the frozen product;
  it does not qualify the final candidate or older Hosts.
- Frozen local test artifacts use version `1.6.2-test.3477.1` (not published), with
  per-package integrity in `frozen-2/artifacts.json`. Provider source was exported
  directly from its pinned Git archive to preserve the verified LF bytes on Windows.
  The first packaging attempt lacked Provider build dependencies; installing the
  unchanged lockfile with scripts disabled allowed the retry to complete.
- The artifact manifest SHA-256 is
  `bdb3a6647abd6eaac5682379aa97ed8db418f1cdc70937852b916189dcd09027`.
  These same bytes passed isolated packaged Host startup and authenticated API health
  on `0.2.0-rc.2`, `0.2.1-rc.3` and `0.2.2-rc.1`. Each completed a real model reply
  (`42`), native Memory `write`/`read` (`rc3477-file-ok`), an Assignment report and
  native background `bot_subagent` completion returning `RC3477-SUBAGENT-OK` to DM.
  This also exercises the modern external executor import from the installed package.
- Evidence prefixes are `packed-min`, `packed-prev`, `packed-new`: `*-file-trace.json`,
  `*-subagent-trace.json`, send receipts/status and Assignment records retain canonical
  tool results. Some CLI waits timed out after admission; subsequent trace/status
  reads confirmed completion, without resubmitting the same request.
- Initial Assignment writes were refused because the test Grants were read-only.
  Enabling write on only the temporary QA workspaces allowed completion; no policy
  was weakened. RC3's Assignment used its shell for the eventual write, whereas
  minimum/RC1 Assignment traces contain native writes. Native Memory file calls
  passed on all three runtimes.
- Background children finished while their parents were still running. This proves
  spawn/completion/report delivery, not idle-parent wake or idle model-switch capture.
  A direct CLI child on an idle RC3 Assignment was refused with
  `Assignment approval execution authority is unavailable`; that path remains open.
- RC1 same-candidate restart passed: authenticated API, the same Bot identity, the
  earlier child-result DM receipt, and a fresh native read returning retained Memory
  content `rc3477-file-ok`. This is not a published-version-to-candidate upgrade.
  Startup initially refused a stale resource PID reused by an unrelated Chrome
  process. After verifying the task Host/preparation processes had exited, the stale
  task-local owner record was backed up and removed; the unrelated process was not
  touched. Retained logs distinguish this AX recovery from the product restart.

### Full-suite failure investigation

The first completed Linux full CI run, [41891895496](https://github.com/BotHarness/DeepSeekBot/actions/runs/41891895496),
identified five failing tests and one separate performance-navigation failure:

- Four Channel approval tests constructed the native service without initializing
  its RC1 Session Projection. The fixture now initializes the real registry/service
  and opens a real Session turn. An additional regression verifies idle Sessions are
  refused before routing or audit writes; native policy is not weakened.
- The manifest test omitted the retained `0.2.1-rc.3` matrix entry. Its expected list
  now matches the minimum, historical RC2, previous RC3 and pinned RC1 targets.
- The performance script waited for the removed workspace rail. It now waits for
  Bot mode, selects the Channel row in the sidebar and dismisses the welcome overlay.
  A real isolated RC1 run loaded all 600 messages under the unchanged budget: 12
  mounted messages, zero page errors, zero scroll jumps/gaps and 0.7% idle main-thread
  occupancy. All structure/timing budget checks passed locally.

The bounded Windows run had 21 failures across nine files. Repeating those exact
tests serially under the original 15-second timeout passed 17. One remaining
failure was Git's CRLF conversion; the source fixture now commits a `.gitattributes`
LF rule, without changing machine Git settings or product content handling. The
other three were timeouts: a diagnostic-only 60-second allowance passed all three
in 15.48, 18.06 and 13.01 seconds respectively. Repository timeouts remain unchanged;
this does not qualify a complete Windows suite.

After the fixes, the three affected test files passed all 39 tests, and lint,
formatting and root/mobile typechecks passed. A filtered dependency installation
temporarily mixed mobile React type links; reinstalling the unchanged lockfile for
the full workspace restored typechecks without mobile source changes. A fresh
full CI run is required for the fixed commit; its result belongs to that exact SHA.

| Gate                                                              | Status                                   |
| ----------------------------------------------------------------- | ---------------------------------------- |
| Published Tobs on new RC                                          | Unverified                               |
| Frozen startup/API on minimum / previous / new RC                 | Passed on the three versions above       |
| Historical additional `0.2.1-rc.2` target                         | Unverified in this run                   |
| Linked RC1 real Web DM                                            | Passed on earlier linked build           |
| Frozen reply, Memory files, Assignment report, child completion   | Passed with qualifications above         |
| Idle native Subagent wake / idle model change / direct idle child | Unverified; direct-path refusal retained |
| Same-candidate RC1 Profile restart                                | Passed, with AX recovery above           |
| Published-version Profile upgrade                                 | Unverified                               |
| Windows native Desktop                                            | Unverified for this candidate            |
| macOS native Desktop                                              | Unverified; no macOS result supplied     |
| Product publication / website deployment                          | Not performed                            |

Do not promote the candidate or announce overall compatibility while required
in-scope runtime/platform rows remain unverified. The historical macOS deferral
does not satisfy the newly authorized fix verification described below. On completion, replace these statuses with
the exact artifact identity, commands, results and reviewable evidence links.

## Idle Assignment report continuation fix (2026-11-07)

This scope is claimed separately in [#3477's work trace](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6706041773).
The published `1.6.1` upgrade baseline belongs to the parent qualification task;
this record does not claim that baseline or authorize a release.

- Root cause: the native child did wake the idle Assignment, but the wake did not
  establish an application-owned Assignment run and report context. The existing
  `running + working` execution guard correctly refused its report. The fix admits
  verified direct native Subagent input through the real Assignment lifecycle,
  rechecking Bot, Source, Grant, stop/archive state and capacity. It does not relax
  the idle direct-tool guard or replay the already claimed native input.
- Frozen local candidate: `1.6.2-test.3477.idle.1`, base
  `9d6956ae9d39348efad92caeeaee73cde64c626e` plus an explicitly uncommitted patch,
  not a clean source SHA. Patch SHA256:
  `76a7baa748e2fc4ab8ab385cf9956d5152cd3eb36f657a2a29c4d424745e5f4e`.
  Artifact manifest SHA256:
  `c66e4fc25cc8a32a9085f675cf8831b5875b2d2bef91c89acdb35df29d682814`.
  Subsequent qualification/CLI documentation edits do not change the frozen runtime.
- Red-before-green: the new regression failed against the original lifecycle;
  230 focused tests across eight files then passed, including revoked/mismatched
  Grant, Source, stop/archive, queued cancellation and strict direct-tool refusal.
  Root/mobile typechecks, build, lint and formatting passed. These are source/build
  checks, not native or Human acceptance.
- Real RC1 CLI/Host with that installed candidate and
  `opencode-go/minimax-m3` (effort off) observed parent
  `botharness-3b546656-c4ce-44b2-a77b-7d8389535461` as `running + idle`
  while child `15b87ac7-fd91-4a45-827f-d202b913b9e2` ran `sleep 45`.
  Native parent Turn 1 ended at sequence 32; Turn 2 began at 34 and successfully
  called `report_to_orchestrator` at 41. Canonical Source Events retained the
  progress report in Turn 1 and completed report in Turn 2; the Orchestrator's
  actual DM included `IDLE3477_WAKE_DONE`. The real idle first-step switch to
  `opencode-go/qwen3.8-flash` also passed.
- The installed CLI's active direct child succeeded; the idle equivalent refused
  with execution authority unavailable and child count unchanged at 2. No new
  bridge method or Bot tool was introduced; existing CLI parity remains intact.
- Preserve the failed capture: the original runtime report marks the wake gate
  failed because a later evidence read used a root Session address for a Subagent.
  This happened after successful report/DM delivery. Read-only persisted native
  logs (50 parent records, 33 child records) and canonical readback establish the
  functional result; they do not erase that harness failure.
- Performance guard: 100 already-prepared native steps create no extra Assignment
  runs, timers or database subscriptions. Capacity waits use cancellable database
  commit notifications rather than polling. No measured end-to-end speedup is
  claimed.
- Official macOS RC1 binary verification passed: arm64, matching feed/archive
  SHA512, `codesign --deep --strict`, and notarized `spctl` acceptance; Team
  `NAN929V4UM`, signature dated 2026-11-04. Executable SHA256:
  `49f390f1ff2975c822522254d1363836d060f49b164e89b59d09e9c8a7929de2`.
  Post-run deep/strict signature verification also passed; the app was not modified.
- After the parent explicitly released its Desktop slot, the fix's independent
  macOS Home/userData/CDP 34930 used the same frozen candidate, manually staged
  while its Desktop was stopped. This is not UI/CLI installation evidence. The
  native Plugins page enabled Tobs, with canonical Bundle readback. Real
  mouse/keyboard input in the visible Desktop sent the DM and Assignment request
  using `deepseek-official/deepseek-flash`, effort low.
- Native parent `botharness-f20b0051-e3a6-4f84-9059-8306a1a0ed5c` was observed
  idle at `2026-11-07T11:48:09.677Z` while child
  `e47c42ed-9f63-4cfc-b765-bf5b907caab9` ran `sleep 45`. Turn 1 ended at sequence
  35; Turn 2 began at 37, successfully reported at call 44/result 45, and ended
  at 53. Canonical reports retained progress in Turn 1 and completion in Turn 2.
  The actual native DM rendered `MAC3477_WAKE_DONE` and the child result.
  Complete persisted readback retained 55 parent and 36 child records. The
  installed CLI against this Desktop-owned Host still refused idle direct child
  execution with child count unchanged at 1.
- Native preparation failures remain recorded: an early Host-access readiness
  race, ambiguous navigation and attempts before the task composer was selected.
  They did not send duplicate DMs. The separate CLI post-success capture failure
  above is not reclassified as a clean run.
- Public, privacy-reviewed R2 derivatives passed byte/hash/type readback:
  [cropped native completion](https://media.botharness.ai/pr/9d6956ae9d39/51fc77ab28e208b6b312756879f0cedbbc65f4c09341a4f9f943ce839324a49a.png)
  and [qualification summary download](https://media.botharness.ai/pr/9d6956ae9d39/fed79f8c69a8637821b4bb1041c7ba36937af4364b6bb7106d982284b5f9d673.html).
  Their source namespace is the base SHA; both evidence descriptions explicitly
  retain the frozen dirty-patch identity. Raw logs and credentials are not public.

Private evidence is indexed in the fix task's ignored
`.humanlayer/tasks/3477-idle-authority/README.md`; raw logs and credentials must
not be published. CLI Host PID 99184 exited and port 34910 was released. Native
Desktop PID 89027 and its recorded descendants exited; CDP 34930 and Host port
52491 were released. Profiles and private evidence are retained; the unrelated
Human Desktop was not attached or stopped. Standalone Web and Human acceptance
remain unverified; Windows is outside this fix scope. No overall compatibility,
npm publication or Site deployment is claimed. The subsequent fix PR and its
CI/merge decision are separate from this frozen-runtime qualification record.

### PR review follow-up candidate

- Review found that deduplicated admission shared the first caller's cancellation.
  Two independently signalled regressions failed before the fix and passed after it:
  cancelling a follower releases only that waiter; cancelling the preparation owner
  lets a still-live follower re-enter admission with fresh authority checks. The
  pending map still shares one preparation, and cancellation listeners are removed
  when each waiter settles. The prepared-step constant-work guard remains unchanged.
- New local-only candidate `1.6.2-test.3477.idle.2` freezes head
  `911b93cc440ca3369422b402c94fc77cf1eb035b` plus review patch SHA256
  `540da5154a4a9c13409602c55358e57879b5c0fe19da93bfd854a3ed7c6f29d4`.
  Artifact manifest SHA256:
  `baa3220f210a65c996793f5aec2b316dba6af7f74f556f955ede22d194f6d256`.
  Both installed Hosts' core bundle matches the frozen bundle SHA256
  `f3b60fa0f260acea71e1a3ead7ab00399586702473396b994fd6f602cfac7fba`.
  This is local `product-artifacts` packaging, not release preparation/publication.
- Follow-up checks: 178 tests in three affected files, root/mobile typechecks,
  build, lint and formatting passed. Real RC1 Host model switching, active direct
  child success, idle refusal and native background wake/report all passed. Closed
  persisted CLI logs retain 49 parent and 33 child records, with canonical progress
  in Turn 1 and completion in Turn 2.
- A fresh independent official macOS RC1 Home/userData repeated real native DM and
  background-child input on the official DeepSeek route. Parent
  `botharness-03282740-b239-43bc-b63d-f1721fb8594d` was idle at
  `2026-11-07T12:33:15.836Z` while child `56e9ac91-246f-40f2-9896-1a4c797aa826`
  ran. Turn 1 end35 → Turn 2 start37 → report call44/result45 succeeded; closed
  persisted logs retain 55 parent and 36 child records, canonical progress1 /
  completed2, and the rendered DM contains `MAC3477_WAKE_DONE`.
- Installed CLI against that Desktop Host independently passed active direct
  child execution and idle refusal, with child count 1→1. Its supplementary
  active/idle collector failed a fetch after the successful active command; the
  failure is retained, and separate idle readback/refusal established the boundary
  without resending the task. Native navigation attempts blocked by onboarding
  are also retained. These failures are not reclassified as clean script runs.
- The [new cropped native result](https://media.botharness.ai/pr/911b93cc440c/819fd1b727d97cce66bad99bd3a136f2549a1107b5a72a73fd4e7987ea354589.png)
  passed public R2 byte/hash/type readback. Its namespace is the pre-patch head;
  the source identity is the explicit frozen patch above, not a clean head build.
  The earlier candidate's evidence remains historical, not proof of these bytes.
- Review evidence is indexed under ignored
  `.humanlayer/tasks/3477-idle-authority-review/`. Desktop PID97165, Host98681 and
  recorded descendants exited; CDP34930, native Host56781 and CLI Host34910 were
  released. The unchanged official app passed post-run deep/strict signature
  verification; Human Desktop PID2740 remained alive and untouched. Standalone
  Web and Human acceptance remain unverified; Windows remains outside this scope.

## Merged-candidate Windows qualification (2026-11-07)

Merging current `main` into the RC1 candidate (`51b39218a`) kept the product changes
but brought newer tests. The first Windows full run at that head found 96 failures
across 44 files. Re-running those files separated environment pressure from
deterministic defects. The fixes below are committed with the candidate.

- Files that created their own temp roots deleted them before the shared helper
  closed tracked SQLite owners. Windows refuses to delete an open database file
  (EPERM). Those files now use the helper's `createTempRoot`, and helper cleanup
  retries transient Windows locks.
- POSIX-only assertions now branch or skip on Windows: Linux folder browsing,
  file-mode bits, a Windows-illegal quoted filename, a POSIX shell shim, and a
  path-separator expectation.
- Timezone-sensitive tests pin `TZ=UTC` (Node on Windows retains a stubbed zone
  after unstubbing); the formatter-cache test uses the same pinned zone so its day
  buckets and cache keys stay stable.
- `git-probe` chooses POSIX or Windows path semantics from the injected host
  platform, so the macOS Command Line Tools stub is detected inside a Windows test
  process.
- Memory images refuse a symlink with the `missing` result on every platform.
  Windows has no `O_NOFOLLOW`; previously it followed the link and reported an
  invalid request (400 instead of 404).
- Native file refusal now rejects a path whose missing child sits below a regular
  file. POSIX reports `ENOTDIR`; Windows reports `ENOENT`, which previously passed
  the parent as if it were a directory.
- The Lark provider-contract probe skips directory `fsync` on Windows (EPERM), and
  the detached-daemon lifecycle test polls for parseable JSON rather than file
  existence, removing a Linux CI race.
- The Windows qualification command uses the diagnostic `--testTimeout=60000` flag; the
  repository keeps its 15-second guard. The 40-hop Group stress test carries an explicit
  300-second Windows allowance because 40 SQLite-backed hops take minutes on that platform.

Re-running the 44 affected files at that diagnostic allowance with four workers passed 41;
the three remaining files were then fixed and re-verified individually: the native-path
`ENOTDIR` refusal, the 300-second 40-hop allowance, and the Puppeteer shutdown hook that
needed more than 30 seconds under load. A subsequent full-suite attempt on the same shared
machine still exceeded the diagnostic allowance while other agents held the CPU, so that
log stays a failure record and not a passing gate. Linux CI remains the full-suite
authority for this PR.
