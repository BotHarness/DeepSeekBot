---
Status: Accepted
Date: 2026-09-29
---

# PersonaBot Profile is a popover plus a Channel-body view with registered Profile Cards

The avatar in a PersonaBot DM header used to toggle the Channel sidebar, which left no room for per-PersonaBot identity and activity: the right region is a narrow stack of collapsible entries, unusable for contribution charts, and identity outlives any single Channel entry. We decided the avatar opens a **Profile popover** — compact, anchored, showing only the Human-pinned Profile Cards — and that a control inside it expands the **PersonaBot Profile view**, which occupies the Channel body and temporarily replaces the Chat history and composer; leaving it returns the Channel body to the Chat. The Profile view is also where the Display name and Avatar are edited. The Channel sidebar is untouched. Profile Cards register through a new client-side Cordis service with the same ordered, additive, removable semantics as Channel sidebar entries, so other bundles can contribute cards without the shell importing them; the pinned set is client-local presentation state, global across PersonaBots.

On 2026-09-30, #424 extends that same surface to Group Channels in v1.0: the Group header opens a Group Profile popover and Channel-body view, with separately pinned Group-scope cards for committed-message activity by day and author. The Channel sidebar keeps its independent Group management toggle. DM Channels continue to use only the PersonaBot Profile.

## Considered Options

- **A PersonaBot entry inside the Channel sidebar** — rejected: the entry stack is the wrong shape and width for charts, and pinning would still be buried in a collapsible section.
- **A second right-side profile sidebar next to the Channel sidebar** — rejected: two competing right regions multiply geometry, narrow-layout, and preference state, while the Channel body is free for this.
- **A separate profile page or route** — rejected: it breaks the Channel context and the "one DM, one place" reading.
- **Fixed built-in cards with no registry** — rejected: DSH's extension language is additive registration; a registry lets Computer and future bundles contribute cards.

## Consequences

- Answers ADR-0053's deferred question: **no Channel sidebar entry takes over the Channel body**; a PersonaBot Profile view may occupy it as a mode rather than an entry.
- The avatar no longer toggles the Channel sidebar; that toggle remains the header's panel control, and existing programmatic expansions (for example the Human Inbox repair path into Bot Inbox) keep working.
- While the Profile view is open the composer is absent: a Human leaves the Profile to write. Switching Channels returns to the Chat.
- Cards consume Host read models only, through the Client bridge; the Profile never reads DSH Session logs, `botharness.db`, or price files directly.
- Unknown or unavailable Profile Cards are ignored rather than rendered as placeholders; the popover shows its empty state when nothing is pinned.

## 2026-10-17 revision — direct profile navigation (#2017)

The Messages workspace panel now hosts the full Profile view directly. View profile in the conversation header or Channel list no longer opens a Profile popover. The Channel-list entry opens and activates Messages before selecting the requested PersonaBot, restoring its parked position when available. The newly mounted dock also honors that navigation intent after restoring the saved layout, so an old closed-panel record cannot hide the destination. Back or Escape restores chat. Group Profile uses the same direct detail path and retains its bounded live member preview.

The popover and client-local pinned Profile Card preferences are retired; the registry and Host read models remain unchanged. Existing persisted pin keys are ignored, without a migration or deleting unrelated preferences. Header companion-pin shortcuts are removed; showing a Window Companion remains available through the Channel menu and uses the same owner. This supersedes the popover/pinning presentation above, not its identity, registry or authority boundaries.
