---
Status: Proposed
Date: 2026-11-15
---

# Project Skills travel with their directory

A PersonaBot's Skills are the **Project Skills** of its Memory Repository: `SKILL.md` folders under `<Memory Repository>/.agents/skills/`. They are not a separate kind of Skill and have no store of their own. The Orchestrator Session's cwd is already the Memory Repository, so DSH's file-skill discovery finds them, and in that PersonaBot's own Sessions they override a **Host Skill** of the same name, without BotHarness registration code. A folder covered by a Workspace Grant contributes Project Skills the same way. BotHarness scans only the granted root itself (`.agents/skills` and `.dsh/skills`) and does not walk up to an enclosing Git root, so visibility never exceeds the Grant.

Installing a Skill is a file write. A PersonaBot decides where a Skill belongs. If it is the bot's own capability, it goes in the Memory Repository, which the bot may write freely. If it is a project convention, it goes in a Workspace folder, under the existing write authority. Memory's Git history is the record of these writes, so no separate activity entry is created. A Human removes a Project Skill by deleting its files; there is no disabled state.

Because Project Skills are ordinary text files in the Memory Repository, they travel with every existing way of sharing a PersonaBot: the Memory Git repository, a Bot Zip and a Profile Backup. This differs from ADR-0044. That ADR rejects embedding or auto-installing Skills as **Host** runtime dependencies. A Project Skill is part of the PersonaBot's own content, not a Host dependency. On a target Host, the Project Skills arrive with the rest of the PersonaBot's Memory and are discoverable as soon as the PersonaBot is installed or imported. They get no separate Skill review: they carry the same trust as the Memory content they live in. The marketplace detail page and the PersonaBot profile show a Skills section listing the Memory Repository's Project Skills. Workspace Skills belong to the project and are not listed there.

## In Assignment Sessions

An Assignment Session's cwd is a Workspace folder, so DSH's file-skill discovery does not reach the PersonaBot's Memory Repository. BotHarness registers one Skill provider through that Assignment Agent's own scoped context. DSH files the registration in that Agent's layer, so only that Assignment sees the PersonaBot's Memory Skills; other PersonaBots' Assignments and Orchestrators do not. The `skill` tool loads them by name like any other Skill, with source `bot-memory`. Orchestrator Sessions need no provider, because their cwd is the Memory Repository.

When names clash, the Workspace wins: a Workspace Project Skill hides a Memory Skill of the same name. The Assignment is doing work inside that project, so the project's convention governs. This matches DSH, which ranks project Skills above personal ones. A Workspace Project Skill here means one DSH itself discovers for the Assignment: `.dsh/skills` or `.agents/skills` at the nearest enclosing Git root of the cwd, or the cwd when there is none. The provider applies the same rule on disk instead of asking DSH's outer registry layer, because the BotHarness plugin loads its own copy of the scope module and cannot see DSH's preset binding. A Skill under a monorepo subfolder Grant below that root is not discovered by DSH in the Assignment, so it does not hide a Memory Skill; the `/` menu still offers it as a snapshot. A Memory Skill still hides a Host Skill of the same name, as it does in the Orchestrator. In order: Workspace Project Skill, then Memory Skill, then Host Skill. A Memory Skill edit invalidates the native catalog through the existing Skill watcher, so a running Assignment sees it on its next catalog read.

## Considered Options

- **A `.botharness/skills/` folder with a BotHarness skill provider** — rejected: DSH does not scan it, and it would diverge from the `.agents/skills` layout. (A per-Agent provider is used only to reach the Memory Repository from an Assignment; see above.)
- **A separate "Bot Skill" concept** — rejected: it has the same mechanism as any Project Skill. A second name would suggest storage or rules that do not exist.
- **Walk up to the enclosing Git root like DSH** — rejected for BotHarness listings: a Grant on a monorepo subfolder would expose Skills outside the granted folder.
- **Export only Desired Dependency References and leave the Skill files behind** — rejected: Skills are a defining part of what a PersonaBot can do, and they are plain text that already lives in its Memory.
- **Hold imported Skills in a pending folder until a Human reviews them** — rejected: the rest of the Memory Repository, which also shapes the PersonaBot's behavior, is not held back. A Skill-only gate would add a second copy of each Skill, a move on acceptance, and conflicts with the Memory Git repository shared between Hosts, without closing a gap the Memory itself leaves open.
