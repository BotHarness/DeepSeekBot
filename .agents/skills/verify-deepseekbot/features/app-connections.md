# App connections (Composio)

## Sources

- `packages/core/src/connectors/*.ts`
- `packages/core/src/features/connectors/*.ts`
- `packages/core/src/cli/cli-connectors.ts`
- `packages/client/src/client/connectors-settings.tsx`
- `packages/client/src/client/bot-connectors-section.tsx`
- `packages/client/src/client/features/connectors/*.ts`

## Terms

- App connection
- PersonaBot
- Settings

## Sub-features

- Bot Settings › App connections (应用连接), Owner only: one Composio API key row (Add key / Replace; Remove inside the dialog) and a Connected accounts list with status, Disconnect, Open sign-in, Connect an app and Check status.
- Saving a key checks it with Composio first; a rejected key is refused with `invalid-input` and nothing is stored.
- Each Bot's App connections entry: one select per account (No access / Read / Read and write).
- Bot tools `connector_catalog` (read) and `connector_request` (always a Human approval card). The `mcp__composio__*` guard refuses ungranted services, writes under a Read grant, remote workbench/bash tools and calls after revocation.
- The connector request decision supports a single tool invocation in the requesting Session. Use `deepseekbot connector request-decide <channel-id> <message-id> --choice once` on a pending connector request. Check that the first account tool call works, a second is refused, and `bot-connectors` shows no new durable grant.
- Engine-backed Bots find granted App connection tools through `tool_search` and run them through `tool_call`. Revoke the grant between two calls in the same Session and check the second call is refused. Check a second Bot cannot find the tools unless granted the same account.
- CLI parity: `connectors`, `connector-key-set --key-stdin`, `connector-key-clear --confirm`, `connector-connect <service>`, `connector-refresh`, `connector-grant <bot> <account> --access read|write|none`, `connector-remove <account> --confirm`, `bot-connectors <bot>`, `connector catalog --bot <slug>`, and `connector grant <bot> <account> --explain`.

## How to get to it (user POV)

Bot mode → rail gear (**Bot settings** / **Bot 设置**) → **App connections** / **应用连接**. Searching settings for “connect” lists it first. Per Bot: open that Bot's settings and choose its App connections entry.

## Driving it with verify-app

```bash
pnpm build
node scripts/verify-app.mjs launch --name <n>
node scripts/verify-app.mjs shot app-connections --name <n> --bot-mode --theme dark --click "Bot settings" --wait-text "App connections" --click-text "App connections" --wait-text "Composio"
node scripts/verify-app.mjs rpc --name <n> botharness/connectors '{}'
```

Canonical proof without a key: `connectors` returns `configured: false` and the catalog; `connector-connect gmail` fails with `connector-not-configured`; an invalid key piped to `connector-key-set --key-stdin` fails with `invalid-input` (“Composio rejected the API key.”) and `connectors` still reports `configured: false`.

With the Owner's real Composio key that has write access to Session management, Session tool execution, Connected accounts and Auth configs (Human step, isolated Profile only; a read-only key fails `connector-connect` with a message naming those permissions): add the key, `connector-connect gmail`, finish sign-in in the browser, `connector-refresh` until `active`, grant a test Bot Read, ask it “帮我看一下最近的邮件”, and verify a send attempt is refused under Read. Change the grant to Write and ask the Bot to send a test message to a mailbox you control. Verify that a Tool Approval appears before sending, reject it, and verify that no message arrives.

## Gotchas

- A read-only Composio key lists accounts and toolkits but cannot create sign-in links or Bot sessions.

- The live sign-in and Bot turn need a real Composio key and Google account; they are not scripted.
