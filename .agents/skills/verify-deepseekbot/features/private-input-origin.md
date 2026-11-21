# Private input in mixed local and IM turns

## Sources

- `packages/core/src/credentials/{im-origin,private-inputs}.ts`
- `packages/core/src/runtime/bot-runtime.ts`
- `packages/core/src/workspaces/tool-approval.ts`
- `packages/core/src/features/approvals/tool-approval-{review,types}.ts`
- `packages/client/src/client/private-input-*`
- `apps/mobile/src/host/private-input.ts`
- `apps/mobile/src/ui/chat/private-input-card.tsx`
- `apps/mobile/src/ui/private-input-form.tsx`
- `apps/mobile/app/private-input.tsx`

## Terms

- Credential reference
- Source Event
- App
- DM

## Sub-features

- Local Human DM and Group interaction can reuse an account with accepted IM context in the same turn.
- Explicit IM selection retains source leases, same-account ambiguity and revocation checks.
- Native approval waiting does not remove accepted local authority. Schedules reuse configured accounts in later turns.
- IM-only multi-source refusals identify the `ask_secret` recovery path; configured reuse needs no Web notification address. Direct CLI calls retain the native approval pipeline and source checks.
- A model-free private-tool execution approval uses the authenticated caller's DM and exact live Agent Session/call ID, including while the Agent is idle. Concurrent calls and an ordinary Group turn keep separate origins; cancellation releases only its own direct-call origin. Protected-input approval for a read-only `secret_http` GET uses the same routing; direct Reviewer requests omit the borrowed Session history.

## How to get to it (user POV)

Open Messages, then a Bot DM. Request an account with `ask_secret`, fill its private card, and request `secret_cli`. While its native approval card is pending, accept two authorized IM requests for the same Bot. Approve the command once. The local operation should complete without demanding an IM selector.

For a local Group, mention the Bot and use the same card/consumer path. For IM-only work with several sources, first call `ask_secret` with an exact accepted `source_event_id`. Historical or unknown sources and revoked leases must refuse.

## Driving it with verify-app

Build, then launch and doctor a fresh named isolated Host with a usable model. Never use production credentials or a production IM receiver.

Add the synthetic Provider to that isolated Profile's existing `cordis.patch.yml` (preserve its entries):

```yaml
- insert:
    - id: qa-private-input-origin
      name: /absolute/worktree/scripts/fixtures/private-input-origin.mjs
      config:
        directory: /absolute/worktree/.humanlayer/verify/issue-2290/control
```

Restart only that verified Host PID with the same isolated home, then run:

```bash
node scripts/verify-app.mjs doctor --name issue-2290
node scripts/e2e-private-input-origin.mjs issue-2290 candidate
node scripts/verify-app.mjs observe --name issue-2290
```

The journey enters Messages and sends through the visible composer. Owner submission and approval use the existing authenticated bridge. The controlled Provider has no external network receiver. It records two live accepted IM sources during native `secret_cli` approval waiting, a local automatic origin, exactly one allowed-once native call and the committed result reply. Screenshots, accessibility snapshots, console and an allowlisted report remain under the named evidence directory. The command is `gh --version` with a synthetic `GH_TOKEN`: no GitHub auth state or production account is read or changed.

The `baseline` argument expects the original refusal on a separately built base revision with the same fixture; use a fresh isolated home or its own synthetic account. Do not present a candidate-only run as a before/after proof.

Run the cross-module regression matrix for local DM, local Group, batch collection, steering, approval continuation, IM-only ambiguity, explicit source, revoked source, unaccepted history and later scheduled reuse:

```bash
pnpm exec vitest run packages/core/test/private-input-origin.test.ts packages/core/test/private-inputs-account-references.test.ts packages/core/test/private-inputs-channel-and-im-delivery.test.ts packages/core/test/private-inputs-request-lifecycle.test.ts packages/core/test/native-question-runtime.test.ts --maxWorkers=1 --testTimeout=60000
```

For #2847, use a fresh instance with the same synthetic Provider and run `node scripts/e2e-private-input-origin.mjs <name> recovery`. After the local proof, it sends a synthetic IM request, adds two context sources while approval is pending, verifies the coded refusal, and lets the real model follow the recovery instructions. It checks selection of the original request, one corrected successful command and no duplicate input card, then invokes `bot-tool` from the CLI and accepts its native approval. The allowlisted `recovery-proof.json` records outcomes without references or values. Registered-tool regression tests also drive controlled HTTP and MCP processes and assert zero requests before selection and exactly one after recovery.

## Direct execution approval from an idle Agent

On an isolated Host, initialize a QA Bot through its real Human DM, then check `bot-tools <bot-id>` for its live private-tool registrations. Call `bot-tool <bot-id> secret_cli --args-stdin` with a synthetic missing account/reference and a harmless `git --version` command. A usable account or real secret is unnecessary: the expected credential-consumer refusal after approval keeps the program from executing.

Verify the execution card appears in the authenticated caller's DM. Save its existing Always allow kind, read `tool-approval-rules <bot-id>`, and compare the rule's Bot, role, scope and source with the card and permissions table. Repeat the same call: the saved rule's reuse counter must advance without a new card or Reviewer call, while the synthetic credential refusal remains distinct from authorization success. Revoke with `tool-approval-rule-revoke <bot-id> --rule <rule-id> --confirm`; the next call must ask again. Reject that final card and retain canonical readbacks. Preserve current Human decision permissions and private-input Source Event checks throughout.

Repeat the approval routing check with `secret_http`, a synthetic missing account/reference, method `GET` and a protected-policy path such as `/audit/approval-reviewer.json`; approval must reach the caller DM even though GET has no declared write effect. Keep the missing-account refusal and verify no HTTP request occurs. With automatic review enabled, a direct-call Approval Review Session must contain the selected policy and pending input without earlier Human messages or tool calls from the borrowed Session. Use only a unique synthetic marker in the earlier QA Session, never private Human content.

## Gotchas

- The fixture owns one synthetic IM Binding; reruns must reuse its QA Bot or a fresh isolated Profile. A second Bot cannot take that Binding.
- Read actual native Tool results as well as the visible reply; a model-authored success marker alone is insufficient.
- The journey is not a real Lark/Discord delivery check, and `gh --version` does not qualify GitHub API access. Source revocation and scheduled branches are separate automated regressions.
- Preserve failed drives before retrying. Newer native preview dialogs must be dismissed before waiting for Settings. On Windows, verify that the Client bundle contains no Node built-in imports; see the dsh-dev pitfall log.
- On 2026-11-18 (PR #4461, head 69e0387f3) `scripts/e2e-private-input-origin.mjs` stopped at its first navigation step: it waits for a rail button named `Messages · …`, which the current Client no longer renders (the rail shows `Channels`). Update that selector before relying on the journey; the regression matrix above passed on the same head.
