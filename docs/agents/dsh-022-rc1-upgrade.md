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

## Fresh merged-main continuation (2026-11-07)

This is a new qualification attempt, not a reuse of the previous machine's
private artifacts. Ownership and the portable public evidence start at the
[new claim](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6705261272).
The [A1 and published-baseline result](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6705385193)
records the first completed gates. Earlier tables remain historical and do not
qualify these new bytes.

### A1: immutable candidate

- Source: clean `main` at `172d5ae255b4d6932175df64a669901ac4ee64d5`, containing
  the adaptation merge `b98cba9ff83fe0fea4ec958976bdab324bf98a09`.
- Candidate: `1.6.2-test.3477.2`; Node `v24.21.0`; pnpm `12.4.2`; development CLI
  and SDK `0.2.2-rc.1`. Admission remains `>=0.2.0-0`.
- Commands: `pnpm install --frozen-lockfile`, `pnpm build`, then
  `node scripts/npm-prerelease.mjs prepare --version 1.6.2-test.3477.2`
  with a fresh output directory and the pinned Provider source supplied by
  `--provider-source`. Preparation includes the existing package dry-run checks;
  no real publication was performed.
- Provider source: `bb0c7956896f5f5845950a0707837cd7938a11b3`; the existing flow
  reuses the verified published `@botharness/im-provider@4.32.0-botharness.27`
  bytes without changing its provenance or version.
- All seven product/Provider and five cloudflared platform-package SHA512
  integrities were verified. The manifest and tarballs were made read-only before
  runtime qualification. Every continuation row uses this same artifact set.
- `artifacts.json` SHA256:
  `39a56eda35552e750a06c3e3e0064e703a9323c460cf5a0b93e7b5f5715c6658`.
- `release-plan.json` SHA256:
  `d02651975d45f0e5cdecbe902cc3261cebcb1674e4cd50099fd2ab5d3b0850a8`.

### A2: published baseline and candidate runtime matrix

Official npm `@botharness/tobs@1.6.1` installed in a fresh isolated RC1 Profile.
The authenticated API and the Web Client loaded, but the first real Human DM
failed before a model reply with `agentCtx.tools.presentAs is not a function`.
Canonical failure: Orchestrator Session
`botharness-ab98e4ee-020e-41f4-98e6-76de089494fd`, request message
`e88b2d20-379f-46d7-b99a-04a8e4cb8068`. This is published-product behavior, not a
candidate failure. The published bytes were not shimmed to manufacture a pass.

Consequently the required published-on-RC1 pre-upgrade real reply and native
Memory baseline **failed**. Any subsequent same-Profile recovery, fixture
retention or draft-retention result is a separately scoped partial result; it
cannot turn this required lane into a passing gate. Human-API fixture writes
must not be described as native model writes.

The frozen candidate passed the following CLI Host rows. Each target used a fresh
isolated Home/Profile; the runtime package version and installed seven-package
product inventory were read back independently. Each row includes a real DM,
native Memory write/read, a temporary Workspace and write Grant, native file work
and an Assignment report, native background-child settlement, an owned-PID
stop/restart, retained Bot/DM identity/history/Memory, and a fresh post-restart
reply. Native `subagent-settled` messages, rather than expected strings copied
from prompts, establish child completion.

| Runtime      | Actual model route                       | Core behavior | Same-Profile restart |
| ------------ | ---------------------------------------- | ------------- | -------------------- |
| `0.2.0-rc.2` | `opencode-go/deepseek-v4.1-flash`, `low` | Passed        | Passed               |
| `0.2.1-rc.2` | `opencode-go/minimax-m3`, `off`          | Passed        | Passed               |
| `0.2.1-rc.3` | `opencode-go/minimax-m3`, `off`          | Passed        | Passed               |
| `0.2.2-rc.1` | `opencode-go/minimax-m3`, `off`          | Passed        | Passed               |

