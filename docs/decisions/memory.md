# Memory decisions

Why Memory works the way it does. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0002, 0003, 0004, 0012, 0013, 0014, 0021, 0047, 0060, 0068, 0084, 0088, 0092, 0097, 0134, 0140, 0154 and 0190, and each section lists the ADRs it absorbed.

## 1. Memory is a Git repository the Bot owns

<a id="adr-0002"></a><a id="adr-0047"></a><a id="adr-0068"></a><a id="adr-0084"></a>
_Formerly ADR-0002, ADR-0047, ADR-0068, ADR-0084._

Every PersonaBot owns one Memory Repository: an ordinary Git repository created with the Bot. The checked-out working tree **is** current Memory. Commits, branches, merges, resets, code and binary files are all valid state, and nothing has to be accepted or committed before the Bot can use it. The Orchestrator's `cwd` is the repository root, so the Bot reads, searches, edits and versions Memory with its ordinary file, Shell and `git` tools. There are no model-facing `memory_*` CRUD tools. The Memory Service owns repository identity, bounded queries for the Human UI, and recovery. It never stages, commits or hides files to make Memory "valid".

Why:

- DSH's memory plugins are scoped to a project or Session; a Bot needs one memory across all its chats.
- Plain files stay readable and editable by Humans and normal tools, and need no schema migrations. SQLite and vector stores were rejected or deferred for that reason.
- An accepted-commit gate, a Markdown-only rule and per-branch admission were tried and dropped. They contradicted the model the Human wanted, a normal Git repository the Bot organises itself, and they hid real state from the Bot.
- Sync across devices is an ordinary Git operation that the Bot performs on request, or a Profile Backup. A Host-owned sync would need the Host to hold provider credentials (ADR-0006), so it is out of scope until a new decision.

Enforced by: `memory-git.test.ts`, `memory-repository.test.ts`, `memory-integration.test.ts`. Path escapes and `.git` access are refused (`memory/jail.ts`, `memory-store.test.ts`).

## 2. The Host falls back to a Managed Git

<a id="adr-0140"></a>
_Formerly ADR-0140._

At Host start, a runnable system Git ≥ 2.28 is used as it is. Otherwise the Host uses a Managed Git: a pinned, SHA-256-verified portable build (dugite-native) that the Human installs into the Profile with one click and without admin rights. Its directory is prepended to the DSH process `PATH`, so Sessions run the same Git. When an SSH import fails, the Host retries it once over HTTPS.

Why: most users cannot install or upgrade Git themselves, and the macOS `/usr/bin/git` stub fails without `ENOENT`, which used to surface only as a generic "memory unavailable" error at Bot creation.

Enforced by: `managed-git.test.ts` (pinned checksums, mirror → GitHub fallback, corrupt or stalled downloads), `git-probe.test.ts`, `memory-activity-old-git.test.ts`.

## 3. The system prompt prefix never changes within a Session

<a id="adr-0004"></a><a id="adr-0014"></a><a id="adr-0060"></a><a id="adr-0134"></a>
_Formerly ADR-0060 and ADR-0134; ADR-0004 (memory-tree injection) and ADR-0014 (human-only `PERSONA.md`) are retired._

A Session's system prompt is byte-identical for its whole life, across Host restarts and cold resumes. Only two Memory files enter it: `SOUL.md` (Soul: character, voice, standing instructions), then `MEMORY.md` (Core Memory: mostly an index). Both are read from the repository root and frozen together at the Session's first prompt assembly. They refresh only at the compaction boundary, and both together. A mid-Session edit reaches the Bot as an Inbox notice (§5); it never patches the prefix. Each file has a per-Bot character limit (defaults 5,000 / 3,000). An over-limit file is injected truncated, with a note asking the Bot to consolidate it, and is never silently cut. When `SOUL.md` is absent, `PERSONA.md` is read in its place, and an idempotent migration renames it at startup.

Why:

- Providers cache the prompt prefix. Anything re-derived per request (a file tree, a re-read persona, pinned bodies) replaces the head, invalidates the cache for the rest of the Session and re-prices every later turn. Appending at the bottom costs only the delta.
- A fresh Session that has no index does not know what it remembers, so Core Memory is injected. Freezing keeps the cache argument intact.
- A fixed two-file convention is easier for Humans and Bots to reason about than per-file pins. Limits are in characters because a Human can count them, while bytes penalise Chinese and tokens vary by model.
- The earlier human-only persona and the injected memory tree were dropped: the Bot may revise its own Soul (the change is visible in Git), and it lists files itself when it needs to.

Enforced by: `plugin.test.ts` "freezes the persona prompt section for the Session and gives an edit to new Sessions", `memory-service.test.ts` (frozen snapshot, limits apply at the next snapshot, refresh only on change), `memory-soul.test.ts` (order, truncation note, `PERSONA.md` fallback and rename).

## 4. Memory has no visibility

<a id="adr-0013"></a><a id="adr-0021"></a>
_Formerly ADR-0021; ADR-0013 (per-entry `shared`/`private`) is retired._

