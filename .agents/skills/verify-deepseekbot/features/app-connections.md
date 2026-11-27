# App connections

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
- CLI parity: `connectors`, `connector-key-set --key-stdin`, `connector-key-clear --confirm`, `connector-connect <service>`, `connector-refresh`, `connector-grant <bot> <account> --access read|write|none`, `connector-remove <account> --confirm`, `bot-connectors <bot>`.

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

With the Owner's real Composio key that has write access to Session management, Session tool execution, Connected accounts and Auth configs (Human step, isolated Profile only; a read-only key fails `connector-connect` with a message naming those permissions): add the key, `connector-connect gmail`, finish sign-in in the browser, `connector-refresh` until `active`, grant a test Bot Read, ask it “帮我看一下最近的邮件”, and verify a send attempt is refused under Read.

## Google Workspace journey

Use an isolated Host and a Google OAuth Web client for a test account. Run `connector setup google` and check the loopback redirect URI and API list. Pass the secret on stdin to `connector add google`. Open the URL from `connector login google --account Work` in a browser on the Host. Run `connectors` and check that the account is active. Sign in with a second account under another label. Verify each Bot reads only its assigned account with `bot-tool <bot-id> google_gmail_search --args-stdin` and compare the account labels in `connectors`. With two eligible accounts on one Bot, pass `account` explicitly. Revoke a grant and verify the next tool call fails.

Grant Write to one Bot, reconnect that account, and verify the Google consent includes Gmail draft and primary-calendar write access. Try an event creation and reject the Tool Approval, then read the calendar to confirm there is no event. Approve a second call and read back the event. Restart the same Profile and repeat a read. The fake-provider tests also cover single-use state, PKCE, concurrent refresh, provider failure, multiple Bot grants, and the Write scope gate.

## Gotchas

- A read-only Composio key lists accounts and toolkits but cannot create sign-in links or Bot sessions.

- The live sign-in and Bot turn need a real Composio key and Google account; they are not scripted.
