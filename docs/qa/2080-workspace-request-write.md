# Workspace request read/write — first tracer bullet (#2080)

## Qualified behavior

Clean runtime `18ad131d598f876478470b7858c5310f6c4eec44`, based on main `87340ee0eb3edd7bd1a2438b992a44af54048931`, DSH `0.2.1-rc.2`, Windows, Web + online CLI. A real OpenCode Go / DeepSeek V4.1 Flash reply proved model availability before the task.

| Check                                    | Result                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original main request-card defect        | Reproduced: authorization persisted read-only, revision 0.                                                                                        |
| New request Web confirmation             | Pass: writable Grant and linked Human decision commit together, revision 1.                                                                       |
| Existing read-only Grant                 | Pass: explicit confirmation upgrades the same Grant to revision 1.                                                                                |
| Original task continuation               | Pass in both runs: native Orchestrator write, native Assignment write, file contents read back, completed report and handled original Inbox item. |
| Duplicate Web/CLI decision               | Pass: one Grant identity/revision, existing canonical resolution, no added continuation.                                                          |
| Direct CLI request without model         | Pass through the same Harness tool with explicit joined Channel.                                                                                  |
| Revoked decision                         | Pass: coded `invalid-grant`; no permission resurrection.                                                                                          |
| Existing Grant panel/read/revoke journey | Pass after screenshot + ARIA review: sample import succeeds only while granted.                                                                   |
| Transaction failure                      | Production-owner tests roll back both new and legacy authority when the Channel commit fails.                                                     |
| Owner and reviewer boundaries            | Tests reject missing/guest Owner, cross-Bot/stale/unconfirmed requests and reviewer/saved-rule substitution.                                      |

The three UI captures and sanitized readback are in [the evidence folder](../../.github/pr-screenshots/2080-workspace-write/README.md). Full local traces, ARIA, diagnostics, failed attempts and file bytes remain private.

## Automated checks and limits

- 72 focused tests passed across nine files, including the adjacent #2290 origin regression; 18 Plugin tests and 19 approval-reviewer tests also passed.
- Type checks, lint, formatting and production build passed. The real runtime reported the clean commit above.
- The public docs build test passed. The existing `slides:build` wrapper cannot spawn `pnpm` on Windows; running its underlying open-slide build directly allowed the same Astro build test to finish.
- The full CI-selected related run was stopped after resource contention caused several 15-second integration timeouts and degraded Host response. It is not a full-suite pass. The Group-mention timeout and Memory clone LF/CRLF failure were reproduced on untouched main. A task-local LF Git fixture configuration avoids changing global Git settings. A serial rerun passed 80 of 86 tests and retained six 15-second Group/Tob timeouts; the Memory suite passed with process-local LF fixtures. These remaining timeouts are not claimed as passes, and no product/test timeout was raised. The affected test job subsequently passed on Linux CI at `bc85bfa` ([run 39269094822](https://github.com/BotHarness/DeepSeekBot/actions/runs/39269094822)); the local timeouts above remain recorded rather than relabeled as local passes. Current-head CI remains a separate gate.
- Initial browser drives preserved failures for the Windows native chooser, legacy rail selectors, exact directory-name matching and bounded temporary-directory listings. The successful runs use DSH's supported browse composition while the Host remains loopback-bound, and fresh synthetic directories that are visible within the listing bound.

## CI follow-up after updating main

The original static CI job failed only at Expo doctor: the mobile dependency matrix lagged SDK 58 patch recommendations. Latest main `cf4cc900a` incorporates #2312's first patch update; this branch takes that main and adds only the five further required patches (`expo`, `expo-camera`, `expo-file-system`, `expo-font`, `expo-image-manipulator`), with their lockfile and exact-version release-age allowances. No SDK-major upgrade, doctor exclusion, workflow skip or timeout increase is used.

The original run's affected tests, docs build, isolated-Host smoke and both mobile bundles passed. Final acceptance requires the checks on the current PR head to pass too; use [PR #2316 checks](https://github.com/BotHarness/DeepSeekBot/pull/2316/checks) for that head rather than transferring an earlier run's result.

## Human acceptance

Open the prepared **2080 验收** DM. Confirm read/write for its dedicated **BotHarness-2080-acceptance-…** directory. The Bot should continue without a second task message, create `hello-2080.txt` with `#2080 验收通过`, read it back and report completion.

This PR does not close #2080. Mobile controls, all folder-management entry points, the complete restart-recovery matrix and same-Orchestrator non-blocking-wait qualification are subsequent slices. Human QA, CI, merge and release remain distinct gates; merge has not been authorized.
