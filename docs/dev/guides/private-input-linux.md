# Private input on an isolated Linux Host

This guide qualifies the opt-in execution boundary from [ADR-0164](../../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md). It does not authorize deployment. Obtain a specific receiver window and server-change scope before operating an existing IM App. Use synthetic credentials and a loopback controlled service; never start a second receiver for that App.

## Install and preserve authority

Pin the repository revision, Node, pnpm, DSH `0.2.0-rc.1`, the qualified IM Provider and the Docker image from the [CLI guide](private-input-cli.md). Use a separate checkout and private DSH home. Record exact process identities and existing proxy routes before startup. Stop only the verified task-owned source receiver before starting the Linux receiver.

For a cross-platform Profile transfer, stop the source writer and preserve the native credential store and canonical Bot identity. Audit path-bearing metadata separately from immutable Session Events. Windows paths in `session_ownership.cwd_reference`, Memory ownership/checkpoints, the native Session header/project directory and the IM Provider's `integrations/dsh-feishu/workspaces.json` require an explicit, bounded translation. Accept only the audited source-home prefix and targets inside the new private home. Verify that retained compressed Session Event frames are byte-identical. Do not rewrite historical messages, credentials, references or arbitrary JSON strings.

Configure `privateInputExecution: true` in the existing core Patch. Set `privateInputWebUrl` to the Owner-reachable HTTPS origin and configure the exact native Connection trusted authority. A Tailscale Serve endpoint can proxy the loopback DSH Host; preserve other routes and native Owner authentication. The IM locator contains Channel/card IDs, never a login token, and grants no submission authority. See the [IM guide](private-input-im.md).

## Prepare the authorized Linux workspace

Ordinary CLI and stdio MCP containers run as `65534:65534`. A writable Workspace Grant and Linux file access are separate requirements. Prepare only the authorized root through ownership, a dedicated group or ACLs. Include directory traversal, existing files and files created later; leave the credential home and unrelated workspaces private. Do not switch the container to root or mount the whole Host home to repair a permission error.

The isolated qualification used Host-owned Bot Memory with guest group `65534`, setgid directories `2770` and nonsecret files `0660`. Parent credential-home directories stayed `0700`, the native credential file stayed `0600`, and Host-managed Git metadata was excluded from guest write permission. This is an explicit test-environment preparation, not an automatic chmod policy for user workspaces. Check actual persisted files from both Host and guest; directory permission alone does not prove later file access.

Disposable Docker tests prepare their nonsecret fixture permissions explicitly, including under a private `077` Host umask:

```bash
BOTHARNESS_PRIVATE_DOCKER_QA=1 pnpm exec vitest run \
  packages/core/test/protected-execution.test.ts \
  packages/core/test/linux-execution.test.ts \
  packages/core/test/linux-mcp.test.ts --maxWorkers=1
```

## Verify the installed behavior

| Path                              | Required observation                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real IM → Owner Web → original IM | Existing PersonaBot requests three dynamic fields; actual Web submission clears values; existing approval contains references; fixed CLI and MCP authenticate; canonical Source/Admission/Outbox and visible reply agree. |
| Ordinary CLI/MCP                  | No new secret input; persisted workspace file, guest UID, separate stderr and exit code; actual large-output Spill; ordinary MCP reads the same file without Host credential environment.                                 |
| Ownership and extraction          | Another real Bot is denied before a fixture request even with execution approval; Host credential path, ambient environment, Docker socket and Git write probes fail.                                                     |
| Lifecycle                         | Cancellation and concurrent/stale submission have one canonical outcome; rotation invalidates old references; revocation denies new use and attempts to stop a started consumer.                                          |
| Restart and Schedule              | Old pending cards expire; a naturally fired one-shot Bot Schedule reuses configured references after exact Host restart without a new private card; old/revoked/missing accounts fail safely.                             |

Retain actual native Sessions privately and publish only the allowlisted export from `export-private-input-evidence.mjs`. Use the passive wire probe with the actual selected model adapter and report request count, body availability, byte count and canary matches. Scan raw, URL-encoded and base64 canaries in Session, Chat, approval, logs, errors and retained Spill. Missing bodies or Spill files are incomplete evidence. Keep canary files, credential-bearing state, tailnet identifiers and full traces outside Git.

The fixed consumers support only the qualified HTTP-status operation. Arbitrary credential-bearing Shell commands, MCP servers or transports are not implied. Normal Linux file access still depends on explicit workspace permissions. Scope every success claim to the installed revision and actual observed cases; CI and a developer-terminal request cannot replace the real PersonaBot path.

## Repeat the synthetic case

After preparing the private Profile and execution permissions above, start the existing verified launcher and the controlled fixture in separate terminals:

```bash
node scripts/dev-instance.mjs --home <private-DSH_HOME> --port 31395 --im-provider --json
node scripts/ask-secret-lifecycle-fixture.mjs 31396
```

Complete the existing IM App's pairing in this isolated Profile, with its other receiver stopped. In its authorized private conversation, ask the real PersonaBot to request account `linux-demo` with required fields `endpoint`, `api_key`, `api_secret`, wait for Owner Web input, call each fixed authenticated-status consumer once and use `bridge_reply` to report only HTTP status and success to the same accepted source. Do not include field values in that IM message.

Fill the Web card using the version-A synthetic values printed in the [CLI acceptance guide](private-input-cli.md), changing only the endpoint's port to `31396`. Approve the reference-bearing executions through the existing permission card. Expect HTTP 200 from both consumers and the same nonsecret IM reply. The fixture's `/evidence` endpoint exposes request/authentication/completion counts without credential values; use its `/control` endpoint from a trusted Host terminal to select version B or a bounded response delay for rotation/revocation probes.

For scheduled reuse, ask the PersonaBot to create a one-shot Bot Schedule at least three minutes ahead. The scheduled prompt must omit `source_event_id`, reuse the configured account, call both fixed consumers and report to its Web DM. Restart only the launcher's verified Host before the deadline; observe a natural `planned` firing, not `scheduleRunNow`. Test missing and revoked accounts in separate scheduled cases: neither should create an unattended private-input card. Preserve authenticated native Session and canonical firing evidence before restoration. The [qualification record](../../research/2026-10-12-private-input-linux-qualification.md) distinguishes actual successful cases, failed attempts and remaining limits.

## Restore the receiver

Stop the exact Linux Host and fixture after checking their process identity and DSH home. Confirm the Linux receiver is down before restoring the source receiver. Remove only the task-added proxy endpoint, compare the remaining routes to the saved baseline, and verify a normal reply after restoration. Preserve private evidence for forward repair; do not downgrade a credential-bearing Profile to an unfenced binary.
