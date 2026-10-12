# Owner CLI private-input lifecycle qualification (#1416)

## Result and revisions

The actual built DeepSeekBot CLI submitted three generic confidential fields to a real PersonaBot's pending inline card. The Bot received references, used the existing protected `http-status-v1` CLI and returned `CLI-INITIAL 200` in the originating DM. Owner CLI replacement, cancellation, current-account status and local revocation use the same existing Host operations as Web Chat.

CLI implementation is committed in `0cef72a4`, integrated with the accepted Schedule slice in `a01a058a8704f3860aa77682d7ac4a29e6f0c150`. The initial lifecycle used the built CLI source subsequently committed in `0cef72a4`; the final pending-card cancellation used the rebuilt integration revision. The retained task-owned Host ran `fadc565729f407c3c16c2ad130e8ffba61604ea7`, pinned DSH `0.2.0-rc.1`, on an isolated opt-in protected Profile. This verifies CLI compatibility with those existing Owner RPCs, rather than claiming the Host was restarted on the CLI revision. The live model was `opencode-go/deepseek-v4-flash`.

## Actual lifecycle

| Action                                                  | Observed result                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| CLI `send` requests `endpoint`, `api_key`, `api_secret` | Real `ask_secret` card, generic declarations discoverable through `channel-messages`              |
| `ask-secret-submit --values-stdin`, synthetic A         | `{accepted:true}`; Bot replies `CLI-INITIAL 200`                                                  |
| Request and account status                              | Both configured; output contains only status                                                      |
| `ask-secret-replace`, then `ask-secret-cancel`          | New blank card ID, cancellation accepted; original account stays configured                       |
| Another replacement, private stdin B                    | Accepted; original account status superseded, new card configured                                 |
| Real Bot reuses current references                      | `CLI-CURRENT 200` in the same DM                                                                  |
| `ask-secret-revoke`                                     | Accepted; stopped 0, already completed 1, uncertain 0                                             |
| Both configured cards after revoke                      | Request settlement stays configured; current access is revoked                                    |
| Real Bot attempts revoked references                    | Static grant refusal; fixture request count unchanged                                             |
| Separate pending request, CLI cancellation              | Accepted; native `ask_secret` result cancelled with empty references; Bot replies `CLI-CANCELLED` |

The controlled loopback fixture on port 31388 started this slice at 4 requests / 3 authenticated from prior qualification. Initial A and current B added exactly two authenticated calls, ending at 6 / 5. Revoked consumption did not add a request. Its response deliberately echoes synthetic canaries; the qualified trusted CLI discards response body and headers. Existing remembered execution approval remained in effect; the native projection records approval and grant refusal. This run did not revoke a running use: it checks that the CLI returns the owner's bounded stop report; running-use stopping was qualified in #1382.

The first `send` deliberately had a two-second deadline so another CLI invocation could fill the pending card. It returned a receipt and `reply-timeout`; `send-status` later read the exact committed reply without resending. One task-local QA lookup incorrectly chose a cancelled replacement card from newest-first history and received a safe refusal. After inspecting card IDs/status, the helper submitted to the returned new replacement ID. No CLI mutation was automatically retried.

## Confidential boundary and evidence

Original field JSON arrived only on the subprocess's stdin, never in command arguments or ordinary Chat. Owner credentials entered the child environment privately. The CLI projected only validated statuses, replacement UUID, acceptance and nonnegative safe-integer stop counts. Malformed success payloads and Host refusals are covered by authenticated-carrier tests; neither their arbitrary fields nor confidential input are forwarded to stdout.

- [CLI lifecycle](evidence/1416/cli-lifecycle.json): allowlisted actual command results, same-DM replies and fixture counts.
- [Native Session projection](evidence/1416/native-session-events.json): 24 selected events from the qualification window, read from 288 native events. Human/assistant text, reasoning, commands, HTTP payloads and paths are omitted.
- [Acceptance summary](evidence/1416/acceptance-summary.json): cumulative passive wire capture has 44 actual model request bodies available, zero unavailable and zero raw/base64/URI canary matches. Thirty bodies preceded this CLI slice.

The retained Profile scan read 207,359 files, 289 Session events, 3 persisted request headers, 27 tool results and two retained native Spill files, with zero violations. It ran after the revoked-reference refusal and before the last pending-card cancellation. Native credential storage contained synthetic originals and was deliberately excluded from model/history leakage destinations. Current retained Host logs were included; earlier overwritten launcher logs cannot be reconstructed. The native export and scan are snapshots taken at slightly different times. Later cancellation results are included in the CLI journal and native projection; the scan is not claimed to cover later writes. Full Sessions, raw wire bodies, authentication and instrumentation remain local. These counts establish only the inspected synthetic paths.

## Validation and runnable review

Local lint, formatting, typecheck and build passed. Three focused files (`bot-live-cli`, `private-inputs`, `bridge-rpc`) passed 60 tests. Separate Spec and Standards source reviews found zero findings against `71aa4d06...a01a058a`. Exact PR-head Linux CI is tracked on the PR.

Use the [private-input CLI guide](../dev/guides/private-input-cli.md) and its loopback lifecycle fixture. Select the authenticated Owner carrier, request a real Bot card, read its ID/declarations through `channel-messages`, and feed trusted field JSON to `ask-secret-submit --values-stdin`. Replace using the configured card ID, then submit to the returned ID. Query request and account statuses separately; revoke and ask the real Bot to consume the now-invalid references once. Inspect fixture counts to establish refusal before service access.

There is no Client component or styling change in this PR. A matched Web-state screenshot pair could not be completed: the collaborative preview's existing card status remained “Checking request”, two navigation attempts timed out, and a fresh preview stayed “Loading messages” while CLI history/status and the Host remained reachable. The final pending card was cancelled rather than left waiting for capture. Existing accepted Web captures remain in #1408/#1413; they are not relabelled as this PR's before/after evidence. Reviewers can reproduce the same inline states with the guide in their authenticated Web tab. CLI before/after contracts are shown directly in the PR.

This run makes no Linux-server, credential-consuming MCP, production deployment, external email or production IM receiver claim. Those remaining consumers and server qualification stay with the original Project slices.
