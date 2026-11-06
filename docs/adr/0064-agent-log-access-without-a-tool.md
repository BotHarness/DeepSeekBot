---
Status: Accepted
Date: 2026-09-24
---

# Agent log access needs no dedicated tool

Agents read the operational log database (`logs.db`, ADR-0063) with their own
shell and SQLite abilities — no model-visible tool is built for it, and
Developer Mode never gates their reads.

## Decision

1. **No `query_operational_logs` tool.** The `standard` agent preset already
   ships `bash` plus unconfined file reads, and every shell call is handed
   `DSH_HOME` — an agent can reach `$DSH_HOME/botharness/logs.db` today with
   host runtimes. A curated tool would add a second contract without adding a
   capability.
2. **The default-OFF gate cannot cover agent reads, so it does not try.**
   File reads are unconfined in every sandbox mode, which makes any
   "hidden unless enabled" promise about agent access unenforceable. Only a
   tool can truly disappear via Agent Scope — and since there is no tool, the
   gate question is moot. Developer Mode gates Human diagnostics surfaces
   only (viewer log views, verbose states); it is a visibility preference,
   never a read boundary (see `GLOSSARY.md`: Developer Mode).
3. **No owner clipping for Developer Mode reads.** A Human opens Developer
   Mode precisely to inspect across bots — including dedicated analysis bots
   and future cost analysis over traces. The `owner` column stays a
   data/filter dimension (viewer filtering, per-bot breakdowns), not an
   enforcement gate on this path.
4. **The agent contract is knowledge, not code.** A verified guide
   (`docs/dev/guides/reading-operational-logs.md`) documents location,
   read-only open, WAL handling, the `LogQuery`-equivalent SQL shapes, and
   result caps. Agents read the guide when they need it; nothing log-related
   enters prompts by default.
5. **Amends ADR-0063 §7.** That section foresaw "the future model-visible
   read tool enforces the same rule". There is no such tool, and no such
   enforcement on the agent path. The `owner` read-boundary statement stands
   for surfaces that choose to enforce it (viewer filtering, future
   Human-facing scopes) — not as a property of the database itself.

## Considered Options

- **Dedicated `query_operational_logs` tool** (structured filters, host-side
  execution) — rejected: no new capability (agents already reach the file),
  and its strongest justification (an enforceable default-OFF gate) is
  voided by unconfined reads. Research: `.humanlayer/tasks/issue-248/`
  (primary sources: DSH preset/sandbox READMEs, MCP postgres/sqlite
  servers, DSH Session Query, sqlite.org WAL docs).
- **Raw-SQL tool (MCP-postgres shape: server-owned read-only connection)**
  — rejected for v1 for the same reason: ceremony without capability. Left
  as the documented fallback if direct reads ever prove unreliable across
  backends (fresh-boot `-shm` absence, directory-write denial).
- **Direct reads plus owner enforcement in documentation** — rejected as
  dishonest: unenforceable rules teach agents to distrust documented rules.
  The guide states what is true (full read) instead.

## Consequences

- Agents querying `logs.db` open it read-only, never write, never copy the
  file without its `-wal`/`-shm` sidecars, and keep result sets bounded
  (guide: 100 default / 1000 max, mirroring `LOG_QUERY_DEFAULT_LIMIT` /
  `LOG_QUERY_MAX_LIMIT`).
- Schema stays host-side knowledge: `LogQuery` filters remain the stable
  vocabulary for the HTTP read API (`GET /api/computer/logs`); agents
  translate them to SQL via the guide. A generation migration updates the
  guide, not prompts.
- The Developer Mode setting itself (Q2, parked on another team's draft PR)
  and viewer gating by that flag follow separately; this ADR does not block
  on them.
