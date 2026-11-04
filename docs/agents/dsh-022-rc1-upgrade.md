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

The theme package remains separately pinned at its existing version. A DSH SDK
upgrade does not by itself qualify replacing that transformed product input.

## Evidence status

Qualification is **in progress**. Windows source checks are not a substitute for
frozen-product installation, real model behavior or macOS Desktop checks.

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

| Gate                                                              | Status                                   |
| ----------------------------------------------------------------- | ---------------------------------------- |
| Published Tobs on new RC                                          | Unverified                               |
| Frozen startup/API on minimum / previous / new RC                 | Passed on the three versions above       |
| Historical additional `0.2.1-rc.2` target                         | Unverified in this run                   |
| Linked RC1 real Web DM                                            | Passed on earlier linked build           |
| Frozen reply, Memory files, Assignment report, child completion   | Passed with qualifications above         |
| Idle native Subagent wake / idle model change / direct idle child | Unverified; direct-path refusal retained |
| Existing Profile upgrade and restart                              | Unverified                               |
| Windows native Desktop                                            | Unverified for this candidate            |
| macOS native Desktop                                              | Unverified; no macOS result supplied     |
| Product publication / website deployment                          | Not performed                            |

Do not promote the candidate or announce overall compatibility while required
runtime/platform rows remain unverified. On completion, replace these statuses with
the exact artifact identity, commands, results and reviewable evidence links.
