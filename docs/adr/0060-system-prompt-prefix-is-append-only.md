---
Status: Accepted
Date: 2026-09-22
Amended by: ADR-0092 (Memory change Inbox events), ADR-0134 (Soul and Core Memory snapshot)
---

# The system prompt prefix is append-only

> Amended in part by [ADR-0134](0134-soul-and-core-memory-are-session-frozen-system-prompt-files.md): `SOUL.md` (renamed from `PERSONA.md`) and `MEMORY.md` now enter the prompt from one Session-frozen snapshot. Rule 4's "no `MEMORY.md`" no longer holds; the append-only prefix rule does.

A Session's system prompt is a byte-identical prefix for the Session's whole life. Only static role, rule, and persona text enters it; nothing re-derived from Memory content, repository listings, or Human edits is assembled into it per request. New information reaches the model at the bottom of the conversation — a new user or tool message — because replacing the head of a long context invalidates the provider's cached prefix and re-prices every subsequent turn.

For BotHarness this decides six things:

1. **No derived state in the system prompt.** The Orchestrator and Assignment role prompts and the Session's persona snapshot are the only BotHarness-contributed sections. Their text is fixed when the Session first assembles a prompt.
2. **Append, never rewrite.** Prompt context grows by appending new turns and tool results. No component splices fresh facts into, or re-renders, an earlier prefix.
3. **No Memory Tree.** There is no tree, index, or listing prompt section. The Agent is told where its Memory Repository is and explores it with ordinary file tools (`read`, `grep`, `glob`, Shell, `git`).
4. **No generated `MEMORY.md` and no Pinned Memory.** Nothing auto-generates an index or injects selected file bodies. The Agent may maintain an index of its own as an ordinary file, and it reads what it decides to read.
5. **Persona is a Session snapshot.** The first prompt assembly for an owned Session durably records the current `PERSONA.md` body (or its emptiness) on the Session's ownership row; every later assembly — including after a Host restart or a cold resume — returns those exact bytes. A Human edit reaches Sessions that have not snapshotted yet; it never patches a Session that has. ADR-0092 permits a bottom-of-context Inbox notice about the file change without changing this snapshot.
6. **Memory changes use Bot Inbox.** ADR-0092 supersedes the original blanket rejection below: net repository changes observed between turns, including after Host restart, enter the existing durable Bot Inbox without modifying the prompt prefix or duplicating a tool result for a Bot-owned write.

## Cost reasoning

Providers cache the token prefix of a conversation, so a stable prefix turns every later turn into a cache hit over the whole prior context. A section whose text changes per request — a file tree with mtimes, a re-read persona body, an injected pin — does not merely add a few tokens. It replaces the head, invalidates N cached tokens for the rest of the Session, and makes every subsequent turn pay full input price again. Appending at the bottom costs only the new delta. Byte stability is therefore worth more than any small prompt-size optimization; the cheapest correct bytes are the ones the model already cached.

## The persona snapshot

The snapshot is stored on the `session_ownership` row (`persona_snapshot`, `persona_snapshot_at`), the same durable row that already answers which PersonaBot owns the Session. An empty body is a real snapshot — it distinguishes "this PersonaBot has no `PERSONA.md`" from "no snapshot has been taken". An unready repository records nothing and contributes no persona, so a later repair can still establish a first baseline. Re-owning a Session to another PersonaBot clears the snapshot, because the Session's identity, Memory Repository, and persona change together; the next assembly re-baselines it. A cold-resumed Session reads the recorded snapshot rather than the file, so a restart cannot silently rewrite its prefix.

## Rejected alternatives

- **A Memory Tree prompt section** (even date-only and memoized): any listing is derived state whose change re-renders the prefix; the Agent can list files itself when it actually needs to.
- **A generated `MEMORY.md` index**: a second authority that must be kept in sync with the files, and reading it still requires reading the files.
- **A pin budget and pinned full-body injection**: pins reward pre-loading bodies the turn may not need and tie prompt content to repository byte accounting; file reads are already bounded and on demand.
- **Per-tool Memory-update notices or prompt patches**: they duplicate tool output or change the fixed prompt prefix. ADR-0092 instead observes net repository changes and uses an existing Inbox Admission without an independent wake.
- **Re-reading the persona file per request, or caching it only in runtime memory**: a file edit or a Host restart would change or lose the Session's prefix; the snapshot must be durable and first-write-wins.
- **Patching a running Session with a "persona changed" line**: it rewrites the head for a fact the Session does not need mid-life; an edit applies to new Sessions instead.

## Consequences

This supersedes ADR-0004 entirely and supersedes ADR-0047's pinned-body, pin-budget, and generated-index consequences; ADR-0047's repository lifecycle, file-first Agent access, and accepted-commit boundary remain. ADR-0012's front-matter remains but pin metadata is no longer consumed by prompt assembly. GLOSSARY.md drops **Pinned Memory** and describes Persona as snapshot-delivered. The plugin exposes one persona prompt section whose bytes are constant per Session, and the removal of the tree renderer, the `MEMORY.md` writer, and the tree cache is part of implementing this decision. Evidence for the invariant is a test that edits `PERSONA.md` mid-Session and asserts the prompt section bytes do not change.
