---
Status: Proposed
Date: 2026-11-15
---

# Skill Invocation is snapshotted text that addresses no one

Typing `/` in a Channel or DM composer lists commands first, then Skills. The Skills come from the Host Skills plus the Project Skills of every PersonaBot in the conversation: each bot's Memory Repository and its Workspace Grants. A DM counts only that one PersonaBot. Each row shows its owner (a PersonaBot avatar, a folder for a Workspace, or a Host mark), its name and a one-line description. Picking a row inserts a chip, as `@` does.

A **Skill Invocation** addresses no one. It inserts the Skill's text into the message. Which PersonaBot reads and acts on the message follows its mentions and normal routing, never the Skill's owner. Picking Alice's Skill and mentioning Bob gives Bob that text. Ownership affects only automatic discovery: a bot's model catalog contains Host Skills and its own Memory Repository's Project Skills, and nothing else.

The Host resolves the Skill when the message is sent and stores a snapshot in a typed `ChannelMessage` part: the name, the owner (`host`, `bot:<slug>` or `workspace:<id>`), the `SKILL.md` path and the content. Every recipient therefore gets identical text, even one whose Sessions cannot discover that Skill. History stays reproducible after the Skill changes or is deleted. Bot Inbox delivery renders the snapshot as a `<skill_invocation>` block carrying its owner and path. A recipient without read authority for that path receives the text but not the files: ADR-0067's path guard still applies. External IM mirrors fall back to the plain text `/name`.

When a command and a Skill share a name, the command keeps the bare name.

Delivery is staged under #4231. The first slice covered Human DMs with Host Skills and the PersonaBot's Memory Repository Skills. Group Channels and Workspace Grant Skills extend `SkillOwner` to the `host`, `bot` and `workspace` kinds. Workspace owners use the Grant model's stable `workspaceId` as `workspace:<id>`, with a separate `name` for display; renaming that label does not change invocation identity or retry intent.

## Considered Options

- **A Skill Invocation implicitly mentions the Skill's owner** — rejected: it adds hidden rules ("whose Skill is it?") to what Humans already understand as inserted text plus explicit mentions.
- **Expand at delivery time, per recipient** — rejected: recipients could see different text, history would not reproduce, and a recipient that cannot discover the Skill would fail.
- **Plain `/name` text expanded by DSH's user-message scanner** — rejected: Channel messages reach bots as Bot Inbox text, not DSH user messages. The scanner also matches `/word` anywhere and cannot say which owner's Skill was meant.
