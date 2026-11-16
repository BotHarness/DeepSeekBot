---
Status: Accepted
Date: 2026-09-20
---

# PersonaBot Export wraps Soul and selected operational facets

> Retired by [ADR-0134](../decisions/memory.md#adr-0134): with SoulSnapshot superseded by Memory Git repository sharing (ADR-0131) and whole-Profile moves owned by Profile Backup (ADR-0042), there is no per-Bot export package. "Soul" below means the old shareable-Memory concept, not today's `SOUL.md`.

A **PersonaBot Export** is an immutable, schema-versioned transfer package that always contains one SoulSnapshot and may contain explicitly selected operational **Export Facets**. Its default selection is Persona plus Human-selected Memory only. SoulSnapshot remains the content-addressed sharing and registry unit; the outer package exists for backup, handoff, and clone workflows that need more than identity content without redefining a Soul.

Optional facets may include selected Source Events and Source Revisions, content-addressed Attachments, Channel placements, Inbox Admissions and Attention Decisions, Inbox Triggers and Wake Policies, a Messaging Archive, non-secret provider account references, and Service Grant declarations. Each facet has its own schema version, selection manifest, redactions, provenance, and dependency closure. Selecting an Inbox, Channel, Attention, or Outbox fact automatically includes every required Source Event, Revision, Attachment metadata record, and provenance ancestor. A Human may replace sensitive content with a typed **Redaction Tombstone** that preserves resolvable identity, hashes, dependencies, and omission reason; dangling references and silent content loss are invalid. Per-Channel NDJSON is a derived view inside a Messaging Archive, never a second authority.

Credentials never travel. Provider account references import only as inactive Rebinding Requests, and Service Grant declarations import disabled and pending explicit Human reauthorization against a locally connected account. Import always creates a fresh PersonaBot identity. Every imported PersonaBot, Channel placement, Inbox fact, Trigger, Grant declaration, and other locally identified object receives a fresh local id plus an **Export Origin** containing the export id, source installation id, and source local id. Provider message/account ids remain namespace-scoped provenance, never local authority. A selected Outbox facet may preserve terminal attempts and Unknown Outcome evidence for audit, but every pending, in-flight, retryable, or needs-Human row imports as inert history outside the dispatcher's executable set. Sessions and AgentHandles are never facets. No imported Trigger, Wake Policy, Reply Route, Grant, account reference, or external-action record can admit, wake, send, resume, or retry merely because it appeared in the package.

PersonaBot Export and Messaging Archive files use operating-system file permissions in v1; BotHarness does not invent custom at-rest encryption. The export surface must identify sensitive facets before writing them, and managed backup encryption may be added later as an envelope concern. Publishing remains narrower: the Soul registry accepts the SoulSnapshot only and never operational facets.

Clone/import and disaster restore are different operations. PersonaBot Export always creates a new PersonaBot identity and cannot claim the source Bot's live identity. A profile-level Managed Restore is the only path that may preserve local identities; it consumes a separately managed, quiesced snapshot, rejects identity conflicts, and reapplies the Purge Ledger before Messaging mounts. PersonaBot Export is not a shortcut around those restore safeguards.

Ordinary import is idempotent by `(destination profile, export id)`. Its durable Import Receipt returns the original result when a retry, double-click, or restarted operation submits the same package again. A Human may explicitly choose “create another independent Clone”; that creates a distinct receipt and another complete set of fresh local ids while retaining the same Export Origins.

## Considered Options

- **Expand SoulSnapshot to contain all selected runtime state** — rejected: it would turn a portable identity package and registry artifact into a security-sensitive database clone.
- **Allow only SoulSnapshot forever** — rejected: backup, handoff, and cloning may legitimately need message provenance, attention facts, or provider configuration shape.
- **Export raw SQLite tables** — rejected: table layout is an implementation detail, references may dangle, redaction cannot be explained cleanly, and imports would inherit local identifiers and authority accidentally.
- **Carry credentials or active grants** — rejected: possession of an export must not become provider authorization.
- **Make all operational facets default** — rejected: the common sharing action should not silently disclose messages, account descriptors, or authorization history.
- **Treat per-Channel NDJSON as a second canonical log** — rejected: it reintroduces the dual-authority problem eliminated by ADR-0037.
- **Resume pending actions or Sessions from an imported PersonaBot Export** — rejected: copied work may be stale or may duplicate an irreversible external side effect.
- **Let ordinary import preserve the source PersonaBot identity** — rejected: two live installations could then claim the same local authority; identity-preserving recovery belongs to Managed Restore.
- **Preserve every source local id until a collision occurs** — rejected: collision-dependent identity makes repeated imports nondeterministic and can let copied authority masquerade as local state.
- **Discard all source ids** — rejected: audit, deduplication analysis, and reconciliation still need a structured provenance chain.
- **Allow selected facets to contain dangling references** — rejected: partial graphs cannot be explained or safely re-imported; a typed redaction preserves shape without disclosing content.
- **Always create a new Clone for repeated submission of the same export** — rejected: retries and double-clicks would silently duplicate PersonaBots and operational history.
- **Forbid a deliberate second Clone** — rejected: one immutable template may legitimately seed several independent PersonaBots.

## Consequences

- Export UI starts with Persona plus selected Memory and offers operational facets as explicit checkboxes with size, sensitivity, and dependency previews.
- The package manifest distinguishes the required SoulSnapshot from optional facets and records format versions, hashes, provenance, redactions, and dependency closure.
- Import can restore historical facts while keeping all operational capabilities inert until local rebinding and authorization complete.
- Imported Outbox and Unknown Outcome facts are audit-only; they never enter executable queues, and live Session state is absent.
- Messaging Archive is portable and versioned; its optional NDJSON views serve humans and tools without participating in runtime writes.
- Clone/import creates new local ids with Export Origin provenance; external provider ids remain scoped evidence rather than authority. Managed Restore is the separate identity-preserving recovery path.
- Export selection computes a dependency closure; sensitive bodies may become Redaction Tombstones, but references never dangle.
- An Import Receipt makes the default path idempotent while an explicit additional-Clone action remains available.
- ADR-0020 continues to define SoulSnapshot and registry semantics; this ADR defines the wider transfer envelope.