The first historical-RC2 attempt passed its model, Memory, Assignment and child
checks but exceeded the private harness's 30-second shutdown deadline. A later
PID/port audit confirmed exit without a forced termination. Its attempted restart
then timed out in the launcher's authenticated API check; both failures remain
retained rather than being rewritten as passes. The passing historical-RC2 row
above is a fresh-Profile alternate-route attempt. The first RC3 Go Flash attempt
also retained native `RATE_LIMIT`/429 overload and `prefill_cap_refused` events;
its task Bot was stopped through the owning Host before the alternate-route run.
No shared model setting was changed and no artifact was rebuilt between runs.

The [reviewable Web recovery evidence](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6705652793)
shows the unsent draft before and after actual candidate activation with the same
persistent browser context, origin, 1440-by-1000 viewport, Chinese locale and dark
theme. Bot/DM IDs, existing message IDs, configuration and the Human-API Memory
fixture survived. After activation the candidate produced a real reply, performed
native Memory read/write preserving the old marker, and visibly rendered the
reply without sending the draft. Privacy-reviewed matched crops were published
to R2 and read back with matching type, byte count and SHA256. This is a passing
recovery/retention result, not a passing published pre-upgrade model baseline.

Source-only supporting evidence: the four focused native-agent compatibility,
Orchestrator filesystem, native-child wake and Subagent-model test files passed
all 33 tests. Those tests do not substitute for the real Host rows. A
helper-created Profile pre-approves dependency builds, so these runtime checks do
not prove the separate no-preapproved-build fresh-install gate.

### A3: native idle-path results

These checks used the same frozen candidate on an isolated RC1 CLI Host with
`opencode-go/minimax-m3` (`off`), except for the deliberate model change below.
Native Session events, a read-only canonical Assignment query and direct tool
results distinguish the individual outcomes:

- **Idle first-step model switch passed.** After observing the Orchestrator idle,
  change the Bot route to `opencode-go/qwen3.8-flash` (`off`), then send a new
  Human DM. In Session `botharness-dcc55a68-e098-4f52-a233-d511ff4a7009`, native
  `request/context` sequence 62 identifies Qwen; the first assistant response,
  sequence 63, is turn 3, step 1 and identifies the same provider/model. This is
  actual request evidence, not only a configuration projection.
- **Active/idle direct-child pair passed.** Assignment
  `botharness-728917db-cb01-4e7d-bfa7-2ff45de612f5` had a valid Grant and Source
  authority. A direct `bot_subagent` call while `running + working` completed a
  real child. After canonical activity became `idle`, the same direct path
  refused with `tool-failed`: `Assignment approval execution authority is
unavailable`. The child inventory did not grow. No authority check was relaxed.
- **Idle background-child report delivery failed.** Assignment
  `botharness-9f78a99f-6b23-4d3e-806a-edc738ab825f` started child
  `95cb05c2-106e-48f5-86be-64fd9391e69b`, delivered a progress report, ended turn 1
  at 10:34:51.334 UTC and was observed idle while the child ran native `sleep 45`.
  On 2026-11-07 at 10:35:37.482 UTC, the parent **did wake** into native turn 2.
  It received the actual child relay at sequence 36 and native
  `subagent-settled` notice at sequence 49. Terminal `report_to_orchestrator`
  calls at sequences 38, 44 and 51 failed at results 39, 45 and 52 with
  `Assignment approval execution authority is unavailable`. Canonical activity
  remained `idle`, with only the earlier `progress` report retained; the bounded
  wait for a completed report timed out. Therefore native wake is observed, but
  end-to-end completion/report delivery is not qualified. The private harness
  exits zero after recording failed gates; its process exit is not a passing gate.

The suspected boundary is application execution-capacity reacquisition after a
native Inbox wake: `BotRuntime.#assignmentExecutionAvailable` requires
`running + working`, but the observed Assignment remains `idle`. This is a
source-supported diagnosis to investigate, not a demonstrated fix or an upstream
DSH root-cause claim. Preserve the passing idle direct-child refusal when fixing
the native wake lifecycle. A product fix requires a newly frozen candidate and
rerunning its affected qualification lanes; do not attach these results to new bytes.

