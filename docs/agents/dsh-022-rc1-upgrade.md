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

For the resumed qualification on 2026-11-07, the Human explicitly deferred macOS
testing to their own follow-up. The current merge gates cover Windows and Linux;
macOS remains unverified and is not a blocker for this explicitly narrowed merge
scope. This does not turn Windows or Linux evidence into a macOS compatibility claim.

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
in-scope runtime/platform rows remain unverified. The macOS row is deferred to the
Human for this merge by the explicit scope above. On completion, replace these statuses with
the exact artifact identity, commands, results and reviewable evidence links.
