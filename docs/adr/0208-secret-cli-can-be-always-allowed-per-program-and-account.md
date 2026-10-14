---
Status: Accepted
Date: 2026-10-14
Issues: [#1822](https://github.com/BotHarness/DeepSeekBot/issues/1822)
---

# `secret_cli` can be always allowed per program and account

> Amends [ADR-0191](0191-a-bot-runs-a-command-line-tool-with-owner-secrets-per-approved-call.md): a `secret_cli` call no longer needs a card every time.

ADR-0191 made every `secret_cli` call ask the Human, offered only allow once and reject, and kept the decision off external IM. The reasoning was that the Human reading each command line was the real control. In practice a Bot that uses one command-line tool with one account asks the same question many times, and the Human approves it without reading. The owner called this a design mistake: approving a class of call once should be possible, as it is for other tools. ADR-0191 had already named the right class: an account bound to the programs allowed to use it.

## Decision

The `secret_cli` approval card offers **allow once**, **always allow this kind**, and **reject**.

- **The kind** is the program name, the account the placeholders resolve from, and the set of environment variable names. Arguments are not part of it. A call with a different program, account or variable set is a new kind and gets a new card.
- An always-allow is a Tool Approval Rule with a new `secret-cli` kind. It belongs to one PersonaBot and role, is listed with the Bot's other rules, and can be revoked like them. It stores no secret value.
- Both choices can be made from an external IM by a current Approver, the same as an ordinary operation approval. A rule saved from IM depends on that Approver's pairing, like every Tool Approval Rule with an external creator.
- Everything else in ADR-0191 stays: no shell, interpreter or launcher as the program, no placeholder in an argument, the Shell sandbox, a clean environment, a two-minute limit and masked output.

`secret_mcp_connect` keeps ADR-0196's per-server remembering and does not change here.

## Consequences

- Under an always-allow rule, a Bot can run the program with any arguments, including a subcommand that prints the credential. ADR-0191's "What this does not promise" now applies per kind, not per call. The Human decides that when they choose always-allow, and the card says so in one line.
- The `each-use` external-decision mode no longer means "never saved". `ToolApprovalRuleStore.match` gains a branch for the `secret-cli` kind that compares program, account and variable names.
