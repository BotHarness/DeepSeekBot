# ADR-0225: Bot creation receipts and reviewed profile lifecycle

- Status: Accepted
- Date: 2026-10-18
- Related: [#2089](https://github.com/BotHarness/DeepSeekBot/issues/2089), [ADR-0224](0224-tob-management-uses-scoped-native-shell-cli.md), [ADR-0041](0041-one-database-owns-botharness-operational-state.md)

## Context

Tob's private steward role includes preparing a new PersonaBot and managing an existing Bot's public profile. A transport failure after creation must not cause a second identity, Memory Repository or Human DM. Profile writes must not overwrite changes made while approval is pending. Deletion already has a dedicated owner with reviewed dependencies, Memory ownership and cleanup state; exposing it through CLI must preserve those boundaries.

## Decision

Extend the existing application-defined scoped CLI operation seam, not the DSH model-facing Tool Registry. Native Shell, actual ToolExecution, protected Tob root Orchestrator and accepted Human DM checks from ADR-0224 remain mandatory. Existing Registry, Git Memory, Channel, presentation and deletion owners perform the work. Human online commands and scoped Tob commands share those owners without sharing credentials or authority.

Generation 97 adds `bot_creation_operations` to the existing operational database. A stable operation key binds a canonical input fingerprint and a reserved Bot slug before creation. The creation service calls the Registry to create that identity and its managed Memory, then the Channel owner to prepare its deterministic Human DM. The receipt records completion; it is coordination state, not a second Bot or Memory store. Stable-key creation is limited to blank Bots in managed Memory storage. Model presets, custom Memory locations and imports are not folded into this receipt.

Repeating the same key and payload reconciles that identity. An existing Bot with a missing DM can finish through the Channel owner. An already completed scoped invocation reads its receipt and canonical Bot under current authority rather than creating again. A different payload refuses. Archived or deleted identities cannot be recreated by replaying their keys. If a reserved Memory folder exists without a Registry record, creation refuses with `creation-memory-conflict` and preserves the folder for repair. The filesystem and database are not one atomic transaction; no cleanup-by-guessing or automatic new-key fallback is introduced.

Profile reads return an opaque fingerprint of the complete Registry record. Scoped metadata, appearance and pause/resume writes carry that observed fingerprint. The proposal contains the target, prior presentation and intended patch, with image bytes represented by a digest and size for review. After approval, the Host checks the current full fingerprint before calling the existing owner, then returns canonical readback. A change outside the edited fields can invalidate the snapshot. Metadata updates only accept name, description and tags; grants, credentials and model settings are not smuggled through the broader Registry update shape.

Deletion uses the existing preview token, dependency scope and exact owner-derived Memory path. Retention is the default; erasure is explicit and depends on the owner's path/inode/device and overlap validation. The CLI cannot nominate another path. A retry continues the previously accepted retention/erasure choice. Scoped confirmation and retry require a fresh Human decision each time, even under full access, remembered approval or automatic approval. Both require the explicit confirmation flag. Protected Tob cannot be archived or deleted, regardless of its display name or editable personality.

## Consequences

Lost-response reconciliation survives Shell and Host restarts without storing or reviving a broker capability. Receipt lookup does not authorize a new operation; current accepted-source checks still apply. An uncertain deletion result requires inspection of the owner's cleanup state, not a new destructive request. Existing unkeyed Human creation retains its contract.

Tob can prepare initial Soul and Core Memory during creation; this does not grant access to another Bot's existing Memory or add Marketplace import permissions. UI and CLI consume the same identities and readback. Direct CLI, actual model invocation, visible Web navigation and macOS Desktop verification remain separate delivery evidence, not claims made by this ADR.
