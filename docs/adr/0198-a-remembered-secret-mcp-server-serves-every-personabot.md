---
Status: Accepted
Date: 2026-10-14
Issues: [#1613](https://github.com/BotHarness/DeepSeekBot/issues/1613), [#1606](https://github.com/BotHarness/DeepSeekBot/issues/1606)
---

# A remembered secret MCP server serves every PersonaBot

ADR-0196 let the Human remember an approved MCP server for the Bot that asked for it. Its secret, like every private grant since ADR-0164, could be used only by the Bot that requested it. A second Bot that needed the same integration had to be asked to set it up and the Human had to enter the secret again. The owner decided that an MCP server is a common capability of the Profile: once set up, any Bot should be able to use it, switched on in that Bot's settings like any other setting.

## Decision

A remembered server is listed in the settings of every PersonaBot in the Profile.

- The Bot that set it up has it connected whenever its Session starts, as before.
- Every other Bot shows it with a switch that is off. Turning the switch on connects the server for that Bot at once if its Session is running and at each later Session start. Turning it off stops that Bot's copy.
- Each Bot's Orchestrator Session runs its own server process. The Host starts it with the secret of the Bot that set the server up. The enabling Bot receives the server's tools. It does not receive the references and cannot use the secret through `secret_http`, `secret_cli` or a start of its own.
- Every process is a registered use of that one grant. Revoking the account stops the server for every Bot; deleting the Bot that set it up erases the record and the switches and stops it everywhere. Removing the server in any Bot's settings removes it for all.
- Allow once stays private to the Bot and Session that asked.

## What this changes

Until now a private grant was usable only by the Bot it was given to. A remembered MCP server is the one exception: the Human, by turning the switch on for another Bot, extends that grant for that exact start to that Bot. Only the authenticated Owner can turn it on; a Bot cannot.

A Bot that takes part in Groups or external IM conversations can be steered by other people into calling a server enabled for it. Each tool call still goes through the ordinary approval unless the Human saved a rule for it or turned on full access. Leaving the switch off by default keeps that exposure to the Bots the Human chose.

Tool results are masked for every Bot as before.
