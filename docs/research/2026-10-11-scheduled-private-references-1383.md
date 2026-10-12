# Scheduled private references: local qualification for #1383

This records a real PersonaBot using the existing Bot Schedule, native Session, Web Chat,
Credentials Service and protected `http-status-v1` CLI on pinned DSH `0.2.0-rc.1`.
It qualifies the opt-in protected Profile on a Windows Host with Linux containers;
Linux-server verification remains #1386. The accepted #1382 UI is unchanged.

## Observed behavior

The real Bot requested three generic confidential fields in its DM. The Owner submitted
synthetic values through the inline Web card and approved the first CLI call using the
existing broad execution allowance. Its authenticated status was 200 in the same DM.
The Bot then created a one-shot Bot Schedule containing opaque references and an explicit
destination DM. The exact isolated Host was stopped and restarted before its due time.

| Case                                                                | Observed result                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Naturally planned firing after restart, 09:43 UTC                   | Authenticated 200 in the original DM; no new card        |
| Missing account, existing Run now path                              | Static Owner-action failure in the DM; no card or waiter |
| Fixture changed to version B while references still point to A      | Safe HTTP 401; response body and headers omitted         |
| Owner replaced the account, then ran saved A references             | Refused before another fixture request                   |
| Schedule requested current configured references                    | Reused B without a card; authenticated 200               |
| Owner revoked B, restarted Host, then ran current-reference request | Owner-action failure without a card                      |
| Saved A references after that restart                               | Refused before another fixture request                   |

All seven Schedule firings reached canonical Bot Inbox state `handled`: one planned and
six explicit manual firings. There were only two private cards: the initial interactive
request and the explicit Owner replacement. The controlled service recorded four requests,
three authenticated. This slice does not retest #1382's active-consumer interruption.

The fixture deliberately echoes raw and base64 synthetic values in its response. The fixed
trusted CLI returns only status. Ordinary Agent-controlled Shell runs in its isolated Linux
Execution World and receives no Host secret environment. This does not qualify arbitrary
CLI commands or MCP consumers to consume references.

## Model and persistence evidence

The process-local passive request probe observed 30 actual model POST request bodies;
all were available and none matched the raw, base64 or URL-encoded synthetic canaries.
It records counts and body availability, never request contents or authentication headers.
Unsupported body overrides are incomplete evidence, not a clean result. This qualifies the
observed model adapter and canaries, not all encodings or providers.

The final scan read 212 native Session events, including three persisted request headers
and 19 tool results, and scanned the Profile's ordinary files, Channel/database data and
two actual formatted-result/Subprocess Spill files. No canary violations were found.
The Spill was created by a real Bot's ordinary large-output CLI call using public text.
An earlier scan confirmed synthetic originals in the native credential store; after
revocation and startup cleanup the final scan no longer found all originals there.
The native credential store is an expected secret authority and is excluded from ordinary
file leakage scanning.

Two retained Host launcher logs were also scanned with zero matches. The intervening
launcher log was overwritten on restart, so complete historical Host-log coverage is not
claimed. The Session export read 208 events at its earlier capture time and retains only
53 allowlisted event projections. It omits private chats, reasoning, commands, paths,
request/response bodies, approval reasons and raw errors. Full native Sessions and raw logs
remain local.

- [Allowlisted native Session projection](evidence/1383/native-session-events.json)
- [Schedule, fixture, request and scan aggregates](evidence/1383/schedule-summary.json)
- [Before: unattended request leaves a card](evidence/1383/schedule-before-dark.png)
- [After: status and Owner-action outcomes](evidence/1383/schedule-after-dark.png)

The captures use separate baseline and candidate Profiles at 1280 × 800, dark theme and
English locale. Opaque IDs, avatars and prior history differ. The baseline runs the merged
#1408 runtime; the waiting card was cancelled after capture. An earlier reused baseline
Profile had unavailable protected execution, so it was not used as the before evidence.

## Checks and remaining review

Local lint, formatting, typecheck and build passed. Six focused files passed 62 tests;
three additional accepted/refused/throwing steering tests passed in an isolated run.
Review found and fixed rejected-steering interaction authority and unsupported request-body
override evidence. Windows full-suite and broad steering-file attempts had timing failures;
the full run was stopped and is not reported as passing. Linux CI is reported separately on
the exact PR head.

Use the [runnable guide](../dev/guides/private-input-cli.md#scheduled-reuse-after-host-restart-1383)
to repeat the flow with synthetic values. Human QA remains pending on #1413. No production
deployment, server changes, external email, production IM receiver or credential-consuming
MCP qualification took place.
