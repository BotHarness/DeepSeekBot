---
Status: Accepted
Date: 2026-10-26
---

# Assignments carry a Title and a Description instead of one purpose

`create_assignment` takes a required short Assignment Title (about 40 characters) and an Assignment Description of one or two sentences, chosen by the Orchestrator. The Description replaces the old free-text `purpose`; there is no separate stored prompt, because the instructions an Assignment Session works from still arrive through Assignment Requests. `list_assignments` returns both fields and its text search covers both, alongside the Continuity Key and the latest report summary. Existing rows migrate by moving `purpose` to the Description and deriving a Title from its start.

## Why

The mobile Bot profile (proposal `docs/proposals/mobile-bot-profile-tabs.md`) lists a Bot's Assignments the way Meta Muse lists agent tasks: a title line, a description line and a time. A single `purpose` string is either too long to scan as a row or too short to explain the work, and the Orchestrator re-reading its own Assignment Directory has the same problem. Storing a third field for the prompt was rejected: it would duplicate the first Assignment Request and drift from it.

## Consequences

- The `assignments` table gains `title` and renames `purpose` to `description`; the CLI, bridge methods and Web session sidebar read the new fields.
- An Orchestrator that calls `create_assignment` without a Title gets a validation error that names the field.
