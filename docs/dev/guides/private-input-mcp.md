# Private credential references in one qualified MCP consumer

The opt-in protected Profile now exposes `mcp__private_status__authenticated_status` to an owning PersonaBot Orchestrator. It reuses the generic Web private-input card, Owner CLI submission, native Credentials Service, Bot/account authorization and existing execution approval. This path qualifies one fixed MCP status operation; arbitrary configured MCP servers do not inherit secret access. Ordinary nonsecret MCP still runs through the native MCP Client Plugin in the isolated Linux Execution World.

Start a dedicated local Profile as described in the [private-input CLI guide](private-input-cli.md), with `privateInputExecution: true`, telemetry disabled and Docker's pinned Linux image available. Build this revision, then stop and restart only that task-owned Host with `scripts/dev-instance.mjs`. Do not enable the trial on a production/shared home or downgrade a credential-bearing Profile to an unfenced binary.

Start the synthetic service:

```powershell
node scripts/ask-secret-lifecycle-fixture.mjs 31391
```

In a real PersonaBot DM, send:

```text
Call ask_secret for account mcp-demo, purpose Generic MCP acceptance,
with required endpoint labeled Private URL, api_key labeled API key,
and api_secret labeled API secret. After Owner private submission,
call mcp__private_status__authenticated_status using that same account
and the returned references. Report the HTTP status in this DM.
```

Fill the existing Web private card with synthetic values:

| Field       | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Private URL | `http://127.0.0.1:31391/status?marker=SYNTHETIC-1380-url-A` |
| API key     | `SYNTHETIC-1380-key-A`                                      |
| API secret  | `SYNTHETIC-1380-secret-A`                                   |

Submit privately. Inputs must clear; ordinary Chat must contain only configured status. The subsequent existing execution approval must show the account and `private:<UUID>:<field>` references. Approve once and confirm the Bot reports HTTP 200 in the same DM. `GET /evidence` on the fixture independently confirms authentication. Its body/header deliberately echo originals and a base64 secret, which the MCP consumer discards. Owner CLI may submit the same JSON through `ask-secret-submit --values-stdin`; never place values in command arguments or ordinary messages.

The actual operation uses a private SDK stdio connection to an immutable Host program: MCP initialize, tools/list, then tools/call with the three selected originals. Those private transport arguments never replace the model-facing invocation or become a nested Session call. Only a bounded status result reaches the native MCP adapter, logs and model. The fixed server has no read/eval, arbitrary command/header/environment, response-body or resource capability. Refusing output extensions is admission of a known status protocol, not redaction of arbitrary text.

Repeat with the same references: no new private card is needed. Reject an invocation and check the fixture request count stays unchanged. Exercise the existing **Always allow all opaque tools in this scope**, including its native confirmation; this is execution convenience, not a grant for another Bot/account. Wrong Bot, wrong account, revoked or replaced grant references must fail before a fixture request. A remote service can reject otherwise-current credentials with HTTP 401/403. Unsupported server/command/header parameters must be rejected. Use the ordinary `mcp__linux_demo__workspace_probe` from the [CLI guide](private-input-cli.md) to verify ordinary MCP still works without private input.

For error qualification, switch the fixture to version B while the account retains A. The result must contain only HTTP 401 and static replacement/remote-authorization repair advice. Restore A afterward. For active-use stop, set a 9000 ms fixture delay, start a reference call, observe its request, then revoke the configured card through Web or Owner CLI. Verify the bounded stop summary and fixture disconnect. The static cancellation result must say a remote request may already have started and remote effects are unknown; stopping does not undo completed effects. Restore delay zero afterward.

Inspect actual model requests with the passive `ask-secret-wire-probe.mjs` on the selected route, keeping synthetic canaries outside DSH_HOME. Scan native Sessions, approval/Channel history, logs and retained Spill with `scan-private-input-evidence.mjs`. The public exporter retains only allowlisted reference/status/approval facts; full Sessions and raw transport traces stay local. A scan proves its stated canaries, capture availability and snapshot coverage, not arbitrary future providers or transformed exfiltration. See [ADR-0170](../../adr/0170-private-mcp-consumption-uses-fixed-server-and-bounded-projection.md) for the trusted-server and process boundary.
