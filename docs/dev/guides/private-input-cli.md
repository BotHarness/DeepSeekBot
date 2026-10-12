# Private input CLI candidate

## Scheduled reuse after Host restart (#1383)

Configure a generic private account in an interactive PersonaBot DM using the three-field card and controlled service below. Approve its first `protected_cli` call through the existing approval card; a remembered exact call or broad allowance remains scoped by the existing execution policy.

Ask that real Bot to create a one-shot **Bot Schedule** with `bot_schedule_create`, a time at least three minutes ahead, and an explicit destination DM Channel ID. Its prompt should call `protected_cli` with `consumer: http-status-v1`, the nonsecret account and the three opaque references, then send only its status to that Channel. Stop the exact isolated Host PID and restart the same home before the due time. The naturally fired Schedule must authenticate, return 200 in the original DM and create no new private-input card. Inspect the existing Schedule history for its planned firing and actual Orchestrator Session.

For a missing account, run a disabled test Bot Schedule once using the existing **Run now** action. Have it call `ask_secret` once and report the failure in its explicit destination DM. It must finish with an Owner-action error and no new private card. Historical Human messages in the same Session do not grant input interaction. Configure or replace the account in Web Chat before explicitly retrying.

Keep a copy of the old-reference Schedule, privately replace the account with fixture version B, and run that Schedule again. It must be refused before another fixture request. A new Schedule can obtain the current reference set through `ask_secret` without another input card and authenticate B. Revoke the account, restart the isolated Host and run it again: both direct old-reference execution and unattended `ask_secret` must fail safely. A configured reference does not grant execution or delivery to another Channel. See [ADR-0169](../../adr/0169-private-input-interaction-follows-current-turn-source-events.md).

## Account replacement and local revocation (#1382)

The card keeps account, purpose and current status visible. Its info icon reveals request expiry, replacement guidance and Host storage/approval details on hover, keyboard focus or click; click pins the tooltip and Escape closes it. It never contains original private values.

On a configured Web Chat card, **Replace** opens another inline card with blank fields. Submit new values there; `ask_secret` for the same PersonaBot/account returns current references without reading either version back. The previous card shows superseded. **Revoke** durably denies new uses, including calls covered by an existing broad remembered approval, and attempts to stop active consumers. The card and Chat distinguish stopped, already completed and uncertain outcomes. This revokes local access only; third-party tokens and completed effects are unchanged. Other Bots/accounts retain independent authorization.

Use `node scripts/ask-secret-lifecycle-fixture.mjs` for a loopback-only synthetic two-version service on port 31386. Begin with version A: endpoint `http://127.0.0.1:31386/status?marker=SYNTHETIC-1380-url-A`, key `SYNTHETIC-1380-key-A`, secret `SYNTHETIC-1380-secret-A`. Switch the fixture with `POST /control` JSON `{"version":1,"delayMs":0}`. Privately replace with endpoint `http://127.0.0.1:31386/status?marker=SYNTHETIC-1382-url-B`, key `SYNTHETIC-1382-key-B`, secret `SYNTHETIC-1382-secret-B`. Request one real Bot `protected_cli http-status-v1` call for each version; both must report 200 in the original DM, while using the old references must be refused without another fixture request.

Set fixture delay to 9000 ms, start one real Bot call, observe `/evidence` increment before completion, and revoke from the configured card while it is running. Verify the bounded stop summary and connection-disconnected counter; neither establishes rollback of remote effects. Reset delay to zero. Revoked references must remain refused after an exact task-owned Host restart. A different account using A against a B-only fixture must return only 401 and a static private-replacement/remote-authorization repair action, never response content or secrets. It must remain independent of the revoked account. Use synthetic inputs only and retain all raw traces locally.

Version-three grants require both the current native account record and canonical configured Channel proof. Startup recovery finishes before Owner mutations. Partial persistence failures publish no configured reference set; a committed account head without its final Channel proof remains unusable and can be repaired with a fresh private request. Older binaries ignore the new account tombstones: back up before upgrading, repair forward or restore the complete pre-upgrade Profile backup. See [ADR-0167](../../adr/0167-private-account-versions-fence-consumption-and-revocation.md).

