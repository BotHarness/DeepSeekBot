---
Status: Accepted
Date: 2026-10-06
---

# Soul and Core Memory are Session-frozen system prompt files

A PersonaBot's system prompt carries two conventional Memory files: `SOUL.md`, its **Soul** (character, voice, standing instructions), and `MEMORY.md`, its **Core Memory** (mostly an index of what it remembers, plus a few key facts). Both are read from the Memory Repository root and frozen in one snapshot at the Session's first prompt assembly, exactly as the Persona snapshot works today. This amends [ADR-0060](0060-system-prompt-prefix-is-append-only.md) rule 4 ("no generated `MEMORY.md`") and renames its rule 5 Persona to Soul. Without a standing index, every new Session starts with no idea what its Memory holds and has to rediscover it with file tools. Hermes Agent (`MEMORY.md` + `USER.md`) and Meta Muse (`Soul.md` + `Memory.md`) both inject such files, and freezing keeps the prefix byte-stable, so the cache argument behind ADR-0060 still holds.

## Decision

- **Fixed file set.** The Host injects only `SOUL.md`, then `MEMORY.md`, from the Memory Repository root. The list is a product convention in code, not a per-Bot pin setting. There is no `USER.md`: a PersonaBot works with many people across Channels and projects, so who those people are belongs in ordinary Memory files indexed from Core Memory.
- **One frozen snapshot.** Both bodies are recorded together at the Session's first prompt assembly and returned byte-for-byte afterwards, including after Host restart and cold resume. A change on disk never patches a running prefix. The only refresh point stays the compaction boundary ([#326](https://github.com/BotHarness/BotHarness/issues/326)): if either file differs, both are re-recorded together, so one Session generation sees one version. Mid-Session edits reach the Orchestrator as a [ADR-0092](0092-memory-changes-enter-bot-inbox-with-durable-observations.md) Inbox notice saying the frozen copy still applies.
- **Character limits.** Each file has a per-PersonaBot character limit (Unicode code points) set in Bot settings, defaulting to 5,000 for `SOUL.md` and 3,000 for `MEMORY.md`. A new limit applies at the next snapshot. Each section header shows usage computed at snapshot time, for example `MEMORY.md [62% — 1,860/3,000 chars]`, so the text stays fixed for the Session. An over-limit file is injected truncated with an explicit line asking the PersonaBot to consolidate it, never silently cut. Characters are the unit because a Human can count them; the official docs state the approximate token cost for Chinese and English.
- **Meaning, not method.** The Orchestrator prompt explains why the two files exist and what each represents. It does not prescribe how to write `MEMORY.md`; that convention emerges between the Human and the PersonaBot.
- **Creation and migration.** A new PersonaBot gets `SOUL.md` from the creation form or preset (#325) and a minimal `MEMORY.md` template that states its purpose. Existing PersonaBots get no backfill; an absent file injects as empty. The migration is idempotent and runs at every Host startup and after any new Memory Repository arrives (Git URL creation, Marketplace install, Profile restore): a repository with `PERSONA.md` and no `SOUL.md` gets one attributed rename commit, and one that already has `SOUL.md` is left alone. Reading falls back to `PERSONA.md` whenever `SOUL.md` is absent, for example while a rename is blocked by a dirty worktree.
- **Backup and sharing.** Profile Backup already carries every Memory file (ADR-0042), so it needs no change; a backup taken before the migration restores `PERSONA.md`, and the next startup migrates it. A Bot installed from a shared repository that still uses `PERSONA.md` gets the rename as an ordinary local commit. Git's rename detection carries later upstream edits on pull, and authors are encouraged to rename upstream so the histories converge.
- **Visible to the Human.** Both files appear pinned at the top of the Memory panel with a "常驻 / Standing" badge and usage, and are included in Memory search.

## Considered Options

- **Keep only the persona and let the Agent maintain its own index** (ADR-0060 status quo): rejected, because nothing tells a fresh Session that the index exists or that it should read it.
- **Per-Bot pinned files** (ADR-0047's Pinned Memory): rejected again, because a fixed convention is easier for Humans and Agents to reason about and needs no pin UI.
- **Byte or token limits:** rejected. Bytes penalize Chinese threefold, and tokens differ by model and cannot be counted by a Human.
- **Reject or drop an over-limit file:** rejected. The Agent writes with native file tools, so there is no write path to refuse, and dropping the whole file loses more than truncating with a notice.

## Consequences

- The Persona term becomes Soul in `GLOSSARY.md`, and the earlier Soul / SoulSnapshot / Soul registry sharing vocabulary is marked historical in favor of ADR-0131.
- PersonaBot Export ([ADR-0040](0040-personabot-export-wraps-soul-and-optional-operational-facets.md)) is retired with SoulSnapshot. One Bot is shared as its Memory Git repository (ADR-0131); a whole Profile moves through Profile Backup (ADR-0042).
- `packages/core/src/memory/files.ts` stops hiding the two root files, and the legacy write protection in `store.ts` is removed.
- The prompt snapshot row grows from one body to an ordered set of named bodies.
- Delivery is sliced in the spec issue: (1) the `SOUL.md` rename with migration and fallback, plus `MEMORY.md` frozen injection with default limits and template; (2) per-Bot limit settings, the truncation notice and the Memory panel pin; (3) official docs.
