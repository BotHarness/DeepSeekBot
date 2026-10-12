---
Status: Accepted
Date: 2026-09-21
---

# Channel sidebar is the scoped right sidebar of Bot mode

Bot mode's layout names three regions. The **App Sidebar** is the DSH-native left column; in Bot mode it renders the Roster. The **Channel body** is the center: the selected Channel's header, primary content, and composer. The **Channel sidebar** is the right region, and its scope follows the current selection — a group Channel scope shows that Channel's membership and management information, and a PersonaBot DM scope shows that PersonaBot's own sections such as Assignments (事项), Memory, Bot Inbox, and Computer. Chat is always the Channel body and is never a Channel sidebar entry.

Every entry in the Channel sidebar is a **Channel sidebar entry**: a registered descriptor with a stable id, label, order, scope filter (`channel` or `personabot`), and a renderer that may display information, offer controls, or both. Entries register through one BotHarness client service with slot-like semantics borrowed from DSH's UI slots — ordered, additive, removable — so an independently installed plugin bundle can contribute an entry without the shell importing any destination code. BotHarness registers the built-in entries itself (members for a group Channel, Assignments for a DM). An unregistered, unauthorized, or empty entry is absent; the sidebar never renders placeholders.

Entries collapse independently rather than as an accordion, start collapsed, and remember their expanded state per Channel and PersonaBot in client-local storage — the same class of presentation preference as the left roster's Channel section collapse. The Channel sidebar as a whole is always visible on wide layouts and can be collapsed with the same remembered preference; on narrow layouts it is hidden by default and revealed as an overlay from a control in the Channel header. It never becomes an icon rail: rail behavior belongs to the collapsed App Sidebar. Exact widths, breakpoints, and transition geometry are settled in the `dsh-ui` measure-the-shell workflow, not here.

This region is BotHarness's own, rendered inside the Bot mode panel. It is not DSH's session-scoped native right column (`rightbar` / `sidebar.right.*` tabs), and it must not claim that slot: a Channel sidebar's scope follows a Channel or PersonaBot, which outlives and is not identified by any single DSH Session.

## Considered Options

- **Reusing DSH's native right column (`sidebar.right.pane.tab`)** — rejected: it is session-scoped and tab-shaped, while the Channel sidebar is scoped to a Channel or PersonaBot and reads as one stack of collapsible entries; the native column also has no DM semantics in the pinned DSH.
- **Shadowing the native `rightbar` slot outright** — rejected: it would replace the native right sidebar for DSH sessions and is not documented as a supported extension.
- **A floating overlay as the permanent home (`shell.overlay`)** — rejected: overlays host transient surfaces; entries need persistent, ordered, collapsible placement. The Computer tracer's overlay is an explicit temporary host.
- **Keeping `PersonaBot navigation` as the area name and showing nothing on group Channels** — rejected: the right region is scoped by the selected Channel too, and a group Channel needs membership and management information.
- **A per-destination panel built by each plugin** — rejected: it would produce several competing right-side surfaces; one shell owns geometry, collapse, and ordering.
- **Accordion entries** — rejected: a Human may want two entries visible at once (for example members and Assignments), and shared accordion state survives scope switching poorly.
- **A rail or icon column on narrow layouts** — rejected: rail semantics belong to the collapsed App Sidebar; the Channel sidebar hides behind an overlay control instead.

## Consequences

- `PersonaBot navigation` retires as an area name. Its meaning splits into `Channel sidebar` (region) and `Channel sidebar entry` (one collapsible registered item); DM scopes naturally carry PersonaBot-specific entries without a second area name.
- ADR-0029's "a group Channel has no PersonaBot navigation" stays true for PersonaBot entries but no longer describes the whole right region: a group Channel has a Channel sidebar with scope-appropriate entries.
- The registration seam is a client-side Cordis service, not a new DSH slot kind; cross-bundle contributions rely on `provide`/`inject` because value imports across client bundles are a build error.
- Registrars supply the default order. Human order and item visibility are browser-local presentation preferences, shared within DM and group scopes separately; one edit draft saves both with Done, discards both with Cancel, and can restore all available entries in registrar order ([#721](https://github.com/BotHarness/BotHarness/issues/721), [#809](https://github.com/BotHarness/BotHarness/issues/809)). Hidden entries remain recoverable through settings and retain permission listeners; their bodies do not mount, and hiding never changes Host access or execution.
- Whether any entry may take over the Channel body is deferred; until then every entry renders inside the Channel sidebar, which supersedes ADR-0029's "Memory replaces the center body" wording. (Answered by ADR-0085: no Channel sidebar entry takes over the Channel body; a PersonaBot Profile view may occupy it as a mode rather than an entry.)
- Expanded/collapsed state lives in client-local presentation storage per Channel/PersonaBot and never enters Host authority or a Soul.
- The first tracer delivers the shell with two real entries (group members; DM Assignments) and stops for Human verification. Computer migrates from its overlay into an entry later; Bot Inbox and Memory follow their own authorities.
- (Amended by ADR-0181: on desktop the Channel sidebar shows registered tabs that group entries, and configuration entries move to Channel settings; the narrow overlay keeps this stack.)
