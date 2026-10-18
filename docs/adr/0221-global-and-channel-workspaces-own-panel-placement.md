# ADR-0221: Global and Channel workspaces own panel placement

- Status: Accepted (Sessions, Memory, Schedules, Browser and Computer slices)
- Date: 2026-10-17
- Spec: [#2048](https://github.com/BotHarness/DeepSeekBot/issues/2048)
- First runnable slice: [#2049](https://github.com/BotHarness/DeepSeekBot/issues/2049)
- Revises ADR-0203's flat placement target; retains its execution-neutral presentation and existing data owners.
- Retains ADR-0220's unified Sessions query scope and authorization.

## Context

The current flat Dock puts global content, such as Channel list and Activity Center, beside content that only makes sense for the active Channel. Hiding Messages leaves Channel-bound panels visible, and the Control Rail does not communicate that relationship. A Group's ability to inspect a member Bot's Sessions must not imply that the Group owns that Bot's Browser, Computer or Profile.

The Human wants freedom to arrange content without losing the relationship between a Channel and its panels. The agreed target is two layout levels. The first Sessions slice implements this ownership inside Messages. Memory files, Memory evolution and Schedules join the inner workspace in #2067. Other Channel-bound panels remain staged.

## Decision

### Presentation ownership

The Global workspace contains the unique Workspace Control Rail, global Dock panels and one Messages panel. Messages hosts the active Channel workspace, with message content and applicable Channel subpanels. Subpanels may split, resize and move within that parent, but cannot dock into the outer workspace. There is no recursive third level, tab grouping or floating window.

The Control Rail controls global panels and Messages. The Messages header controls Channel subpanels, with localized tooltips, effective shortcut labels and an overflow path for constrained widths. Hiding the parent hides all children while retaining their open states and geometry. Reopening restores them. Neither a parent nor a child visibility action stops Sessions, closes Browser tabs, changes access or creates execution requests.

Sessions is applicable to both PersonaBot DMs and Groups, preserving ADR-0220. Group members belong within the Group's Channel workspace. Memory files, Memory evolution, Schedules, Browser control, Computer control and PersonaBot Profile require an applicable PersonaBot DM and are absent from Group headers and executable shortcuts. An explicit member-Bot scope in Sessions changes only that query; it cannot enable those Bot-only surfaces. Group Profile and Group settings remain available. Ambiguous Bot-to-Bot conversations must not guess a Bot or reuse the last DM's identity.

Shared Browser Profiles and Computer Targets can have global resource settings. The fact that multiple Bots use the same physical machine does not make a Bot's tabs, screen access or permissions global. Placement scope is application-defined presentation, not a new DSH permission or resource-isolation mechanism.

### One preference owner and stable content

Extend the existing Client layout owner with outer geometry, per-stable-Channel inner geometry and first-use defaults for DM and Group layouts. Store proportions rather than fixed pixels. Minimum-size and narrow-screen adaptations must not overwrite the saved wide-screen ratios. Preserve each Channel's visibility and sizes without a second selection store or a second Host persistence authority.

Moving or resizing a panel must preserve its content instance, drafts and active reads. Channel changes invalidate stale async results through the existing scope lifecycle. This does not require keeping every previously visited Channel mounted indefinitely. Real Session queries, Session navigation and permission checks remain with their existing Host Providers and Client Consumers.

### Migration and shortcuts

Normalize existing Work-to-Sessions migrations before moving the surviving Sessions entry from the outer layout into Messages. Back up the original record and make migration idempotent. Preserve unrelated panels, unknown registration IDs, parked placement, switch order, gap, and explicit open or closed states. Collapse empty outer nodes. Do not open a closed Messages panel during migration or create duplicates when its old node is absent.

Meaningful adjacency to Messages supplies an inner side and ratio; otherwise start with message content at 70% and Sessions on the right at 30%. The old global Sessions preference seeds Channels lazily; existing new per-Channel preferences win. A previously hidden Sessions rail entry becomes a hidden header-switch preference, recoverable through the Messages header context menu, without disabling its shortcut. Write failure must leave the backup recoverable and must not report a persisted migration as complete.

Keep the existing Sessions command identity and native shortcut settings, including custom bindings and explicit unbinding. Keep the default Primary+Alt+Shift+7. Retain the earlier Work binding migration's precedence and conflict handling; do not introduce a competing command or silently overwrite accepted bindings.

| Current presentation            | Sessions shortcut result                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Messages hidden                 | Show Messages and ensure Sessions is open, even if its saved logical state was already open. |
| Messages shown, Sessions hidden | Open Sessions only.                                                                          |
| Messages and Sessions shown     | Close Sessions only.                                                                         |

The Messages command toggles the parent without rewriting child states. No valid Channel means an unavailable contextual action, never a stale Bot fallback. Existing modal/editable restrictions and Alt+digit Channel navigation remain intact.

### Delivery boundary

The first runnable slice migrates only Sessions, through the actual Client layout owner, existing Host queries, native shortcut catalog and real Web/macOS paths. Other panels temporarily remain in the outer layout; the rail is not yet wholly global after that slice. Integrate existing members and other Messages content sufficiently to avoid overlapping layouts, without expanding the first slice into their full migration.

Later slices move the remaining Channel-bound surfaces after Human feedback. Browser and Computer disabled/empty states then adopt the shared centered icon and description pattern, distinguishing unavailable access from a merely closed view. The first Sessions slice does not claim those improvements.

## Alternatives considered

- Keep all panels flat and annotate them with scope: preserves arbitrary placement but leaves children visible without their conversation and keeps the same ambiguous controls.
- Restore fixed sidebars: communicates ownership but discards the requested ability to move, split and resize related content.
- Allow unlimited nested workspaces or detachable children: adds ambiguous shortcut routing and difficult migration without serving the agreed two-level interaction.

## Consequences and verification

- This changes the product layout model and plugin placement contract. Adapters must preserve existing registrations during staged delivery; do not silently reinterpret unknown plugins as Channel children.
- Local layout migration has a cost: closed/missing parents, hidden switches, older Work layouts and partially migrated records all need observable recovery. Reverting code leaves Host data intact; restoring the saved layout backup replaces subsequent local geometry. Native bindings remain in their existing settings owner.
- The Human confirmed the highest acceptance seam: real Web old-layout upgrade, Sessions inside Messages, split/resize and refresh, parent hide, shortcut restoration, then DM/Group switching. Supplement with actual macOS Desktop dispatch and window controls. Use existing real Sessions/Assignments where available; API-only checks are not proof of the UI journey.
- Focused regression coverage checks migration idempotence and backup, closed-state preservation, per-Channel persistence, shortcut customization/unbinding/conflicts, stale reads and stable content on rearrangement. Verify Group exclusions independently of Sessions' member-Bot override.
- The Sessions slice uses a stable flex split, rather than reparenting React content between Dockview groups. A pointer drop or header menu changes its side; the separator changes a saved proportion. The same content containers remain mounted. The original below-520px vertical fallback was removed in #2074: every split now keeps the saved side at any parent width. Runtime, visual and native evidence belongs to #2049's implementation PR before Human QA.

## Bot Memory and Schedules slice (#2067)

Memory files, Memory evolution and Schedules reuse the Channel workspace split container and their existing Consumers. All four registered children have stable containers in a fixed split sequence, each dividing the remaining message region with its saved side and ratio. Moving a child changes its direction inside its own split; it does not reparent any live content. This is one Channel workspace with sibling content, not recursively nested product workspaces. Following the Human clarification in [#2074](https://github.com/BotHarness/DeepSeekBot/issues/2074), saved placement is authoritative at every parent width. Narrowing Messages never changes the split axis or limits available docking sides; only an explicit placement action changes direction. The earlier automatic vertical fallback is removed.

The existing layout record advances to v5 with `botPanelSeeds` and `botWorkspaces`, keyed by stable Bot DM Channel identity. Sessions keeps its v4 fields. Migration first normalizes older Work/Sessions records, then removes only these three outer panels and their rail entries. Meaningful adjacency supplies side/proportion; parked sides and explicit closed/hidden states are retained. Unknown plugins, other panels and their placement survive. The original raw record is retained at `.before-bot-workspace-v5`, and existing per-Channel records win over lazy seeds. A failed backup prevents replacing the original record.

Messages header switches and its shared context menu operate the same layout owner. Hiding a switch closes that child; restoring a switch does not silently reopen it. Child header menus close or reposition only that child. Group contexts cannot open these Bot-only panels, including through existing shortcuts; switching to a Group preserves each Bot DM's saved state. Their existing command identities, Primary+Alt+Shift+6 / E / 9 defaults, custom overrides and explicit unbinding are unchanged. Each command uses the same parent restoration state machine as Sessions. Layout actions do not create, cancel or edit schedules or Memory.

The native bridge and Host APIs do not change. Transient Members/files/Inbox unification remains separate work.

## Browser and Computer slice (#2069)

Browser and Computer reuse the same stable Bot Channel split containers, header switches and shared context menu. The global rail no longer exposes either entry. v6 backs up the original record at `.before-bot-workspace-v6`, migrates both outer nodes into lazy seeds, and preserves v5 Memory/Schedules seeds and per-Channel states. Older version backup keys remain intact. Existing Browser/Computer Consumers retain their access, observation and execution owners; visibility does not grant access, open tabs, start a Computer or stop resources.

Existing command IDs and Primary+Alt+Shift+B / 0 defaults remain unchanged, including customization and explicit unbinding. Group and unresolved Bot contexts cannot execute either child action. Disabled access uses the shared centered panel icon/description with the existing explicit power action in the child header. Layout moves preserve mounted content; changing Bot scope follows the existing keyed Consumer lifecycle.
