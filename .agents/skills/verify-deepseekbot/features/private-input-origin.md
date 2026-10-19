# Private input in mixed local and IM turns

## Sub-features

- Local Human DM and Group interaction can reuse an account with accepted IM context in the same turn.
- Explicit IM selection retains source leases, same-account ambiguity and revocation checks.
- Native approval waiting does not remove accepted local authority. Schedules reuse configured accounts in later turns.

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
pnpm exec vitest run packages/core/test/private-input-origin.test.ts packages/core/test/private-inputs.test.ts packages/core/test/native-question-runtime.test.ts --maxWorkers=1 --testTimeout=60000
```

## Gotchas

- The fixture owns one synthetic IM Binding; reruns must reuse its QA Bot or a fresh isolated Profile. A second Bot cannot take that Binding.
- Read actual native Tool results as well as the visible reply; a model-authored success marker alone is insufficient.
- The journey is not a real Lark/Discord delivery check, and `gh --version` does not qualify GitHub API access. Source revocation and scheduled branches are separate automated regressions.
- Preserve failed drives before retrying. Newer native preview dialogs must be dismissed before waiting for Settings. On Windows, verify that the Client bundle contains no Node built-in imports; see the dsh-dev pitfall log.
