---
Status: Accepted
Date: 2026-10-12
Issues: [#1458](https://github.com/BotHarness/DeepSeekBot/issues/1458), [#1461](https://github.com/BotHarness/DeepSeekBot/issues/1461), [#1462](https://github.com/BotHarness/DeepSeekBot/issues/1462)
---

# File-open defaults are explicit Client preferences

Repeated application selection makes current Memory files and message attachments cumbersome to open. We choose one shared split-button interaction with an explicit, Client-local default preference, while preserving each file owner's target validation and DSH-native Host launch capability from [ADR-0100](0100-file-open-actions-target-real-host-files.md). The Spec drafted this decision as "ADR-0161"; it is published under the next free number. [#1461](https://github.com/BotHarness/DeepSeekBot/issues/1461) implements the split button and preference owner for Memory current files, ordinary message file cards and authorized directories; [#1462](https://github.com/BotHarness/DeepSeekBot/issues/1462) adds the Evolution action below on the same control and preference owner.

## Decision

- The main action opens in the explicitly preferred application, otherwise the DSH-reported system default. The adjacent dropdown lists verified applications and distinct commands to set a default or restore the system default. A one-time application selection never changes the preference; an absent or invalid default requires explanation and explicit choice, not the first list item or an automatic download.
- File preferences are scoped by file type; directories have a separate preference. One application-defined Client preference owner serves Memory, authorized Workspace paths, message files and Evolution actions, isolated by browser storage instance and Host/Profile. Reuse a supported native preference mechanism only when it has these semantics. The preference does not change OS associations, sync to another device or accept arbitrary executable paths.
- Selecting a Memory tree file still opens the built-in reader; folders still expand, images still preview and audio still plays. Suitable external-open controls and ordinary file cards use the split button, while context menus, download, copy path and reveal remain available. Controls use DSH tokens and the real application icon rather than a fixed platform icon.
- Evolution commit and working diffs offer **Open current file**, never an implicit historical snapshot. A rename uses the new path; a deletion checks the old path's current existence. Resolve the current target at each gesture, report absence without recreating bytes, and attribute deletion only with supporting evidence. Do not guess subsequent rename chains or treat an old D marker as proof of present absence.
- Launches run on the serving Host, which is named explicitly even through a tunnel. The native capability and every owner-level authorization are rechecked; a preference grants no filesystem access. A launch acknowledgement is not proof that a visible window appeared. Downloads remain separate and their edits do not write back.

## Trade-off and supersession

This supersedes only ADR-0100's first-slice deferral of persistent default-application preferences and its menu-first external-open presentation. Its real-file, attachment identity, Host authorization and transfer semantics remain intact. A product-local explicit preference avoids repeatedly choosing an editor without silently changing system associations or remembering an incidental one-off choice. A generic arbitrary-path/executable opener and historical Memory export remain outside this decision.

The pinned DSH `0.2.0-rc.1` reports a system default only for file-type associations. Its own directory control remembers the last successful choice in a native browser key and otherwise falls back to the first installed application; that mechanism changes on every one-time choice, so it does not have the semantics above and is not reused. A directory therefore has no trusted default until the Human sets one. The pinned Client package exports no split-button component, so the control is application-defined on DSH tokens and the DSH `Menu` primitive.

The Host reports Memory commit and working changes without rename detection, so a rename already arrives as a deleted old path and an added new path. **Open current file** therefore needs no path mapping: each row asks the Memory owner for its own path as it is now. A row marked deleted is the only place a deletion note is attached, and only after the owner reports the path absent.

[Spec #1458](https://github.com/BotHarness/DeepSeekBot/issues/1458) records the Human-approved interaction and verification slices.
