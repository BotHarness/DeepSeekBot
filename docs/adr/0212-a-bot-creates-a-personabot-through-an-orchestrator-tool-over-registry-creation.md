---
Status: Accepted
Date: 2026-10-15
Issues: [#1858](https://github.com/BotHarness/DeepSeekBot/issues/1858)
---

# A Bot creates a PersonaBot through an Orchestrator tool over Registry creation

A Human talking to a PersonaBot could not ask it to set up another PersonaBot; they had to open the create dialog or run `deepseekbot create` and switch back. We decided that **a PersonaBot creates another PersonaBot only through the Orchestrator Bot tool `bot_create`, a thin layer over the same `PersonaBotRegistry.create` the create dialog and the CLI use, under the normal tool approval with no special case.**

## Decision

- **One creation path.** `bot_create` mints a Bot ID and calls Registry creation with the Display name, Bot Bio, Bot Tags, an Avatar read from a file, the Soul (`SOUL.md`), the Core Memory (`MEMORY.md`, template when absent) and an optional Memory location. Blank creation only; zip, Git and Marketplace imports stay in the dialog and the CLI (ADR-0156).
- **Normal approval.** `bot_create` needs Human tool approval the way `channel_attachment_open` edit-original does: permission mode, saved Tool Approval Rules, Approval Templates and IM approvers apply unchanged. A card, when one is shown, previews the new Bot: name, Avatar, Tags, Bio, the first lines of the Soul and Core Memory, and the Memory folder to be created.
- **Only the Orchestrator.** Assignment Agents don't get the tool.
- **Avatar files the Bot can read.** `avatar_path` must be inside the creating Bot's Memory Repository or an active Workspace Grant, and passes the same bounded image checks as `bot-avatar-set` (ADR-0086).
- **Independent peer.** The new Bot copies nothing from its creator: no Workspace Grants, Computer or Browser Access, secrets, Approval Template or Model Plan. Its model follows the usual "no model yet" rule.
- **Visible result.** The Host opens the new Bot's DM, and the creator gets a `botCreateAction` Bot Self-Record (ADR-0154) in the Channel that caused the call, linking to the new Bot.
- **CLI parity.** `deepseekbot bot-tool <bot> bot_create --args-stdin` runs the tool without the model, and `deepseekbot create` takes `--avatar-file` and `--core-memory`/`--core-memory-stdin`.

## Considered Options

- **The Bot runs `deepseekbot create` from its Shell:** rejected. It needs Host connection setup, skips the approval preview and leaves no record in the Channel.
- **Always ask the Human, with no saved rule:** rejected by the Human. Creating a Bot follows the same rules as every other tool.

## Consequences

- The approval card carries an optional `botCreatePreview` with a bounded Avatar data URL and the Memory folder path.
- The `botCreateAction` notice joins the Channel Notice fields; its search text is not yet in the Inbox history FTS view, so `inbox_history` finds it by kind (`bot-action`) rather than by text.