The legacy direct-Orchestrator recovery/model-capture path remains covered only
by the source/adapter fixtures described above. This continuation does not prove
that historical retained-graph path on a real Host, create an unsupported graph,
or infer its coverage from the current Assignment/Orchestrator results.

### A4: Windows native carrier unavailable

The continuation runner is macOS ARM64, not an official Windows x64 Desktop
environment. No Windows native session was selected or operated. Feed
hash/signature, native renderer, settings, layout, real native DM, affected
Browser/Computer/IM paths, native restart and published-to-candidate Desktop
upgrade remain unverified. This is an environment handoff, not a Windows failure
or a pass inferred from Web/source tests. macOS Desktop remains deferred to the
Human and was not tested either.

### A5: disposition and next verification

The [outcome and portable next steps](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6705795133)
were posted and read back. The claim is handed off; #3477 remains open, with no
other active claim observed when `agent:active` was removed.

Qualification is **incomplete; do not promote** this candidate. The continuation
passes the four-runtime CLI matrix, same-Profile restarts, partial failed-baseline
Web recovery, idle first-step model switch and authorized/idle direct-child pair.
The strict published pre-upgrade baseline and idle-wake terminal report delivery
failed. No-preapproved-build fresh install, Windows native carrier, affected
Browser/Computer/IM paths and applicable visual/Human acceptance still need their
own evidence; macOS is explicitly Human-deferred.

Next: investigate the report-authority boundary without weakening idle direct-call
authorization; freeze new bytes if code changes; rerun A1–A3 as affected; then use
an authorized Windows runner for A4. The published `1.6.1` RC1 baseline failure
must remain recorded even if an explicitly scoped recovery lane is later accepted.
Retain the closed Profiles and private event evidence for reproduction. Owned
Hosts, browser/controller processes and listeners were stopped and checked; no
running environment is handed over. No product source change, commit, push,
release, publication or Site deployment was performed by this continuation.

### Scope limits

CLI Host and Web checks on this machine do not qualify either native Desktop
carrier. macOS Desktop remains explicitly deferred to the Human. Windows
Desktop, affected Browser/Computer/IM operations, visual/Human acceptance and
the failed published-baseline lane remain independent gates. No release of
`1.6.2`, npm publication, install-identity change or Site deployment is authorized
by this continuation.

This continuation changes qualification documentation only. The frozen product
bytes predate these documentation edits; there is no runtime hot-path change
and therefore no new performance benchmark or budget adjustment.

## macOS paired native upgrade continuation (2026-11-07)

[Outcome and reviewed evidence](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6706524521)
were posted and read back. This bounded claim is handed off; the independent
idle-lifecycle claim remains active.

The Human subsequently authorized **macOS Desktop instead of Windows** for this
continuation. This supersedes the historical macOS deferral above; Windows is not
required by this updated scope. It does not grant publication, release, push,
merge or Site deployment authority. Claim: #3477 comment `6706048063`, task
`codex/local/01a1b569-cbfe-7021-a6cb-6bab4688689c`.

### Exact artifacts and compatibility boundary

- Fresh candidate: `1.6.2-test.3477.3`, merged main
  `9d6956ae9d39348efad92caeeaee73cde64c626e`; the retained dirty patch was
  qualification documentation only. No runtime source changes were needed for
  the `presentAs` defect: main already supplies the native executor compatibility
  adapter. Published `1.6.1` bytes remain immutable and incompatible with RC1 on
  the reproduced path.
- Candidate manifest SHA-256:
  `642b7d5687ae0479bc196c5b1e882dbf1190faebe195e5ac4e5116c8f7ee55a3`.
  Release-plan SHA-256:
  `99cddc2812c527e88510ffcc0aa5db1e062321f709b9bd405a840c6895dd6302`.
  All 12 packaged artifacts were verified at freeze and after native installation.
  The pinned IM Provider source was `bb0c7956896f5f5845950a0707837cd7938a11b3`.
- Official macOS arm64 Desktop `0.2.2-rc.1`: official feed size and archive SHA-512
  matched (353501474 bytes); strict deep codesign and Gatekeeper assessment passed.
  macOS 26.7.1 (25G241), Chinese locale, dark appearance. The signed app bundle
  was not modified. The daily `/Applications` instance was not controlled.