Memory entries have no `visibility` or `owner`. A Bot uses everything it knows in every context it runs in. Whether a fact may leave the Bot is decided when sharing, by choosing what to share: the Memory repository for one Bot, Profile Backup for a whole Profile.

Why: the store cannot know chat shapes or whose a "private" fact is, and a Bot that is one person cannot keep separate memories per chat. Per-entry flags also gave the model recall it could not use, and it promised that recall to people anyway.

Enforced by: the `MemoryDocument` type in `memory/front-matter.ts` has no visibility or owner field, and `memory-front-matter.test.ts`.

## 5. Memory changes reach the Bot through its Inbox

<a id="adr-0092"></a>
_Formerly ADR-0092._

The Memory Service compares the branch, HEAD and bounded per-path fingerprints with a per-Bot checkpoint at Host start, before each Orchestrator turn, and before steering input into an active turn. A net change becomes one `memory-change` Source Event and Bot Inbox Admission in the same transaction that advances the checkpoint. The event carries a path and status summary, never file bodies and never a guess at who made the change. Startup scans do not wake the Bot; the next turn picks the change up.

Why: a Human edits Memory with external tools, sometimes while the Host is stopped, and the Bot must learn about it without file bodies being preloaded and without the prefix changing (§3). Reusing the Inbox gives retry, restart durability and no second wake path.

Enforced by: `bot-memory-cli.test.ts` (`memory-changes`), `memory-service.test.ts`. TB6 of #4296 adds a model-based test: no duplicate Admission for an unchanged scan, and the checkpoint advances only with its Admission.

## 6. Recovery: checkpoints, and Restore as a new commit

<a id="adr-0097"></a><a id="adr-0190"></a>
_Formerly ADR-0097 and ADR-0190._

The Memory Service records a recovery checkpoint (branch, HEAD, index tree, working tree, time, observation context) when it first sees a state, when it sees an external change, after an owned Orchestrator turn, and on each Human command. The checkpoint lives under hidden `refs/botharness/recovery/<id>` without touching the real index, working tree or history. An `agent-session` origin means the Host observed the state after that Session. It never claims the Agent wrote every byte.

**Restore to this commit** in Memory evolution first takes a checkpoint and commits any uncommitted working tree as a backup commit. It then writes the selected commit's tree as a new child commit and moves the branch with a compare-and-swap. History is never rewritten, so every later commit can be restored again. Restore is refused during an active Memory turn, while a repair is pending, or if HEAD changed since the Human looked. Version names are annotated Git tags. Checkpoint restore remains a last resort in the gear menu.

Why: a working-tree-is-Memory model means a plain checkout would lose uncommitted work and a reset would drop later commits. Keeping everything in ordinary forward Git history means Humans, Bots and remotes need no second concept. Hidden refs keep snapshots out of the visible branch history.

Enforced by: `memory-recovery.test.ts`, `memory-recovery-async.test.ts`, `memory-branch-coordination.test.ts`. TB10 of #4296 models the restore compare-and-swap in TLA+.

## 7. Humans see files and evolution separately

<a id="adr-0088"></a>
_Formerly ADR-0088._

A Bot DM has two Channel sidebar entries. **Memory files** is a read-only tree of the working tree; edit with an external editor. **Memory evolution** has the Git graph, diffs, versions and branches. Uncommitted changes are grouped as "New memories" and "Updates to existing memories" by default, with Git terminology as a preference. Both views reread state on an interval and on focus. Queries never stage or commit.

Why: the Human wanted to read current files and inspect external edits without committing them, and Git is the only authority, so there is no second file or diff store.

Enforced by: the Memory feature map entries in `verify-deepseekbot` (`memory-diffs`, `memory-restore`, `memory-images`).

## 8. A Bot's Memory commits leave a Self-Record where their cause happened

<a id="adr-0154"></a>
_Formerly ADR-0154; the Self-Record mechanism itself belongs to Messaging._

Each real Memory commit made during a turn becomes a Bot Self-Record. It appears as a Channel Notice in the Channel of the Source Event that caused it (or in the Bot's Human DM when there is no usable Channel), and as an already-handled record in the Bot's own Inbox. It is never unread and never wakes anyone.

Why: after compaction or a new Session the Bot forgets why it changed its Memory, and the Human cannot see the consequence next to its cause.

Enforced by: `bot-self-record.test.ts`, `bot-self-record-migration.test.ts`.

## 9. Structured writes keep YAML front-matter

<a id="adr-0003"></a><a id="adr-0012"></a>
_Formerly ADR-0012; ADR-0003 (writes only through memory tools) is retired._

The legacy structured Markdown write path (CLI and Human save) writes `summary`, `updated_at`, `sources` and optional `tags` front-matter and makes one commit per write. Invalid or missing front-matter degrades gracefully and is never fatal. Nothing reads front-matter into the prompt (§3), and files written with ordinary tools need none.

Why: it keeps audit fields for Human and CLI writes without making them a rule for files the Bot writes natively.

Enforced by: `memory-front-matter.test.ts`, `memory-git.test.ts` ("makes exactly one commit per write with summary and sources").