This is the opt-in #1380/#1381 qualification path, not a completed v1.3 capability. Human accepted the real PersonaBot inline Web input and authenticated fixed-CLI result in #1380. [ADR-0164](../../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md) records its execution boundary; [ADR-0166](../../adr/0166-private-input-settlement-commits-before-continuation.md) records request settlement and recovery.

Use a dedicated, isolated DSH home with pinned `0.2.0-rc.1`, Docker running Linux containers, and the exact image below. Do not enable this candidate on a production or shared home. It changes all Agent tool access in this Profile, including native Sessions and other Bots.

```powershell
pnpm install --frozen-lockfile
pnpm build
docker pull node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 31380
```

Add this complete config to that isolated Profile's existing `botharness-core` patch, preserving any other intended config keys. Patch replacement is not a deep merge. Stop the launcher's exact PID and restart the same isolated Profile through the helper.

```yaml
- id: botharness-core
  config:
    privateInputExecution: true
    telemetry: false
```

Start the controlled service in a second task-owned terminal:

```powershell
node scripts/ask-secret-fixture.mjs 31381
```

Open the authenticated Web URL printed by the helper, create/select a real PersonaBot with a working model, and send this through its visible DM composer:

```text
Call ask_secret for account synthetic-1380, with three required fields:
endpoint labeled Private URL, api_key labeled API key,
api_secret labeled API secret. After private submission, call protected_cli
consumer http-status-v1 using the returned references and the same account.
Report the actual HTTP status in this DM using channel_send.
```

Fill the inline password fields with these synthetic values only:

| Field       | Synthetic value                                             |
| ----------- | ----------------------------------------------------------- |
| Private URL | `http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A` |
| API key     | `SYNTHETIC-1380-key-A`                                      |
| API secret  | `SYNTHETIC-1380-secret-A`                                   |

Click **Submit privately**. Fields must clear immediately, terminal status must become configured, and the next existing execution approval card must contain only `private:<grant UUID>:<field>` references. Approve once. The Bot must report HTTP 200 in this same DM; `/evidence` on the fixture must increment `authenticated`. Its response deliberately echoes both raw and base64 canaries in body/headers, which the trusted CLI discards.

Repeat execution with references without another input request; reject once and verify no service request occurs. Then exercise the existing broad remembered allowance, including its confirmation, and repeat. Broad approval is execution convenience only: another real Bot using the references must receive a safe grant refusal before the fixture count changes. Missing refs, a wrong account, unsupported consumers and unavailable Docker must fail safely.

Ordinary `bash` uses its native Consumer and approval without ask-secret. Its scoped LinuxShell Provider starts the container through native Subprocess argv, mounts the currently authorized canonical root at `/workspace`, and translates cwd. Bot Memory and current writable Workspace Grants provide authority; a root containing the Host home is rejected. Only the exact Bot Memory subtree may be mounted from within that home. Roots overlapping linked Host Bundle code, its interpreter, Profile data or the Host temporary-directory root are rejected to prevent credential reads and later Host execution of Agent-written code. Request `printf 'linux-workspace-ok\n' > proof.txt; cat proof.txt; pwd; id; printf 'native-error-stream\n' >&2; exit 7` in the DM. Verify persisted file contents, cwd `/workspace`, UID 65534, separate stderr and actual exit code 7. Normal container network access is available, but no Host credentials, ambient environment or Docker socket are forwarded. Git metadata is read-only to prevent Agent-written hooks/config from being executed later by Host Git.

On a Linux Host, the authorized root must also grant UID/GID `65534:65534` the intended POSIX file access. BotHarness authorization does not override filesystem permissions or silently change ownership. Prepare only the authorized workspace or exact Bot Memory subtree through ownership, a dedicated group or ACLs; verify access to existing files and files created later. Keep the credential home private and Host-managed `.git` protected. A Host-created `0700` directory or `0600` file remains inaccessible to the guest. Docker Desktop success does not prove Linux access. See the [Linux qualification guide](private-input-linux.md).

Configure an ordinary nonsecret MCP demo through the existing opt-in Profile, then stop the launcher's exact Host PID and restart it with the same helper:

```powershell
node scripts/setup-private-input-mcp-demo.mjs <isolated-DSH_HOME>
```

