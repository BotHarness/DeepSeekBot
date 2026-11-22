---
Status: Accepted
Date: 2026-11-22
Issues: [#4860](https://github.com/BotHarness/DeepSeekBot/issues/4860)
---

# ADR-0361: Model Presets store one sub choice list

## Context

A Model Preset previously stored API model choices, Routing Groups, a separate Assignment Subscription Engine, and their defaults in separate fields. That shape required a placeholder model even when the intended choices were Routing Groups, and only the pinned Default preset could say that sub follows main.

## Decision

The preset owner stores `sub: { choices, default }`. The ordered choices can mix API models, Subscription Engine account models, and Routing Groups. An engine choice identifies its engine, account, and model, with a saved effort and optional note. Omitted account, model, or effort fields retain the existing Subscription Engine defaults. The default identifies exactly one choice and uses that choice's default reasoning effort. An empty list and null default follow main. Applying a named preset still copies the effective choices into the Bot's Model Plan; Bots without a plan resolve the current pinned Default.

The Host migrates legacy preset rows by ID without changing revisions. The engine backfill appends the legacy `assignmentEngine` as the default and keeps existing API model and Routing Group choices as alternatives. It retains legacy fields for existing Clients. Historical Open Assignment Models retains its role- and catalog-constrained behavior; replacing sub via the new write path closes it. The Orchestrator reads its effective choices from `list_assignment_models`; Assignment creation validates the selection and current grants before claiming a Session. A resting API model or Subscription Engine account refuses creation. Routing Groups retain [their own fallback](0355-model-fallback-is-host-owned-at-step-boundaries.md).

## Consequences

- New sub writes replace the list and default at one checked revision. Reading and writing the list with the existing engine choice preserves that choice and its effort. Only an explicit omission from the replacement list removes it. The legacy Assignment Engine field projects the selected engine default. No new Assignment-specific configuration store or permission owner is introduced.
- Legacy Clients can still read and edit presets during the migration to the new editor. Existing Bot snapshots, Assignments, and Session routes are not rewritten.
- Rollback after a Profile migrates uses a pre-upgrade operational backup. The engine backfill follows the S2 migration, and both follow the published schema ledger. Dev Profiles created on the earlier branch with the conflicting migration order require their original compatible Host or a fresh Profile, per the [schema migration runbook](../agents/schema-migrations.md).
