# Private MCP references: local qualification for #1384

This records a real PersonaBot using generic Web private input, native Credentials Service,
existing execution approval and the new fixed MCP authenticated-status Consumer on pinned
DSH `0.2.0-rc.1`. The Host ran on Windows; ordinary execution remained in isolated Linux
containers. Linux-server qualification remains #1386.

## Observable path

The Bot requested three private fields in its DM: endpoint, API key and API secret. The Owner
filled the existing Web card with synthetic values, then accepted the existing execution
approval carrying only opaque references. The same Bot reported HTTP 200 in that DM; the
controlled loopback service independently confirmed the key and secret. Its response deliberately
echoes originals and a base64 secret, which never enter the MCP status result.

The application-defined Consumer uses the pinned native `createMcpToolDefinition` adapter and
official MCP SDK Client. Within the authorized Host callback, an immutable private stdio server
receives actual MCP initialize, tools/list and tools/call exchanges. This does not rename a CLI
call as MCP or replace the outer ToolRuntime invocation with plaintext. One fixed operation returns
only status; arbitrary configured MCP servers do not receive credential grants.

| Case                                        | Native call / result sequence | Observed result                                       |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Approve once                                | 35 / 38                       | Authenticated HTTP 200                                |
| Reject                                      | 60 / 63                       | No additional fixture request                         |
| Existing broad allowance                    | 78 / 81                       | Authenticated HTTP 200 without another card           |
| Wrong account                               | 108 / 111                     | Host refusal before a fixture request                 |
| Fixture version B rejects stored A          | 128 / 131                     | Safe HTTP 401 and static repair advice                |
| Broad allowance after Host restart          | 152 / 155                     | Authenticated HTTP 200                                |
| Unsupported extra command                   | 173 / 176                     | Explicit Host refusal before resolution/execution     |
| First active stop                           | 182 / 185                     | Consumer stopped; Bot misinterpreted cancellation     |
| Active stop with clarified failure contract | 224 / 227                     | Consumer stopped; Bot says remote effects are unknown |
| New use after revocation                    | 244 / 247                     | Host refusal before a fixture request                 |
| Wrong Bot, separate Session                 | 30 / 33                       | Actual Host grant-scope refusal                       |

The first wrong-Bot prompt made the model decline without a Tool call. That is not Host-boundary
evidence; a subsequent explicit synthetic negative test exercised the actual Host guard. Ordinary
`mcp__linux_demo__workspace_probe` also worked: `/workspace`, uid 65534, no Host credential
environment. Its optional `proof.txt` marker did not match the exporter's expected proof string,
so the exported `linuxWorkspaceProof` is false; the cwd, UID and environment checks are true.
The real Bot generated large public-only output with ordinary Linux Shell, creating
actual formatted-result and Subprocess Spill for inspection.

The first active-stop test revealed ambiguous safe failure wording: despite the fixture recording
an entered request and disconnect, the Bot said no HTTP request had happened. The revised tool
description and static failure explicitly say that a remote request may already have started and
remote effects are unknown. A fresh grant and second actual active-stop test reproduced `stopped: 1`,
`completed: 0`, `uncertain: 0`; this time the Bot reported uncertainty without retrying. Stopping a
local consumer does not roll back remote effects. The fixture recorded six total requests, five
authenticated, four completed and two disconnected.

## Model, history, logs and Spill

The passive wire probe observed 46 actual selected-route model request bodies. All 46 were
available; raw, base64 and URL-encoded synthetic canary matches were zero. It records only body
availability, byte counts and match counts, never payloads or authentication headers. Unsupported
routes or encodings remain unqualified.

An earlier full Profile scan read 207,395 files and 240 native Session events with no matches.
The final runtime scan, after the corrected stop and revoked-use tests, read 1,110 runtime files,
322 Session events, four persisted request headers, 31 tool results and two actual retained native
Spill files, also with no matches. It excludes the installed `ax-cli` code already read by the
earlier full scan. Both exclude `.credentials.yaml`, the expected secret authority; originals
were present there. Final runtime coverage includes native Sessions, Channel/database data,
approvals and retained Host logs. Earlier launcher logs were overwritten on restart, so complete
historical log coverage is not claimed. Later Human-QA writes are outside these snapshots.

The public Session exporter retains only validated references, field declarations, status,
approval facts and bounded execution proofs. It omits Human/assistant text, reasoning, commands,
paths, HTTP payloads, approval reasons and raw errors. The main projection retains 83 selected
events from 278 native events; the wrong-Bot projection retains nine from 44. Full native Sessions
and raw diagnostic artifacts remain local.

- [Main native Session projection](evidence/1384/native-session-events.json)
- [Wrong-Bot native Session projection](evidence/1384/wrong-bot-session-events.json)
- [Qualification aggregates and limits](evidence/1384/qualification-summary.json)

## Checks, provenance and review

Initial runtime cases and screenshots ran `ad4e09f9`; explicit unsupported-parameter checks ran
`2bffd6c7`; the clarified cancellation and revoked-new-use tests ran `ffef9348`. Their committed
documentation/export follow-up does not change those Host source files. Screenshots in the PR show
the same initial card before private submission and the same DM after approved MCP 200, at
1280 × 800, dark theme and English locale. They document an actual interaction lifecycle, not a
base/head styling comparison; this PR changes no Client component or styling.

Local lint, formatting, typecheck and build passed. Focused native-MCP/export coverage passed
15 tests; shared credential/consumer coverage passed 37 with one skip. Actual Docker qualification
passed four tests for ordinary isolated MCP and attempted Host secret extraction. Separate Spec
and Standards reviews found no blocking source findings. Nonblocking review advice concerns shared
HTTP policy and an internal cancellation error currently identified by its stable static text.

The full Windows suite was attempted and stopped after repeated cleanup permission failures and
timeouts; it did not pass. A separate `model-usage-query` run reproduced 13 temporary-directory
`EPERM` failures on both this branch and the identical merged base tree. This establishes that
specific baseline limitation, not that every failure in the interrupted suite is pre-existing.
The PR tracks exact-head Linux CI independently; local focused checks are not a full-suite claim.

The first Linux CI run (`38141209431`) passed 4,063 tests with 13 skips and failed two tests.
The existing dynamic-schema fixture passed a bare Context instead of a native Agent Scope,
which the new Consumer correctly refused. It now creates a native Scope with the inherited Tool
Registry. The CLI receipt-timeout test raced its authenticated handshake against a 100 ms wall
deadline under full-suite load; a standalone local run passed. It now advances the test clock
only after the authenticated status-poll request reaches its handler, preserving real HTTP/authentication and checking that
the mutating send and status poll each happen once. No production guard or CLI behavior changed.
The corrected four-file focused run passed all 44 tests; the PR tracks the subsequent full CI.

Use the [runnable MCP guide](../dev/guides/private-input-mcp.md) for a new Bot/private card and the
controlled service. The [ADR](../adr/0170-private-mcp-consumption-uses-fixed-server-and-bounded-projection.md)
states the trusted server/process boundary, output admission and rollback limits. Human review of
this new consumer remains pending. No production deployment, external email or production IM
receiver test was performed.
