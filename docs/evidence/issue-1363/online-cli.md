# Issue #1363: online CLI verification

Verified on 2026-10-11 with the built public `deepseekbot` executable, Windows, the pinned DSH 0.2.0-rc.1 Web Host and an isolated task-owned Profile. No browser message composition, local database edits or credential copying were used.

## Real model paths

| Creation source             | Model configuration/readback                                             | Exact committed DM reply     | Diagnostics                                              |
| --------------------------- | ------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------- |
| Blank                       | Applied Model Preset; Model Plan read back                               | One reply, one owned Session | Channel discovery/history, attention, Sessions, activity |
| Local Bot Zip               | Caller bytes uploaded to the existing import owner; Model Plan read back | One reply, one owned Session | Same queries                                             |
| GitHub `BotHarness/bot-seo` | Host cloned the public repository; Model Plan read back                  | One reply, one owned Session | Same queries                                             |

The model route was `deepseek-official/deepseek-flash`. Each request supplied a fresh Human message ID; completion required the matching receipt, `handled` state and at least one committed reply. Generated text was not compared verbatim. The three-source run retained its resources for inspection.

An additional blank run with `scripts/cli-smoke.mjs --cleanup` produced a real reply and completed the existing Deletion owner's preview/confirmation flow with `memory: retained`. The four earlier task-owned Bots were then explicitly deleted through that same flow; all four retained Memory directories were checked on disk. The preset and Memory remain in the isolated Profile.

## Failure and concurrency checks

- Two concurrent CLI DM submissions to one Bot returned their own exact receipt IDs and distinct committed reply IDs, with one reply each.
- An invalid launch token returned exit 1 and `host-unauthorized` before creation.
- After stopping the exact task-owned Host, online creation returned exit 1 and `host-unreachable`. It did not report a successful offline creation. The isolated Host is stopped.
- Focused automated coverage also checks unknown creation outcomes without mutation resend, known identity after a model/import-detail failure, preflight preset/archive refusal, caller directory preservation, ambiguous targets, bounded queries and deletion confirmation scope. A retry refuses a previously accepted Memory-erasing deletion.

## Reproduce

Build the checkout and launch a disposable Host with `scripts/dev-instance.mjs`. Select it with `DEEPSEEKBOT_HOST` and `DEEPSEEKBOT_HOST_TOKEN` or the documented token-file option. Keep these values private.

```bash
node scripts/cli-smoke.mjs --preset <host-preset-id> --zip ./qa.zip --git BotHarness/bot-seo --timeout 300
node scripts/cli-smoke.mjs --preset <host-preset-id> --timeout 300 --cleanup
```

The first command deliberately retains its owned IDs. Successful `--cleanup` deletes only that invocation's Bot identities, retains Memory and presets, and reports actual deletion results. A failed invocation retains remaining resources and reports any completed cleanup; an unknown create outcome must be inspected before another creation attempt.

## Evidence limits

These results qualify the internal online CLI chain. They do not qualify Client rendering, external platform Binding or actual IM reception/replies. Native Client diagnostics remain unobserved for this headless run. Full execution logs, streams, broader online management and five-platform integration remain later slices.

The Windows `pnpm docs:build` aggregate hit the existing `sync-slides.mjs` `spawnSync pnpm ENOENT` limitation; `pnpm --filter docs build` independently built all 450 pages. Linux CI supplies the complete repository workflow, including slide generation.

Local focused CLI/owner regressions passed. A broad Windows suite attempt was stopped after failures and is not counted as passing full-suite evidence; final full-suite acceptance uses Linux CI on the committed change.

Issue: [#1363](https://github.com/BotHarness/DeepSeekBot/issues/1363). Scope: [online CLI and DM](../../research/2026-10-11-cli-online-dm-scope.md). Decision: [ADR-0162](../../decisions/release.md#adr-0162).