- Supporting commands: frozen-lockfile install, build and prerelease preparation
  passed; native compatibility and Orchestrator file-tool tests passed (2 files,
  13 tests). The earlier `.2` four-runtime matrix is **not** rerun evidence for `.3`.

### Real paired upgrade result

The isolated official RC3 Desktop installed published `@botharness/tobs@1.6.1`
through its native Plugins UI, enabled it, and produced a real official DeepSeek
reply plus native `write` and `read` Memory operations. A native composer draft
was typed with keyboard input, not injected into local storage. Candidate packages
were staged in that same Profile; the exact owned Desktop and Host were stopped,
then the official RC1 binary launched with the **same Home and userData**.

After restart, the actual native renderer (`window.dshDesktop`) displayed the
restored DM. Canonical comparisons retained every previous message ID, Bot
identity and model plan; native Memory retained its old marker and the composer
retained its unsent draft, which was absent from sent messages. A fresh real
model request on RC1 executed native `read`, `edit`, `read`, then
`bot_send_message` (turn 3, call sequence 63/69/75/81). Both old and newly appended
Memory markers were read back. The new reply and retained draft were visibly
captured in the owned macOS window. Installed-candidate CLI `model-plan` and
`memory-file` independently succeeded against that native Host with JSON output.

This is a passing **paired DSH/product upgrade**, not a passing
`1.6.1`-already-on-RC1 baseline. The original strict failure is retained. Fresh
reply requests used the production authenticated API; the draft was typed in
the native UI. No claim of keyboard-sent DM coverage is inferred from the API.

### Retained failures and remaining gates

The run retains launcher failure from inherited `ELECTRON_RUN_AS_NODE`, hidden
native-window drive failures, an accidental plugin-disable/API-404 observation,
and a baseline snapshot assertion against Memory metadata rather than file body.
Each was recovered without changing the successful real-model facts. The
pre-restart window-frame capture shows the staged-update notice and transient
404s; it is **not** the healthy baseline screenshot. The healthy baseline uses
the earlier native webContents capture. A post-upgrade harness call initially
passed the wrong artifact-directory type before sending anything; the corrected
call passed. A CLI Memory probe incorrectly supplied a DM ID where a Bot ID was
required; its refusal is retained separately from the corrected successful call.

This bounded native upgrade does not qualify general/appearance/language changes,
Browser/Computer/IM operations, a fresh no-preapproved-build installation, physical
shortcuts, wider DPI/locale coverage or Human acceptance. The idle-lifecycle fix
has its own candidate and independent task; its results must not be attributed
to `.3`. Overall #3477 qualification remains incomplete and the issue stays open.

Owned RC1 Desktop PID 56189, its tracked descendants and Host exited; CDP 34830
and Host port 58988 were verified released before explicitly handing the native
slot to the independent idle task (its separate Home/userData/CDP 34930). The
daily Desktop PID 2740 remained alive. Closed Profiles and private logs remain
private evidence, not a running-environment handoff. No release was performed.

This documentation-only record has no runtime performance impact or budget change.

Privacy-reviewed native evidence was published through `pnpm evidence:publish`;
public bytes, sizes and hashes were read back before uploaded derivatives were
removed. The baseline is a native webContents capture; the after image includes
the owned macOS window frame. They are functional before/after evidence, not a
pixel-matched visual-regression comparison.

