# CLI online management and headless debugging

Investigated: 2026-10-11, Asia/Tokyo. Application baseline:
[`51058d540f52de45e687f4274f3d16dd701dd0d5`](https://github.com/BotHarness/DeepSeekBot/commit/51058d540f52de45e687f4274f3d16dd701dd0d5).
This is source research and design input, not an implementation or new runtime
qualification. No Host was started and no credentials were read. Recommendations
below require Human decisions before implementation.

The DSH Plugin skill Context and Decision Tree were read completely. The primary
seam is a CLI Consumer of existing application-defined Host Service commands and
queries, through the DSH-native authenticated Connection/API Gateway. Host modules
remain Providers and durable owners; the CLI does not acquire a second live
database writer. Product terminology follows [CONTEXT](../../GLOSSARY.md).

## Findings: current behavior

**Online management is mostly a missing CLI adapter, not a missing Host
capability.** Bot, model, Memory, Channel, Workspace Grant and Schedule operations
already exist on the same remote Service used by the Client. The offline CLI
currently rejects `--host` for those operations rather than forwarding them.
[`bot-create-cli.ts:2384`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/bot-create-cli.ts#L2384),
[`rpc.ts:1145`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/rpc.ts#L1145).

There is already one exception useful for debugging: `channel-messages <channel>`
selects the live carrier when `--host` or `DEEPSEEKBOT_HOST` is supplied. It returns
committed messages and a Channel revision, supports `--limit` and `--before`, and
does not require browser interaction. Without a Host target it selects the
offline store, which still requires the profile writer lease. Other currently
offline verbs do not become online merely because that environment variable is
set. [`CLI dispatch`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/bot-create-cli.ts#L2384),
[`live message query`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/cli-live.ts#L344),
[`Host message query`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L2873).

The offline reader also mounts the full operational-database owner, so even
`list` refuses a profile mounted by a live Host. The owner acquires an OS-backed
SQLite `BEGIN IMMEDIATE` lease on the dedicated writer-lock database; the
diagnostic lease metadata contains process/instance identity, not an authenticated
Host endpoint. This is not a stale timestamp lock that CLI discovery may bypass.
[`openRegistry`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/bot-create-cli.ts#L505),
[`lease implementation`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/database/owner.ts#L464),
[`lease test`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/test/bot-create-cli.test.ts#L758).

## Findings: verb-to-owner mapping

The following are already registered remote methods, not proposed new endpoints.
Use the typed [Bridge Service contract](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/rpc.ts)
and its [Host implementation](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts).
“Adapter” means CLI argument/result adaptation and focused verification are still
needed; it does not mean behavior is guaranteed identical without that work.

| Existing offline CLI behavior                                              | Existing online owner entrance                                                               | Remaining work or qualification                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`, `show`                                                             | `list`, `get`                                                                                | Adapter; live detail includes process state while offline detail cannot.                                                                                                                                               |
| Blank `create`                                                             | `create` → PersonaBot Registry                                                               | Adapter for plain creation. CLI `--preset` means applying a Model Preset, whereas the legacy `create.preset` field only writes a string; forwarding it unchanged is incorrect.                                         |
| `create --from-git`                                                        | `createFromGit` → Registry staging/clone                                                     | Adapter; cloning uses Host Git/environment/credential context, not the caller's remote filesystem or local Git login.                                                                                                  |
| `create --from-zip/--from-dir`                                             | Existing exact authenticated `/api/botharness/bot-zip/import` → `registry.createFromFiles`   | Upload bytes; a directory must be packed locally. Current import does not expose all CLI name/tag/bio/preset overrides, so parity needs a small owner-level contract extension or explicitly reported follow-up steps. |
| `update`, `pause`, `resume`                                                | `update`, `pause`, `resume` → Registry plus existing runtime reactions                       | Adapter; preserve Host cancellation/resume reactions. Current commands are not a promise of full quiescent archiving from the target architecture.                                                                     |
| `model-presets`, `model-preset-create`, `model-preset-apply`, `model-plan` | `modelPresets`, `modelPresetCreate`, `modelPresetApply`, `modelPlan`                         | Adapter; online validation uses live catalog/credential health and can refuse an operation accepted by offline shape/provider checks.                                                                                  |
| Memory snapshot/file/history/diff/save                                     | `memorySnapshot`, `memoryFile`, `memoryHistory`, `memoryDiff`, `memorySave` → Memory Service | Adapter from Bot ID to an existing Human–PersonaBot DM. Host methods require a DM Channel, not just a Bot slug. Preserve `expectedHead`/`editId`; history limit needs result trimming or an owner query extension.     |
| `channels`, Human/channel names                                            | `channels`, `humanIdentity`, `humanNameSet`, `channelHumanNameSet`                           | Adapter; no new Channel store.                                                                                                                                                                                         |
| Workspace `grants`, revoke/write                                           | `grants`, `grantRevoke`, `grantWriteSet`                                                     | Adapter; `workspace-options` and `grant-create` are already live CLI verbs.                                                                                                                                            |
| All Schedule verbs                                                         | `scheduleList/Create/Update/Delete/History/RunNow/Preview` → Schedule owner                  | Adapter; run-now registers a canonical firing for Host admission, not a guarantee that a model turn already finished. Preview can remain a pure local calculation.                                                     |
| `pairings <bot>`                                                           | `messagingSnapshot` includes pairings; `pairingReview` handles reviews                       | Projection adapter; distinct from IM application authorization `pairing-status <attempt>`.                                                                                                                             |
| `secret-put/list/unset`                                                    | Native credentials authority, not operational database                                       | Existing stdin-only file/ref edit is deliberately independent of Host transport. Do not funnel values into generic BotHarness RPC or promise a native credential RPC without separately verifying its contract.        |

Sources for the important exceptions:
[Registry creation](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/registry.ts#L366),
[CLI preset application](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/bot-create-cli.ts#L902),
[Zip upload/export](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/bot-zip-http.ts),
[exact route registrations](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/plugin.ts#L1612),
[DM Memory scope](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L1008),
[Memory commands](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L4100),
[Schedule commands](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L3351),
[Messaging snapshot](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/messaging/outbound.ts#L1693).

Creation with preset/overrides is a meaningful boundary: validate before creating
where possible; if multiple owner commands are used, preserve the minted Bot ID
and completed step list on a later failure. A Host-owned composed creation command
is a possible small extension, but its cancellation, idempotency and partial
outcome semantics must be specified. An HTTP request ID alone cannot supply those
semantics. This is a recommendation, not current behavior.

## Findings: carrier, concurrency and recovery

The existing unary client uses fresh launch-token-to-cookie login, then exact
`POST /api/botharness/<method>` with `{type, rpcId, method, payload: {args}}`.
The CLI accepts loopback HTTP(S) or tailnet HTTPS origins without embedded
credentials, paths, queries or fragments. Tokens come from environment/private
token-file input and cookies remain in memory. Host restarts rotate the launch
token; auth failures are coded and do not trigger a database fallback.
[`cli-live.ts:75`](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/cli-live.ts#L75),
[ADR-0159](../adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md),
[native browser auth](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/client/connection/src/browser-auth.ts).

**Do not interpret ADR-0159's “Host serializes RPC” as a global command lock.**
The installed official `@deepseek-ai/dsh-api-gateway` `0.2.0-rc.1` was inspected
read-only and its `invokeRpc`/`invokePrepared` chain directly awaits the named
business method. The matching official pinned source has the same mechanism.
Async RPCs can interleave at awaits; the lease protects one process's database
ownership, not a multi-request transaction. A future ADR clarification should
state command-specific concurrency rather than promise universal serialization.
[Pinned API Gateway source](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/api/gateway/src/index.ts).

| Operation                                       | Current concurrency/retry fact                                                                                                                      | Design consequence                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory save                                     | Compares expected HEAD; rejects dirty/in-flight work; repeated edit ID succeeds only while its accepted commit remains current and content matches. | Keep explicit expected HEAD and edit ID. Do not silently refresh HEAD and overwrite concurrent work.                                                     |
| Model Plan set / preset update                  | `expectedRevision` is checked; plan errors currently collapse some conflicts into `invalid-input`.                                                  | Expose revisions and preferably a stable conflict code; do not retry stale decisions automatically.                                                      |
| Model Preset apply, Bot update, Schedule update | These existing entrances have no caller-supplied revision check.                                                                                    | Last accepted writes may win. If script safety requires CAS, extend the owning command rather than wrapping a non-atomic read/write in the CLI.          |
| Create, Schedule create/run-now, binary import  | Fresh identities/firings; no shared command idempotency key.                                                                                        | A lost response can leave a successful mutation. Blind retry can duplicate it. Add owner receipts/idempotency only where the selected workflow needs it. |
| DM `send`                                       | Caller can supply a Human message UUID; CLI preserves its receipt on failure and polls that exact request.                                          | Existing `send-status` is the recovery path; CLI never automatically resends the mutation.                                                               |

Sources: [Memory CAS and edit identity](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/memory/accepted.ts#L1835),
[Registry Model Plan revisions](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/registry.ts#L670),
[Preset revision check](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/models/presets.ts#L354),
[Schedule contract](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/schedules/bot-schedules.ts#L91),
[send receipt/poll implementation](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/cli-live.ts#L312),
[failure and no-retry tests](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/test/bot-live-cli.test.ts#L137).

The live model owner provides more information than offline validation, but it is
still incorrect to equate configuring a valid route with a proved model reply.
Catalog validation checks provider availability, credential health, model catalog
and call configuration; the selected model must actually answer a real DM to
prove that runtime path. [Model catalog](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/models/catalog.ts),
[readiness inspection](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/models/readiness.ts),
[ADR-0157](../adr/0157-cli-model-validation-is-tiered-key-validity-stays-host-side.md).

## Recommendations: target selection

These alternatives are design choices, not existing defaults.

| Option                                                                             | Benefit                                                                                                            | Required boundary / cost                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit `--host` or `DEEPSEEKBOT_HOST`; no target means existing offline behavior | Fits the proven carrier and existing `channel-messages` precedent; scripts select one authority deterministically. | Reject ambiguous Host/home combinations; a selected Host failure remains a failure. Recommend for the first slice.                                                                                                                                                                                                                                      |
| Local auto-discovery from a profile                                                | Convenient developer operation without copying origins manually.                                                   | Requires a versioned, nonsecret Host discovery record containing profile/instance/endpoint identity and a verified handshake; writer metadata alone is insufficient. Discovery cannot infer a valid token, start a Host, or bypass a live lease. Remote discovery is a separate concern.                                                                |
| Online-first with automatic offline fallback                                       | One command when a local Host happens to be down.                                                                  | Dangerous after a sent mutation: timeout/auth/protocol failure does not prove it did not run. Never fallback after submission. Offline mode still requires successful lease acquisition and target/profile identity agreement; remote paths cannot become local fallback targets. Prefer an explicit offline selection over implicit mutation fallback. |

Retain offline provisioning as a supported mode for empty profiles and migration
or repair work. Do not make every pure calculation or credential ref edit depend
on a running Host. Once an online authority is selected, do not silently change
the target profile, login context or execution world.

For local/Tailnet operation, retain existing origin validation, authority-bound
cookies and native Provider locality checks. A tailnet accepted by the common CLI
carrier does not imply every Provider setup endpoint accepts remote management.
Caller-local `--from-dir` uploads bytes; returned Host data/workspace paths are
Host locators, not guaranteed paths on the caller's machine. Secrets remain
stdin/environment inputs; IM credentials have only the purpose-bound exception
in [ADR-0161](../adr/0161-cli-im-authorization-keeps-provider-attempt-authority.md),
not a generic permission to send credentials in arbitrary RPC arguments.

## Findings and recommendations: CLI as a debug/test Consumer

The current CLI already supports a real non-UI test path:
send a uniquely identified Human DM → inspect its exact committed reply and send
status → query committed Channel history → answer a tool approval/formal question
when the tested scenario produces one. This goes through the production Host
owners and does not need browser clicks. It can prove message admission, execution
and committed output facts; it does not prove Client rendering or external IM
ingress merely because the same Bot answered an internal DM.
[Live CLI](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bots/cli-live.ts),
[Channel send status](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L2949).

Useful additional queries already exist at the Host seam: `botAttention` exposes
canonical Source Event/Admission state and source identifiers, `sessions` /
`sessionOwner` / `assignments` expose execution ownership, `activitySnapshot`
exposes current activity, and `channelTimeline` can query around an exact message
with bounded pages. They can become named CLI query adapters before inventing a
new debug database. They are not all public CLI verbs today.
[Remote methods](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/rpc.ts),
[Admission projection](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/runtime/attention.ts),
[timeline query](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/bridge/methods.ts#L2895).

A follow/tail command also has an existing production seam:
`GET /api/botharness/stream` publishes Channel commits, admissions, transient
drafts and activity. It supports committed-message revision replay using `after`
or `Last-Event-ID`; transient drafts have a separate process-local baseline.
The CLI currently only implements unary calls, so NDJSON streaming would be a new
CLI output contract. If selected, distinguish committed events from drafts and
define resume, deadline, cancellation and bounded backpressure behavior. Do not
start another listener or treat every streamed item as a durable execution fact.
[Channel stream owner](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/channels/live.ts),
[exact authenticated stream registration](https://github.com/BotHarness/DeepSeekBot/blob/51058d540f52de45e687f4274f3d16dd701dd0d5/packages/core/src/plugin.ts#L1488).

Recommended first tracer: online blank create with an existing usable Model Plan,
send an exact-ID DM, read its committed history, inspect its Admission/Session
ownership, and clean up through existing lifecycle/deletion owners. Exercise it
with a live isolated Host, then test parallel CLI/Client mutation and stopped Host
failures. IM authorization/identity/routing and real external send/receive form
the next tracer; internal CLI DM success cannot replace that external proof.

## Human decisions still open

1. Is the first delivery target the full setup→real reply→inspection→cleanup
   workflow, or broad CLI/UI command parity? Recommend the observable workflow.
2. Should target selection begin with explicit Host/environment and an explicit
   offline mode, or must local discovery ship in the same first slice? Recommend
   explicit selection first; discovery is a subsequent convenience feature.
3. Must online writes universally reject stale revisions and support retry by
   stable operation ID, or are existing command-specific guarantees acceptable
   for the first slice? Recommend protecting overwrite-sensitive writes and
   non-idempotent creation/firing where the selected workflow exercises them;
   publish each guarantee rather than advertise universal safe retry.
4. Should debugging initially return committed facts plus bounded status queries,
   or include a live NDJSON follow surface? Recommend committed facts and exact
   correlation first; stream UI-independent live diagnostics only when required.

## Qualification limits

No new Host runtime, binary upload, model call, concurrent command or Tailnet
experiment was run for this report. Installed official RC1 gateway code and the
official upstream source at `4878cdabd87d4041bdaff61d04c966883b9fd07a` were both
inspected; gateway dispatch behavior matched. Official plugin documentation was
checked for Plugin/Service lifecycle context, not used to infer version-specific
remote API behavior: [DSH first plugin](https://deepseek-harness.github.io/deepseek-harness/develop/basic/).
The accepted [ADR-0156](../adr/0156-programmatic-bot-creation-is-a-machine-first-cli-over-registry-creation.md)
originally selected offline-first creation; changing its default is a durable
decision to record rather than an implementation detail to assume.
