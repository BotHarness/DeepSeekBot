---
Status: Accepted
Date: 2026-10-14
Issues: [#1606](https://github.com/BotHarness/DeepSeekBot/issues/1606), [#1571](https://github.com/BotHarness/DeepSeekBot/issues/1571)
---

# Approved secret MCP servers can be remembered

ADR-0195 let a Bot start an MCP server with Owner secrets after an approval for each start, and kept nothing: after a Host restart the Bot had to ask again and the Human had to approve again. There was also no place to see which servers a Bot uses. ADR-0195 left both for a later decision.

## Decision

The approval card for starting a server offers three choices: allow once, allow and remember, reject.

- **Allow once** is unchanged: nothing is stored.
- **Allow and remember** stores the approved start for that PersonaBot: server name, program, arguments, the environment variable names with their placeholders, the account and its references. It stores no secret value. When that Bot's Orchestrator Session starts, the Host starts each remembered server the same way as an approved start: no shell, in the Shell sandbox, values resolved from the Bot's grant at that moment.
- The Bot's settings list its remembered servers under Secrets, with the command, the account, when it was approved and whether it is connected now. Removing one stops it and forgets it. Disconnecting through the Bot forgets it as well. Deleting the Bot erases its records.

Remembering is not a Tool Approval Rule. It covers exactly the stored start for that Bot; a start with any different program, argument or variable is a new request with a new card. It can be chosen only on the Web card, not from an external IM.

## What this changes in ADR-0195

"One approval per start" becomes "one approval per distinct server". A remembered server runs again without a card, so a launcher that fetches a package may run a newer version of that package than the one first approved. The settings row shows the command so the Human can see what will run; removal is one click.

If the account was replaced or revoked, the stored references no longer resolve and the server does not start. The record stays listed as not connected until the Human removes it or the Bot connects again with a new approval, which replaces it.

## Consequences

A new table holds the records (schema generation 88). The approval broker's each-use mode can mark a call as rememberable; choosing remember saves no rule and is reported to the tool body through the call itself.
