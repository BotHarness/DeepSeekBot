# ADR-0269: Simple layout keeps Messages and switches a Side column

- Status: Accepted (design)
- Date: 2026-10-28
- Related: ADR-0259, ADR-0268; supersedes the Simple view switching of ADR-0259

## Context

In Simple layout mode (ADR-0259), each Workspace Control Rail switch replaced the whole view with one full-height Global panel. Opening Activity Center or Marketplace hid the conversation, and the Channel list could not be collapsed. An earlier draft of ADR-0268 added a desktop Tob Mode switch only to hide everything except Messages; ADR-0268 now removes Home with no desktop Tob Mode switch. The Human wants the conversation to stay put, and the rail to behave like an editor's activity bar.

## Decision

In Simple, the **Messages panel is always shown**, with its Subpanel column unchanged. Between the rail and Messages sits an optional **Side column** that shows one Global panel: Channel list, Activity Center, Marketplace or another Global panel, including plugin Global panels and Bot-bound instances.

- Selecting a rail switch shows its panel in the Side column and replaces the panel shown before. A replaced panel is hidden, not unmounted, so drafts and scroll position survive.
- Selecting the switch whose panel is already shown hides the Side column, leaving only the rail and Messages.
- The pressed switch is the panel shown in the Side column; no switch is pressed while the column is hidden. Messages has no rail switch in Simple, and the Channel list switch comes first.
- Global panel shortcuts act like selecting the switch. Subpanel shortcuts are unchanged.
- One shared, draggable Side column width and the shown panel (or hidden state) persist in the device-local Layout mode record. A saved Simple view migrates to the matching Side column panel; a saved Messages or Home view migrates to the Channel list.
- Opening a Channel from elsewhere, such as Activity Center or a notification, changes Messages only and leaves the Side column as it is.

There is no desktop Tob Mode switch (ADR-0268). Advanced is unchanged.

## Considered options

- **Keep full-view switching and add a Tob Mode switch.** Two ways to focus, and opening any Global panel still hides the conversation.
- **Collapse only the Channel list.** Activity Center and Marketplace would still replace the conversation.

## Consequences

The Layout mode record changes shape and needs a migration. Wide Global panels share the Side column width, which the Human can drag.