The setup preserves other patch entries and installs `privateInputMcpServers` with the published demo source. Request `mcp__linux_demo__workspace_probe` from the same real Bot; it must read `linux-workspace-ok` from the file above, report `/workspace`, UID 65534 and `hostCredentialEnvironment:false`. This uses the native MCP Client and stdio SDK. Its protocol-negotiation probe siblings share an owner label for cleanup; no fixed container name is reused. Qualification checks exact native ToolDefinition identity and current workspace authority. Reconnect/new generations fail closed and require reactivation. Two real Bots may use the same server name in separate native Agent Scopes; the published build must share DSH Scope with the Host.

`privateInputMcpServers` declares a serverName, Guest command/args and optional Host-side authorized workdir. Guest executables must exist in the pinned image or mounted workspace. It does not inject secret references or support arbitrary Host/HTTP MCP servers. Windows commands, unrestricted Host file tools, background Jobs, Git metadata writes, Browser, Computer and delegation remain unqualified in this Profile. Default Profiles without private grants keep their original invocation paths. This local qualification used a Windows Host with Linux containers; Linux-server workspace permissions and full compatibility remain #1386.

The CLI can also settle the same inline private card using the authenticated Owner carrier:

```text
deepseekbot ask-secret-status <dm-channel-id> --message-id <card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-submit <dm-channel-id> --message-id <card-id> --values-stdin --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-cancel <dm-channel-id> --message-id <card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-account-status <dm-channel-id> --message-id <configured-card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-replace <dm-channel-id> --message-id <configured-card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-revoke <dm-channel-id> --message-id <configured-card-id> --host <origin> --token-file <private-token-file>
deepseekbot ask-secret-accounts <bot-id> --host <origin> --token-file <private-token-file>
```

Supply a JSON object of declared field IDs and confidential strings over stdin from a trusted input source; do not put values in arguments, shell history or repo files. Submission returns only `{accepted:true}`, status returns only the status, and errors do not echo values or Host error payloads. Submission is never retried automatically. Ordinary `user-question-answer --answer-stdin` retains its existing nonsecret answer JSON contract; ordinary question answers are durable model-visible content.

Find the card ID and its declared field IDs using `channel-messages <dm-channel-id>`, or list a Bot's current accounts and their configured card IDs with `ask-secret-accounts <bot-id>`. `ask-secret-status` describes that request's settlement (`pending`, `configured`, `cancelled`, `expired`); `ask-secret-account-status` describes current account access (`configured`, `revoked`, `superseded`, `unavailable`). An old request stays configured after its grant is superseded or revoked. Both status commands return only `{status}`.

`ask-secret-replace` uses the configured card and returns only the new blank card's `{messageId}`. Submit replacement fields with `ask-secret-submit --values-stdin` using that new ID, or cancel it with `ask-secret-cancel`. This shares the Web card's current-version checks and clears its pending attention. `ask-secret-revoke` uses the configured card and returns only `{accepted:true,stopped,completed,uncertain}`. These are bounded running-use stop counts, not remote token invalidation or effect rollback. Revocation erases the account's stored values immediately; only the account binding tombstone remains, so an old grant can never become current again and a later request starts a fresh account. None of these mutations retry automatically. After a transport failure, inspect Channel history and request/account status before deciding whether another mutation is needed. No CLI command reads original values back.

To verify #1381, create two real Bots and request the same three generic fields for separate accounts. Both pending requests must appear independently in Activity center / Human Inbox; **Go to private input card** opens the existing DM card. A request expires after fifteen minutes of Host time, even without an open Web page. It is metadata only after expiry, cancellation, Agent stop or restart, and cannot be submitted late.

Open one pending card in two independent authenticated browser contexts, fill only its password inputs, and submit concurrently. Both pages must converge to configured with empty inputs, while only one grant and one configured resolution exist. Approve the single CLI invocation and verify exactly one authenticated fixture request and one same-DM result. Cancel the other Bot's card after filling its inputs: inputs and that request's attention clear independently, and the configured Bot's references remain usable. Reload must never restore the entered plaintext.

Ask the second Bot for a fresh card, use native Session stop while it waits, then attempt a late Owner submission. It must return `accepted:false`, commit expired with no references, and never start credential use. Bot pause only controls new admissions; it does not stop its existing native turn and is not this check. Create another pending request with an explicit DM, then restart the exact isolated Host. The lost card must become durably expired without recreating its waiter or waking the stopped Bot; existing configured references remain usable when the first Bot receives a new explicit DM instruction. Do not interpret automatic re-execution as successful recovery. Version-two grants require the configured Channel commit, so a native write with failed Channel persistence cannot publish a usable partial result.