- [RC3 + published 1.6.1: real replies, Memory acknowledgement and typed draft](https://media.botharness.ai/pr/85113a48132d/25d52613d74b3dd54d71b9ff56176d00888b280102a20f9484b45c688c944d02.png)
- [RC1 + candidate .3: new real reply and retained unsent draft](https://media.botharness.ai/pr/9d6956ae9d39/40666ede6aa59814d5111749198ff989b5a6bc345b0fc2526bcb771f662166a8.png)

## Same-artifact 0.2.1 / 0.2.2 qualification (2026-11-07)

The Human requested real cross-generation testing for the future Tobs `1.7.0`
line and authorized a PR and merge after successful runtime checks, CI and review.
Claim: [#3477 comment 6707312069](https://github.com/BotHarness/DeepSeekBot/issues/3477#issuecomment-6707312069),
task `codex/local/01a1b569-cbfe-7021-a6cb-6bab4688689c`, run alias
`3477-dual-compat-20261107`. No release, npm publication or Site deployment is
authorized. The idle fix is already merged through #3677; no old patch was reapplied.

### One frozen candidate

`1.7.0-test.3477.compat.1` was built from merged main
`e6b9add0dcf3ba650371b001b00c1232bef4a328`. Dirty changes were qualification docs
and test-only additions; the product runtime source was unchanged. Provider source
remained `bb0c7956896f5f5845950a0707837cd7938a11b3`. The manifest froze all
twelve package digests before testing. The final audit reverified every tarball
and enforced read-only mode for all twelve packages and both manifests.

- Artifact manifest SHA-256:
  `83a7503ebeda1b0515a077ee2f8e3ddf3daa194125b000eeefad25a828d7f63b`.
- Release-plan SHA-256:
  `3fed458c58ca232bb02d4fd31dc9a7835d1a7d0087490b9f2236e036c559f297`.
- Core tarball SHA-256:
  `c7e3d0613ec9af70a29f34a4b4cab777cecb3d2941343c1b898b67264bbf8aea`.

The registry listed RCs, not stable `0.2.1` or `0.2.2` packages at verification
time. The exact tested versions below are the claim; this is not a promise about
untested stable or future builds. The admission floor remains `>=0.2.0-0`.

### Packaged runtime matrix

Each row installed the same frozen artifacts into its own Profile, produced a
real `opencode-go/minimax-m3` reply, wrote/read native Memory, completed an
Assignment with a real native background child and workspace file write, then
stopped/restarted the same Profile. Bot/Channel identity, all previous message
IDs and Memory were compared; a fresh post-restart native read and reply passed.
The AX launcher's scoped Go Session-header patch was retained as harness input;
the separate official native checks below used the unchanged signed apps.

| Exact DSH build | Tool API in installed upstream source | Reply / Memory / Assignment / child | Restart / retained data / fresh reply |
| --------------- | ------------------------------------- | ----------------------------------- | ------------------------------------- |
| `0.2.0-rc.2`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.1-rc.1`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.1-rc.2`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.1-rc.3`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.1-rc.4`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.1-rc.5`    | Legacy presentation / single-call     | Passed                              | Passed                                |
| `0.2.2-rc.1`    | Scoped executor / batch               | Passed                              | Passed                                |

No runtime adaptation was added: the existing compatibility module selected
`presentAs` only on the older Hosts and `setExecutor` on RC1. Installed RC1 tools
did not expose `presentAs`; installed 0.2.1 tools did not expose `setExecutor`.
The new regression tests cover legacy/modern model-install arguments, model
selection before integration, absent selection, refusal propagation and direct
call Agent/cancellation identity without cross-generation retries. Four focused
test files passed all 106 tests; the two compatibility files account for 14.
Build, root/mobile typechecks, lint, formatting and both changelog checks passed.

### Both-generation boundary, Web and native checks

On CLI Hosts `0.2.1-rc.3` and `0.2.2-rc.1`, actual request traces proved that an
idle Orchestrator's first step used the new Qwen route after a model change.
Both ran the active/idle direct-child pair and observed a running native child
while its parent Assignment was idle, followed by a later native turn and
canonical completed report. These were real-model checks, not only fixtures.

Independent headed standalone Web checks on both versions selected the task Bot
through the visible Channel row, sent a keyboard request, read native Memory and
rendered the real reply inside the viewport. Canonical Human/Bot messages and
zero page exceptions were retained. The installed candidate CLI independently
read the model plan and Memory, successfully executed an active direct child,
then refused idle execution (exit 1) with child count unchanged `1→1` on each Host.

Official macOS arm64 Desktop RC3 and RC1 used an isolated task Home/userData and
the same candidate. The candidate was manually staged while the owned Desktop
was stopped, then enabled through the native Plugins page: this is not an
installation-flow or no-preapproved-build proof. Both unchanged signed apps
passed deep/strict codesign and Gatekeeper checks. macOS 26.7.1, Chinese/dark;
actual native mouse/keyboard requests used official DeepSeek Flash at low effort.

- RC3 native parent ended Turn 1 at sequence 34, began Turn 2 at 36 and called
  its completion report at 43. Canonical progress/completion, child settlement
  and the actual DM agreed; installed CLI idle execution refused with count `1→1`.
- RC1 native parent ended Turn 1 at 35, began Turn 2 at 37 and called its
  completion report at 44. The same canonical/native/DM and idle-refusal checks passed.
- An actual RC3-to-RC1 binary restart with the same candidate/Home/userData
  retained the native Memory, model plan, old message IDs and keyboard-typed
  unsent draft. RC1 then read/edited/read Memory and produced a fresh real reply.
  After that retention checkpoint, only the synthetic task draft was deliberately
  cleared for the next keyboard journey; it was never submitted as a message.

### Failures, evidence and acceptance limits

Retain the two shared-preview snapshot timeouts and switch to the task-owned
local browser. The first standalone Web drive selected a hidden duplicate row
and timed out before sending a message; the corrected hit-tested row selection
passed in a separate recovery attempt. Native onboarding navigation also needed
observed retries before the task composer was selected. A synthetic draft-clear
shortcut removed only one character; the next send was refused by the harness
before typing, then explicit keyboard deletion passed. No failed action resent a
committed task or DM.

The first RC3 native collector saw a committed completed report before the
Assignment finished its turn and incorrectly required immediate idle state.
Separate later read-only evidence confirmed idle and the CLI refusal, without
repeating the task. Initial native screenshots retained an earlier scroll
position; they are not proof that the final marker was inside the viewport.
A separate same-candidate restart and actual latest-message navigation captured
the retained RC1 completion inside the viewport without another model request.
The original screenshots and failed collector remain private evidence.

Privacy-reviewed screenshots were published to R2 and read back with matching
SHA256, byte count and PNG type. These are separate carrier observations, not a
matched visual/performance comparison:

- [Standalone Web on RC3](https://media.botharness.ai/pr/e6b9add0dcf3/3fa446815324ce2749766692c333718148c47fb41cbff977291b640fc641f8ba.png).
- [Standalone Web on RC1](https://media.botharness.ai/pr/e6b9add0dcf3/977b605bb822ef1fdb7b2984b839efdef1c56de5b6a757e61f83cd225acc7c85.png).
- [Official RC3 native UI reply and Memory acknowledgement](https://media.botharness.ai/pr/e6b9add0dcf3/3f10dfa4695f0b724fa0864516d5eeb5cd175a8f2305c54864d99cb7f5efca0d.png);
  this frame does not show the later child completion.
- [Official RC1 native retained completion in the actual window](https://media.botharness.ai/pr/e6b9add0dcf3/fffba0c203373e11d4cc961777db346cafdb68900bd767d3989c43b5cfa08409.png).

All task-owned CLI Hosts, browsers/controllers and Desktop instances exited.
The final native read-only restart also exited and released CDP `35030` and its
Host port `49871`; matrix, idle and standalone Web ports were released. Profiles
and raw evidence remain private for qualification hold. The Human's daily
Desktop PID `2740` was observed alive and was not controlled.

This proves the named candidate's tested journeys across the two API generations;
it does not redefine the immutable published `1.6.1`-on-RC1 failure. The earlier
published-product paired upgrade remains separate evidence for candidate `.3`.
General native settings, Browser/Computer/IM, no-preapproved-build installation,
physical shortcuts, wider DPI/locale, Human acceptance and a future stable DSH
build remain unqualified here. Windows is outside the Human's updated scope.
No claim that all #3477 or product-release acceptance is complete is made.

The PR adds tests and qualification documentation only. It changes no runtime
hot path, performance budget, package version, admission floor or install identity;
therefore it requires no new performance benchmark. A future changed product
artifact must rerun affected gates instead of inheriting these results by version name.
