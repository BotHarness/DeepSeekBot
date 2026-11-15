---
Status: Proposed
Date: 2026-11-15
---

# Project Skills travel with their directory

A PersonaBot's Skills are the **Project Skills** of its Memory Repository: `SKILL.md` folders under `<Memory Repository>/.agents/skills/`. They are not a separate kind of Skill and have no store of their own. The Orchestrator Session's cwd is already the Memory Repository, so DSH's file-skill discovery finds them, and in that PersonaBot's own Sessions they override a **Host Skill** of the same name, without BotHarness registration code. A folder covered by a Workspace Grant contributes Project Skills the same way. BotHarness scans only the granted root itself (`.agents/skills` and `.dsh/skills`) and does not walk up to an enclosing Git root, so visibility never exceeds the Grant.

Installing a Skill is a file write. A PersonaBot decides where a Skill belongs. If it is the bot's own capability, it goes in the Memory Repository, which the bot may write freely. If it is a project convention, it goes in a Workspace folder, under the existing write authority. Memory's Git history is the record of these writes, so no separate activity entry is created. A Human removes a Project Skill by deleting its files; there is no disabled state.

Because Project Skills are ordinary text files in the Memory Repository, they travel with every existing way of sharing a PersonaBot: the Memory Git repository, a Bot Zip and a Profile Backup. This differs from ADR-0044. That ADR rejects embedding or auto-installing Skills as **Host** runtime dependencies. A Project Skill is part of the PersonaBot's own content, not a Host dependency. On a target Host, the Project Skills arrive with the rest of the PersonaBot's Memory and are discoverable as soon as the PersonaBot is installed or imported. They get no separate Skill review: they carry the same trust as the Memory content they live in. The marketplace detail page and the PersonaBot profile show a Skills section listing the Memory Repository's Project Skills. Workspace Skills belong to the project and are not listed there.

## Considered Options

- **A `.botharness/skills/` folder with a BotHarness skill provider** — rejected: DSH does not scan it. BotHarness would need a per-bot provider, but DSH registrations are scoped only to an agent preset. It would also diverge from the `.agents/skills` layout that Humans and cross-agent tooling already use.
- **A separate "Bot Skill" concept** — rejected: it has the same mechanism as any Project Skill. A second name would suggest storage or rules that do not exist.
- **Walk up to the enclosing Git root like DSH** — rejected for BotHarness listings: a Grant on a monorepo subfolder would expose Skills outside the granted folder.
- **Export only Desired Dependency References and leave the Skill files behind** — rejected: Skills are a defining part of what a PersonaBot can do, and they are plain text that already lives in its Memory.
- **Hold imported Skills in a pending folder until a Human reviews them** — rejected: the rest of the Memory Repository, which also shapes the PersonaBot's behavior, is not held back. A Skill-only gate would add a second copy of each Skill, a move on acceptance, and conflicts with the Memory Git repository shared between Hosts, without closing a gap the Memory itself leaves open.
