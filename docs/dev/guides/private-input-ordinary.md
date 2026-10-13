# Secret input in an ordinary Profile

Since [ADR-0189](../../adr/0189-secret-input-is-available-in-ordinary-profiles.md) a PersonaBot can ask for a secret in any Profile. No Docker, no opt-in.

## What the Bot can do

| Tool                 | What it does                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask_secret`         | Posts an input card in the Channel the request came from. Only the Owner can fill it. The Bot gets back `private:<id>:<field>` references, never values.                                                    |
| `secret_http`        | Calls an HTTP API. The Host sends the request to the endpoint the Owner typed into the card; the Bot chooses a path under it, the method, and `{{field}}` placeholders for secrets in headers, query, body. |
| `protected_cli`      | The fixed `http-status-v1` check: one GET, returns only the status code.                                                                                                                                    |
| `secret_cli`         | Runs one installed command-line tool with secrets in its environment. The Host starts the program without a shell, in the Bot's working folder, inside the Shell sandbox, with a clean environment.         |
| `secret_mcp_connect` | Starts an MCP server for this Bot's chat Session with secrets in its environment; its tools appear as `mcp__<server_name>__<tool>`. `secret_mcp_disconnect` stops it or lists what is connected.            |

Every consumer needs Human execution approval. The approval card shows references and placeholders, not values. A `secret_cli` call needs its own approval every time: the card offers allow once and reject only, and no saved rule covers it ([ADR-0191](../../adr/0191-a-bot-runs-a-command-line-tool-with-owner-secrets-per-approved-call.md)).

## What protects the secret

- Values live in DSH's native credential store, bound to the requesting Bot and account. Another Bot cannot use them.
- Channel history holds the request and the references only.
- `secret_http` never sends a secret anywhere but the Owner-entered endpoint. Redirects are refused. Plain http is accepted only for a local address. The endpoint may carry its own query string, which stays on every request and is masked in the response like a secret. A request the Host refuses before sending comes back as `refused` with the reason, so the Bot can explain it. Secret values are masked in the returned text in raw, base64 and URL-encoded form; that masking is a courtesy, not a boundary.
- An Agent cannot read the credential store. DSH runs every Shell command inside an OS sandbox, and the Host adds a rule that the store is unreadable: a Seatbelt rule on macOS, an empty-file mask under bwrap on Linux. Agent file tools that target the store, and Shell commands that name it, are refused before any approval card.

## Limits

The sandbox rule does not exist in three cases, where only the refusal by command text applies and a command that reaches the file indirectly is not recognised:

- a command run in `danger-full-access` mode, which DSH does not sandbox;
- Linux hosts where DSH uses the Landlock runner instead of bwrap;
- Windows, whose DSH sandbox does not confine reads.

The Host logs a warning the first time a sandbox runner gets no rule. `scripts/test/dsh-sandbox-shape.test.mjs` fails when a DSH upgrade changes the runner command line this depends on; adapt `credentials/store-guard.ts` then.

`secret_cli` hands the secret to the program it starts. A tool that can print or forward its credential will do so if an approved call asks for it; shells and interpreters are refused as the program, which removes the trivial route and nothing more. Read the program and arguments on each card.

## Command-line tools

Ask the Bot to use a tool that reads its credential from the environment, for example:

```text
The tool mytool reads MYTOOL_TOKEN. Ask me for the token with ask_secret (account "mytool token"),
then run: mytool status
```

The Bot calls `secret_cli` with `program: mytool`, `args: ["status"]` and `env: [{ name: "MYTOOL_TOKEN", value: "{{token}}" }]`. Expect an approval card that names the program and arguments and has no save-rule buttons; after approval the Bot reports the exit code and output with the token shown as `[secret]`. Asking it to run `sh -c 'echo $MYTOOL_TOKEN'` this way is refused without a card.

## MCP servers

Ask the Bot to connect a server that reads its credential from the environment, for example:

```text
Connect the GitHub MCP server: npx -y @modelcontextprotocol/server-github, which reads
GITHUB_PERSONAL_ACCESS_TOKEN. Ask me for the token with ask_secret first.
```

The Bot calls `secret_mcp_connect`. Expect an approval card that names the launcher and arguments, has no save-rule buttons and says the program keeps running. After approval the Bot lists the server's tools; each tool call then asks in the usual way. The server stops on `secret_mcp_disconnect`, when the account is revoked, or when the Host restarts; reconnecting needs a new approval. It is not available to Assignments ([ADR-0195](../../adr/0195-a-bot-starts-an-mcp-server-with-owner-secrets-per-approved-start.md)).

For a local check without a real service, start `node scripts/ask-secret-fixture.mjs 31381` and ask the Bot to connect `node <repo>/scripts/secret-mcp-fixture.mjs` with `STATUS_ENDPOINT`, `STATUS_API_KEY` and `STATUS_API_SECRET`, then call `check_status` (expect 200) and `describe_setup` (expect the key shown as `[secret]`).

## Owner CLI

The `deepseekbot` live commands work in an ordinary Profile exactly as in Web Chat: `ask-secret-status`, `ask-secret-submit --values-stdin`, `ask-secret-cancel`, `ask-secret-account-status`, `ask-secret-replace`, `ask-secret-revoke` and `ask-secret-accounts`. Decide the `secret_http` approval with `tool-approval-decide`. See [the CLI reference](../../bot-cli.md).

## Verify locally

Use an isolated DSH home and synthetic values only.

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 31380
node scripts/ask-secret-fixture.mjs 31381
```

Open the printed Web URL, select a PersonaBot with a working model, and send in its DM or mention it in a Group:

```text
Call ask_secret for account synthetic-http, with three required fields:
endpoint labeled API address, api_key labeled API key, api_secret labeled API secret.
After I submit, use secret_http: GET /status?marker=SYNTHETIC-1380-url-A with header
x-api-key set to {{api_key}} and x-api-secret set to {{api_secret}}.
Tell me the HTTP status and what the response contains.
```

Fill the card with these synthetic values:

| Field       | Synthetic value           |
| ----------- | ------------------------- |
| API address | `http://127.0.0.1:31381`  |
| API key     | `SYNTHETIC-1380-key-A`    |
| API secret  | `SYNTHETIC-1380-secret-A` |

Expect: the card appears in the Channel you asked in; after submission its fields clear; the approval card for `secret_http` shows the path, placeholders and `private:` references; the Bot reports status 200 and a body in which the key, the secret and its base64 form read `[secret]`; `http://127.0.0.1:31381/evidence` shows `authenticated` incremented; no Channel message contains either synthetic secret.

To check the store guard, ask the Bot to run `wc -c <isolated-DSH_HOME>/.credentials.yaml`. It is refused without an approval card. A command that names the file indirectly reaches the sandbox rule and fails with `Operation not permitted` on macOS. Under bwrap the read fails with `Permission denied`; that was run in a Linux container against the command line DSH builds, for the read-only and workspace-write policies, not through a full Host on Linux.
