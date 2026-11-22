---
Status: Accepted
Date: 2026-11-22
Issues: [#4860](https://github.com/BotHarness/DeepSeekBot/issues/4860)
---

# ADR-0361: Model Presets store one sub choice list

## Context

A Model Preset previously stored model choices, Routing Group choices, and their defaults in separate fields. That shape required a placeholder model even when the intended sub choices were all groups, and only the pinned Default preset could say that sub follows main.

## Decision

The preset owner stores `sub: { choices, default }`. The ordered choices can mix models and Routing Groups. The default identifies exactly one choice and uses that choice's default reasoning effort. An empty list and null default follow main. Applying a named preset still copies the effective choices into the Bot's Model Plan; Bots without a plan resolve the current pinned Default.

The Host migrates legacy preset rows by ID without changing revisions. It retains the legacy fields for existing Clients. Historical Open Assignment Models retains its role- and catalog-constrained behavior; replacing sub via the new write path closes it. The Orchestrator reads its effective choices from `list_assignment_models`; Assignment creation validates the selection and current grants before claiming a Session. A resting single model does not move the Session to another choice; Routing Groups retain [their own fallback](0355-model-fallback-is-host-owned-at-step-boundaries.md).

## Consequences

- New sub writes replace the list and default at one checked revision. No new Assignment-specific configuration store or permission owner is introduced.
- Legacy Clients can still read and edit presets during the migration to the new editor. Existing Bot snapshots, Assignments, and Session routes are not rewritten.
- Rollback after a Profile migrates requires an operational database recovery plan; the legacy projection is not a downgrade of its schema generation.
