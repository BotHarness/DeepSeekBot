# ADR-0259: Desktop layout has Simple and Advanced modes

- Status: Accepted (design; delivery in four slices)
- Date: 2026-10-26
- Related: ADR-0221, ADR-0222, ADR-0233, ADR-0234

## Context

The two-level workspace of ADR-0221/0222 lets the Human move, split and resize every Global panel and Channel subpanel. It serves Humans who want to arrange their own workbench, but a new Human does not know where a newly opened panel will appear or where to open it from. Default placement makes this worse: Home (`zone: 'center'`) splits below Messages, and Activity Center and Messages without a remembered position stack below the last column. Freedom and predictability are hard to provide in one layout.

## Decision

Introduce a device-local **Layout mode** with two values, owned by the existing Client layout owner. Each mode keeps its own saved arrangement; switching never rewrites the other mode. New Humans start in Simple. Humans who already have a saved layout record start in Advanced. The mode is switchable in Bot Settings (Appearance) and chosen during desktop onboarding. Panel spacing is shared; Reset resets only the current mode. No Host route or CLI command is added, because the preference stays on the device like the rest of the layout.

### Simple

- Each Workspace Control Rail switch selects exactly one full-height Global panel: Home, Activity Center, Messages, and plugin Global panels or Bot-bound instances. Selecting a switch replaces the view; it never adds a panel. The separate Channel list switch is removed, and the Channel list sits to the left of Messages in the Messages view with a draggable width. It cannot be collapsed.
- Leaving a view hides it without unmounting it, so drafts, scroll position and active reads survive switching. The first switch into Simple lands on Messages; later switches return to the last Simple view.
- The rail keeps switch order and hidden controls but cannot be moved; it stays leftmost.
- The Messages header has a single control that shows or hides the **Subpanel column**. It is hidden by default, and its visibility is shared across Channels.
- The Subpanel column lists every subpanel available to the active Channel in a fixed vertical order: Sessions, Bot-only subpanels, Members, Channel files, Inbox and Bot-bound plugin panels. Group Channels omit Bot-only entries under the existing availability rules. The header context menu still hides entries. Each entry collapses from its title, has a resizable height and keeps its existing header actions. The column scrolls and its width is resizable. Width, heights and collapsed states are one global record. Entries cannot be dragged.
- Collapsing an entry unmounts only its presentation. Browser, Computer and Sessions keep running, and access is unchanged.
- In Simple, Global panel shortcuts select their view. Subpanel shortcuts show the column, expand the entry and scroll to it; pressing a shortcut again collapses that entry.

### Advanced

The free two-level workspace is unchanged, apart from the default positions of panels that have no remembered position. Each of these opens as a new column rather than a row:

- Messages opens to the right of the Channel list.
- Activity Center opens to the right of Messages.
- Home opens as the rightmost column.
- Plugin `right` panels open as a new rightmost column, and `bottom` keeps its current behaviour.

Saved layouts are never moved.

### Onboarding

Step 4 of ADR-0233 first asks for a Layout mode, then shows tips for that mode. In Simple, step 5 completes when the Human selects Messages on the rail and lands in the Tob DM; in Advanced it remains the Home title action.

### Out of scope

The existing narrow-screen responsive fallback is unchanged in both modes. Mobile Web and the Expo app are not affected.

## Considered options

- **Only fix the Advanced defaults.** This reduces the surprise of where panels appear, but every new Human still faces a free docking layout.
- **Replace free docking with Simple only.** This discards arrangements that existing Humans rely on, and contradicts ADR-0221's accepted goal.
- **Per-Channel Simple geometry.** Rejected because one shared record is easier to predict, and per-Channel memory is already the Advanced behaviour.

## Delivery

1. Advanced default positions.
2. The Layout mode preference, the Settings switch, Simple view switching and the Channel list | Messages split.
3. The Subpanel column.
4. The onboarding mode choice.

Each slice is a separate PR with light and dark screenshots.
