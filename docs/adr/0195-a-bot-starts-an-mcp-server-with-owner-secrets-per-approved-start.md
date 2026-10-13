---
Status: Accepted
Date: 2026-10-14
Issues: [#1571](https://github.com/BotHarness/DeepSeekBot/issues/1571), [#1562](https://github.com/BotHarness/DeepSeekBot/issues/1562)
---

# A Bot starts an MCP server with Owner secrets, one approved start at a time

> Amended by [ADR-0196](0196-approved-secret-mcp-servers-can-be-remembered.md): the Human may remember an approved server, which is then reconnected when the Bot's Session starts.

`secret_http` covers one HTTP request and `secret_cli` one command (ADR-0189, ADR-0191). An integration that needs a client library or several related calls is usually published as an MCP server that reads its credential from the environment. DSH can run such a server from Profile configuration, but only with the secret written into that configuration or the Host's own environment, for every Agent in the Profile. The fixed MCP consumer of ADR-0170 went away with the protected Profile (ADR-0192).

## Decision

An Orchestrator has `secret_mcp_connect`. It names a server, a bare launcher program, its arguments, and environment variables whose values hold `{{field}}` placeholders. After approval the Host fills the placeholders from that Bot's grants and mounts DSH's MCP client for that Orchestrator Session only. The server's tools appear as `mcp__<server_name>__<tool>`.

- **No shell, same sandbox as Shell.** The launcher is started directly through DSH's sandbox with the Bot's working folder as the writable root, so the credential store read denial applies. A shell as the program, a path, a placeholder in an argument and loader-changing variable names are refused before any card. Launchers such as `npx`, `uvx` and `node` are allowed, because that is how MCP servers are started.
- **Clean environment.** The search path, home, locale, the named variables, and package caches redirected to the temp area so a launcher can install inside the sandbox. DSH's MCP client would add the Host's own environment, so the Host starts the server through a small launcher that keeps only those variables.
- **One approval per start.** The card shows the program, every argument and the placeholders, and offers allow once and reject only. A saved rule never covers it and it cannot be decided from an external IM.
- **Ordinary approval per tool call.** Each `mcp__…` call goes through the existing approval, where a Human may save a rule for a call they trust.
- **Lifetime.** The server runs until `secret_mcp_disconnect`, until the account is revoked, or until the Session or Host ends. It is a registered use of the grant, so revocation stops it. It is not restarted automatically and is not available to Assignments.
- **Masked results.** The secret is masked in every string of a tool result, in raw, base64, hex and URL-encoded form.

## What this does not promise

The server is code that receives the secret and keeps running. A launcher that fetches a package runs whatever that package contains. The sandbox limits where it can write, not what it reads or where it connects. The control is the Human reading the program and arguments before approving the start; masking is a courtesy.

Reconnecting after a restart needs a new approval. Remembering approved servers per Bot, and listing them in settings, is left for a later decision once this slice has been used.

## Consequences

The approval broker's `each-use` mode now covers two tools. A third Host-run consumer joins `secret_http` and `secret_cli`; all three share the store, the references and the revocation path.
