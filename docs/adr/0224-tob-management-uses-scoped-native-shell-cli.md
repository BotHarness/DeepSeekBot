# ADR-0224: Tob management uses a scoped native Shell CLI journey

- Status: Accepted
- Date: 2026-10-18
- Related: [#2081](https://github.com/BotHarness/DeepSeekBot/issues/2081), [#2087](https://github.com/BotHarness/DeepSeekBot/issues/2087), [ADR-0223](0223-tob-is-a-protected-local-personabot.md)

## Context

Tob should use the same DeepSeekBot CLI command surface that a Human or diagnostic agent can discover and operate. Adding a model-facing Tool for every setting would duplicate that surface and separate approval behavior from CLI execution. Conversely, giving a Shell the Human's administrative credentials would turn editable persona instructions and imported content into unrestricted Host authority.

The first journey reads and changes the global Assignment concurrency limit. Broad CLI parity is a delivery sequence, not permission to expose every existing Human command to Tob immediately.

## Decision

Use the DSH-native bash/pwsh Tool and Shell Service. An application-defined Shell Provider wrapper in the Orchestrator's Service Isolation binds each native ToolExecution to a process-local CLI broker. The existing native Assignment Tools remain unchanged; no replacement management Tool Registration is added. Remove the dedicated `tob_assignment_limit_read` and `tob_assignment_limit_set` Registrations, prompt instructions and direct-runner paths.

The broker is owned by one Shell execution, not by a durable PersonaBot credential. It starts on a loopback endpoint and supplies an ephemeral bearer token in the child process environment. The CLI's scoped mode uses this endpoint without reading Human administrator authentication or selecting an offline store. Completion, cancellation and disposal revoke the broker. Source authority is rechecked for each operation; lifetime alone is not authorization. The normal Human CLI retains its authenticated and offline contracts outside scoped mode.

The Host obtains identity from the actual ToolExecution. Authority requires the protected Tob singleton, its root Orchestrator Session and the exact accepted canonical Human private-DM Source Events for that execution. A CLI argument cannot select or impersonate that identity. A later Turn in the same Session cannot inherit an earlier execution's authority. Group, external IM, Bot-originated and Assignment Session requests do not acquire this management capability.

`capabilities` and scoped help enumerate an explicit allowlist. Initially it contains only discovery, reading `botharness-client.assignmentConcurrencyLimit`, and changing that field within 1–32. The read exposes only the allowed field, current revision and scope. Other commands, namespaces, fields and unsupported options refuse with coded errors. Incomplete or invalid scoped configuration cannot fall through to Human authentication or offline mutation.

A write carries the parsed namespace, patch, expected revision and previous value. Existing application-defined ChannelToolApproval and native approval policy review this operation under the real execution identity. Approval is not inferred from a Shell command string or from possession of the broker token. The execution guard revalidates authority and the reviewed previous value/revision after approval and immediately before writing. Native Settings remains the sole durable value and revision owner; a successful response follows read-back. Stale proposals refuse without overwriting. Cancellation or an uncertain transport result requires reconciliation against Settings before retry, rather than replaying the write blindly.

Human `settings-set` also accepts explicit previous-value/revision inputs for a reviewed patch. Both flags are optional together for the existing Human flow and mandatory for scoped Tob writes. This keeps one command vocabulary without equating Human and Agent authority.

## Security and lifecycle limits

The child environment contains a bearer capability. Arbitrary Shell code can inspect or copy it, and this design is not isolation against another process controlled by the same OS user. Its protection is narrow operation scope, actual Host-side source checks, existing approval, revision guards and revocation. The capability must not be logged or stored as an administrator credential; its expiry does not make arbitrary Shell output safe to publish. Diagnostics omit endpoint/token values and record bounded operation outcomes.

A broker is a live transport adapter, not a new durable settings store, approval owner or second Session history. Native Shell execution stays in the existing Session trace, while existing approval records retain the review. Host restart does not revive a broker; the model must invoke a new Shell and read the current Settings state.

## Alternatives and consequences

Per-setting management Tools would preserve duplicated discovery and require more Tool Registrations as coverage grows. Reusing a Human login token would bypass the accepted-DM and operation-scope boundaries. A CLI argument carrying a Session ID would let the caller nominate its own authority. None is used.

Tob can discover and perform the first management journey through CLI while preserving the same Settings and approval owners. This does not yet grant access to other Bots, Memory, groups, models, client preferences or Marketplace commands. The UI/CLI inventory records those gaps and distinguishes an existing Human command from an operation supported in scoped Tob execution.

Verification must exercise the actual Shell → CLI → Host path, including denial, stale revision, cancellation, source revocation, read-back and restart. Web rendering and macOS Desktop operation are separate gates; the architecture decision itself is not runtime evidence.