Initialize a fresh native Profile before adding its Patch; do not precreate its Profile directory or overwrite native patch entries. Stop the helper's verified exact Host PID before rebuilding/restarting. Keep local tokens and full native Sessions private. Publish allowlisted event projections and aggregate canary counts only.

Run deterministic active extraction independently of any model's willingness to attempt it:

```powershell
$env:BOTHARNESS_PRIVATE_DOCKER_QA = '1'
pnpm exec vitest run packages/core/test/protected-execution.test.ts --maxWorkers=1
pnpm exec vitest run packages/core/test/linux-execution.test.ts packages/core/test/linux-mcp.test.ts --maxWorkers=1
```

This checks both the stricter unmounted command world and the mounted Linux world: Host-file/base64, environment, Docker socket, Git metadata protection and authorized file persistence. It also exercises the actual native MCP SDK and fixed-CLI output against an echoing service. MCP qualification excludes pre-existing Agent-owned tools and inherited global/ancestor Host tools, including registrations arriving during server startup with the same namespace prefix. Concurrent Guest tools continue to work. The ordinary suite skips Docker qualification when the opt-in environment variable is absent.

Qualification also inspects actual model request bodies, persisted request headers/messages/results/errors, ordinary Channel history, developer logs and Spill using synthetic raw, URL-encoded and base64 patterns. Native credential records and task-owned synthetic instrumentation are allowed destinations; publishing their contents is unnecessary. A model refusing an extraction prompt is not boundary evidence. Node's one-shot zstd decompressor reads one concatenated frame at a time: advance by `engine.bytesWritten` to scan the entire native Session artifact, not only its header.

For model adapters using `/messages`, `/chat/completions` or `/responses`, launch the isolated helper with a process-local `NODE_OPTIONS=--import=<file URL of scripts/ask-secret-wire-probe.mjs>` and `BOTHARNESS_PRIVATE_WIRE_EVIDENCE=<task-owned evidence file>`, then restore those environment variables in the launching terminal. On Windows the import must be a `file:///` URL. Keep the synthetic canary list outside DSH_HOME and point `BOTHARNESS_PRIVATE_CANARY_FILE` to it. The passive probe leaves requests unchanged and writes only body-availability, request sizes and synthetic-match counts, never bodies or authentication headers. Confirm it observes actual requests after private submission and reports every body available; an unsupported body is incomplete evidence. The trusted credential CLI scrubs these environment variables. This instrumentation qualifies the observed adapter and fixed canaries, not every provider or arbitrary encoding.

```powershell
node scripts/scan-private-input-evidence.mjs <isolated-DSH_HOME>
```

The scan must report `nativeStoreContainsSyntheticValues: true` and no violations. It follows native formatted-result and Subprocess output Spill markers outside Home only into pinned temporary Spill directories; missing or changed files are reported as incomplete evidence. Exercise a large ordinary CLI output to create real Spill before this check. A task-local probe embedded in the home may contain the published synthetic strings; only the exact fixture instrumentation filename is excluded alongside the native credential store. Export reviewable native events with `node scripts/export-private-input-evidence.mjs <isolated-DSH_HOME> <session-id> <output.json>`. This reads every compressed frame and projects linked declaration/reference/approval/status facts; it omits raw Session messages, reasoning, commands, paths, headers and errors. The PR includes the allowlisted event artifact, not the full private Session.

The request supports 1–8 dynamic confidential strings, preserving significant whitespace, with no defaults or original-value readback. References are bound to the actual live Orchestrator, Bot creation identity and account. The three-field schema belongs only to `http-status-v1`; it is not an email/provider configuration model. Host failure diagnostics contain stable phases, request/Bot/Session identifiers and durations, never raw values or subprocess errors.

Do not disable/remove the Plugin or revert to an older binary while private grants remain. Restore the isolated pre-trial home or purge only application-owned native grants before rollback. IM initiation, credential-consuming MCP and Linux-server verification require their separate slices. Account lifecycle and Schedule qualification remain limited to this opt-in execution boundary.
