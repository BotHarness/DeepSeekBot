# App connections (Composio)

## Sources

- `packages/core/src/connectors/*.ts`
- `packages/core/src/features/connectors/*.ts`
- `packages/core/src/cli/cli-connectors.ts`
- `packages/client/src/client/connectors-settings.tsx`
- `packages/client/src/client/bot-connectors-section.tsx`
- `packages/client/src/client/features/connectors/*.ts`
- `packages/client/src/client/connector-request-card.tsx`
- `packages/host-client/src/connectors.ts`
- `packages/host-client/src/shared/connector-request.ts`
- `apps/mobile/src/ui/chat/bot-connector-settings.tsx`

## Terms

- App connection
- PersonaBot
- Settings

## Sub-features

- Bot Settings › App connections (应用连接), Owner only: one Composio API key row (Add key / Replace; Remove inside the dialog) and a Connected accounts list with status, Disconnect, Open sign-in, Connect an app and Check status.
- Saving a key checks it with Composio first; a rejected key is refused with `invalid-input` and nothing is stored.
- Each Bot's App connections entry: one select per shared or Bot-own account (No access / Read / Read and write). An unused one-time grant shows as "Just this once (Read)"; No access revokes it. Another Bot's own accounts are hidden.
- Chat card for `connector_request` (category **App connection**): the account label, identity, Read or Read and write, shared or the Bot's own, and the Bot's reason, then **Turn on for this Bot** / **Just this once** / **No**. Non-Owners see it read-only. When the Bot asks with a `service` and no account fits, the card is a Connect card: **Connect in Settings** opens Settings › App connections; after one account of that service connects, the grant buttons appear on the same card.
- iOS/Android: the same card is decided in place (`connector-turn-on`, `connector-once`, `approval-deny`); the Bot profile has an App connections section with one switch per account (on grants Read, off revokes). Adding accounts stays on the computer.
- Bot tools `connector_catalog` (read) and `connector_request` (always a Human approval card). The `mcp__composio__*` guard refuses ungranted services, writes under a Read grant, remote workbench/bash tools and calls after revocation.
- The connector request decision supports a single tool invocation in the requesting Session. Use `deepseekbot connector request-decide <channel-id> <message-id> --choice once` on a pending connector request. Check that the first account tool call works, a second is refused, and `bot-connectors` shows no new durable grant.
- Engine-backed Bots find granted App connection tools through `tool_search` and run them through `tool_call`. Revoke the grant between two calls in the same Session and check the second call is refused. Check a second Bot cannot find the tools unless granted the same account.
- CLI parity: `connectors`, `connector-key-set --key-stdin`, `connector-key-clear --confirm`, `connector-connect <service>`, `connector-refresh`, `connector-grant <bot> <account> --access read|write|none`, `connector-remove <account> --confirm`, `bot-connectors <bot>`, `connector catalog --bot <slug>`, and `connector grant <bot> <account> --explain`.

## How to get to it (user POV)

Bot mode → rail gear (**Bot settings** / **Bot 设置**) → **App connections** / **应用连接**. Searching settings for “connect” lists it first. Per Bot: open that Bot's settings and choose its App connections entry.

## Driving it with verify-app

Grant-card journey (no provider key needed: a remote MCP account or a store-seeded active account is enough): grant nothing, ask the Bot to use the account so it calls `connector_request`, choose **Just this once**, and check the first account tool call works and the next call asks again. Then choose **Turn on for this Bot** and check `bot-connectors` lists the grant; set **No access** in the Tools tab and check the next call is refused.

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
