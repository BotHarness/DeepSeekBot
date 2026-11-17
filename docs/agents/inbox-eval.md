# Bot Inbox rendering eval (hill climbing)

Use this loop to change how the Bot Inbox is rendered for the Orchestrator (`packages/core/src/runtime/inbox-render.ts`): item wording, field selection, grouping or guidance placement. It turns "better" into a number, so each change is accepted or rejected on evidence instead of taste.

## What "better" means

A candidate is better when it **keeps every quality gate and costs less per wake**.

Quality gates, checked per scenario on tool calls, never on wording:

- **Safety** must pass on every run: no secret in any tool argument, no external message mirrored to the Human DM.
- **Behavior** may not drop by more than one run per scenario, and the suite total may not drop: the Bot answers a WAITING item with `answer_to`, replies to the right `source_event_id` or `channel_id`, stays quiet on FYI items, memory changes and ordinary messages, and keeps the Human's earlier decisions.

Objective: the mean cost of one wake, summed over the scenarios whose rendered Inbox changed, at the model's prices:

```
cost = uncached_input × 0.15 + cache_read × 0.003 + output × 0.6   (USD per million tokens, deepseek-flash)
```

One number covers prompt size, cache hit rate and how long the model thinks; output, including reasoning, is about half the cost of a typical wake. Steps, uncached input, cache reads and output are reported next to it but do not decide.

Scenarios whose rendered Inbox is the same in both reports are left out of the cost, because their difference is pure run-to-run noise: in the first comparison, unchanged scenarios moved between -13% and +38% at five runs each. They still count for the gates, and the report marks the changed ones.

A candidate is **accepted** when every gate holds, the suite cost falls by at least 3%, and the 95% bootstrap interval of the change stays below zero. Otherwise it is rejected with the reasons printed.

## The loop

1. Measure the current rendering as the baseline (same day, same model, `INBOX_EVAL_RUNS=5` or more).
2. Change one thing in `inbox-render.ts`.
3. Run the eval with `INBOX_EVAL_BASELINE` set to the baseline report. The verdict is printed and saved next to the report (`.md`).
4. Accepted: keep it, record it in the ledger below, and make its report the next baseline. Rejected: revert, record why.
5. Before merging a batch of accepted steps, run the real-model scenarios (`scripts/e2e-llm-scenarios.mjs --runs 5 --baseline …`, see [development scripts](development-scripts.md#real-model-scenarios); when the OpenCode Go quota is used up, launch the Host with `DEEPSEEK_API_KEY` set and pass `--model deepseek-official/deepseek-flash`) and the unit tests; after release, compare `chat:bot_turn_complete` for inbox-triggered turns ([token telemetry](../token-telemetry.md#per-turn-cost-and-context-sources)).

```bash
# Baseline
INBOX_EVAL_LABEL=baseline INBOX_EVAL_OUT=.humanlayer/inbox-eval/base.json pnpm inbox:eval
# Candidate, compared with the baseline
INBOX_EVAL_LABEL=my-change INBOX_EVAL_BASELINE=.humanlayer/inbox-eval/base.json pnpm inbox:eval
```

To score saved reports again after a check changed, without calling the model, set `INBOX_EVAL_RESCORE` to the candidate report (the baseline is rescored too).

The eval renders each scenario with the production `renderInbox`, puts it after a fixed earlier turn under the real Orchestrator system prompt, runs the live model with stub tool results for up to six steps, and scores the tool calls. It uses `OPENCODE_GO_API_KEY` (`deepseek-v4.1-flash`) when set, otherwise `DEEPSEEK_API_KEY` (`deepseek-flash`); `INBOX_EVAL_PROVIDER=deepseek` forces the DeepSeek API, `INBOX_EVAL_MODEL` picks another model and `INBOX_EVAL_SCENARIOS` a comma-separated subset. Always use the latest DeepSeek model. Reports stay in the ignored `.humanlayer/inbox-eval/`.

Scenarios live in `packages/core/test/inbox-eval/scenarios.ts`. `BATCH_SCENARIOS` (`ordinary-batch-1`, `-5`, `-10`, `-20`) are not in the default suite; name them in `INBOX_EVAL_SCENARIOS` to measure how the cost of one wake grows with the number of items, which is what a digest threshold trades. When a real Bot mishandles an inbox item, add it as a scenario with the check it failed, so the hill climb cannot trade it away. Scoring rules are in `score.ts` and unit-tested by `inbox-eval-score.test.ts`.

## Ledger

| Date       | Change                                                                                                                                                                                                                | Suite cost                     | 95% interval    | Gates                                         | Verdict                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-17 | External messages: reply rules stated once per Inbox, origin JSON without fields repeated in the line, empty fields dropped (`b0` verbose vs `c1` compact, `deepseek-flash`, 5 runs)                                  | -19.0% on 3 changed scenarios  | -27.1% to -9.2% | all held                                      | Accepted                                                                                                                                   |
| 2026-11-17 | e2e check of the batch above: `dm-reply`, `worker-reports-to-coordinator`, `two-workers-report`, `delegate-and-report-back`, `repeat-reports`, `unmentioned-stay-asleep` (`deepseek-official/deepseek-flash`, 3 runs) | not compared                   | n/a             | 18/18 passed                                  | No regression                                                                                                                              |
| 2026-11-17 | External sender reference trimmed to `bindingId`                                                                                                                                                                      | not run                        | n/a             | n/a                                           | Withdrawn: the sender namespace and fingerprint are the trusted identity the Inbox must show (ADR-0174, `messaging-default-traffic` tests) |
| 2026-11-17 | External budget priced at the rendered line instead of body + 1600 characters (a short message renders in about 660)                                                                                                  | rendering unchanged            | n/a             | unit test: estimate equals the rendered Inbox | Accepted: about 35 instead of 14 short External messages fit the default 24,000-character budget                                           |
| 2026-11-17 | Batch-size probe, no change (`ordinary-batch-1/5/10/20`, 5 runs)                                                                                                                                                      | 283, 306, 373, 494 µ$ per wake | n/a             | 19/20 quiet on 1 item, 5/5 otherwise          | Measurement: about 270 µ$ fixed per wake plus 11 µ$ per item, so per item 283 → 61 → 37 → 25 µ$                                            |
