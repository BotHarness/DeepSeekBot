# Model tiers: what each contributor model handles reliably

[中文](model-tiers.zh.md)

As of 2026-11-16. Measured by giving each model the same one-paragraph task in its own worktree from the same `main` commit, through `opencode run --auto` with a 30-minute limit, then grading with the repository checks and reading every diff. One run per model and task: read the results as "this tier can or cannot do this", not as a ranking.

## Merge gate by task tier

| Tier                                                                                                                           | Example used                                          | Who can take it                                                                                         | Merge gate                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| S: one localized bug with a clear symptom and expected result                                                                  | Call keyframe grid rows (7 frames must be 3+2+2)      | Every model tested, including the cheapest flash and haiku tiers                                        | CI green and repository rules pass: merge                                               |
| M: a multi-file tool or feature with an acceptance-criteria list                                                               | #4214 verification report quotes acceptance criteria  | DeepSeek v4-pro and flash both delivered; stronger tiers not yet measured                               | CI green, plus check every issue, criterion or link the diff cites, one by one          |
| H: any security change (fix or feature), or a property only a real browser, container or device can prove; H wins over S and M | #4184 Bot Browser exposes an unauthenticated CDP port | Neither DeepSeek tier was reliable; give it to the strongest tier and have a second strong model review | Never merge on CI alone; require evidence from the real runtime that the property holds |

A cheaper model is not automatically less faithful: on M, flash quoted real acceptance criteria verbatim while v4-pro invented its citations.

## Results

**S (16 models).** All 16 restored 1 / 2 / 3 / 2+2 / 3+2 / 3+3 / 3+2+2 / 3+3+2 / 3+3+3 with the related tests passing, no added comments and clean formatting. grok-4.7 finished in 3.6 minutes; claude-haiku-5-5, glm-5.3-flash and qwen3.8-flash in under 5. Eight models hit the 30-minute limit after finishing the change because they ran the full `pnpm test` and `pnpm lint`; `pnpm test:changed` (#4322) addresses that.

**M and H (DeepSeek v4-pro and flash).** Every mechanical check passed: source policy, `oxfmt`, lint ratchet, `tsc --noEmit` and the related tests. The defects only showed when reading the diff:

| Run        | Time     | Size                  | Found by reading the diff                                                                                                                                                                           |
| ---------- | -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M · v4-pro | 9.3 min  | 9 files, +480         | Example `criterion: #4224 AC-1…5` lines are fabricated: #4224 is the Create Bot modal and has no AC list                                                                                            |
| M · flash  | 28.1 min | 12 files, +760        | Criteria quoted verbatim from #4232–#4235; all three ACs covered; oversized                                                                                                                         |
| H · v4-pro | 27.2 min | 8 files, +888 / −227  | Local runtime moves to the pipe, but the agent-browser driver keeps `--remote-debugging-port=0`, and a test asserts it; container uses a `docker exec` pipe                                         |
| H · flash  | 21.2 min | 12 files, +600 / −118 | Local runtime moves to the pipe; container only adds `--remote-debugging-address=127.0.0.1`; adds a runtime `ws` dependency without the performance assessment; the regression skips without Chrome |

Neither H run said which paths stayed exposed. CI has no real Chrome, so green cannot show the port is unreachable.

## Guardrails that came out of it

| Problem seen                                    | Change                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Strong models run the full suite and time out   | #4322 `pnpm test:changed`                                                     |
| The no-comment rule surfaced minutes after push | #4331 source policy in pre-commit (0.2 s per commit)                          |
| Fabricated criterion quotes                     | Open: #4214, once built, warns when a quoted criterion differs from the issue |

## Not yet measured

Other vendors on M and H wait for the next OpenCode Go weekly quota. `run.sh` in the eval harness stops a run when the quota log reports a usage limit instead of idling for 30 minutes.
