---
Status: Accepted
Date: 2026-10-12
---

# The desktop Channel sidebar is tabbed, and configuration lives in Channel settings

[ADR-0053](0053-channel-sidebar-is-the-scoped-right-sidebar.md) made the Channel sidebar one stack of collapsible entries and ruled out tabs. [ADR-0138](0138-profiles-hold-shareable-identity-and-configuration-lives-in-the-channel-sidebar.md) then moved every operational setting out of the Profile into that stack. By October a PersonaBot DM showed up to twelve headers from unrelated domains (Sessions, Memory, Schedules, Model, Wake policy, External identities, External connectors, Workspace Grants, Computer, Browser), while a group Channel showed only three or four. The stack was hard to read in a DM and looked empty in a group ([#1518](https://github.com/BotHarness/DeepSeekBot/issues/1518)). We decided: **on desktop the Channel sidebar shows icon tabs for things the Human watches, and configuration moves to a per-Channel Channel settings dialog.**

## Decision

- **Desktop dock mode renders Channel sidebar tabs.** A **Channel sidebar tab** groups one or more Channel sidebar entries under one icon. The selected tab shows its label; the others show only their icon and a tooltip. Built-in tabs are **Sessions** (Sessions + Bot Inbox, leftmost) and **Memory** (Memory files + Memory evolution). An entry that names no registered tab is its own tab, so plugin entries such as Computer and Browser need no change. A tab with two visible entries splits into a top and bottom pane with a draggable divider; each pane scrolls on its own.
- **Tabs are registered like entries.** `registry.registerTab()` adds a tab with id, label, icon, order and scope; `ChannelSidebarEntry.tab` places an entry in it. Removal, ordering and scope filtering follow the entry rules of ADR-0053.
- **The Human orders and hides tabs from a + Views menu.** It lists every tab with a checkbox and a drag handle (Alt + ↑/↓ for the keyboard). At least one tab stays visible. Order, visibility, the selected tab per Channel or PersonaBot, and each tab's split ratio are browser-local presentation preferences, like the entry preferences they replace. A saved entry order carries over as tab order.
- **Configuration is a Channel settings section, not a sidebar entry.** An entry registered with `surface: 'settings'` never renders in the Channel sidebar. It appears as a section of the **Channel settings** dialog for the current Channel: Wake policy, External identities and External connectors in a PersonaBot DM; Wake policy, External connectors and Group management in a group. The dialog reuses the Bot Settings layout (a section list on wide screens, a section picker on narrow ones) and remembers the last section per scope.
- **Channel settings opens from the Channel.** Entry points are the "Channel settings…" item in the Channel sidebar gear menu (desktop tabs and the narrow overlay) and in the Channel header's "···" menu.
- **Narrow layouts keep the stack.** The overlay below 960 px still renders collapsible entries, so mobile behaviour is unchanged apart from settings sections leaving it.

## Considered Options

- **Keep the stack and only regroup entries:** rejected. Grouping alone still shows every header at once and leaves the group sidebar sparse.
- **Put configuration back on the Profile:** rejected for the reasons in ADR-0138. The Profile is what travels when a PersonaBot is shared; Wake policy, identities and connectors are local operational state.
- **A single "Settings" tab in the sidebar:** rejected. Configuration is visited rarely and needs width for card rows and edit forms; a modal gives it both without taking a permanent tab.
- **shadcn Resizable for the split:** rejected for now. The split is about 90 lines in-house and avoids a `react-resizable-panels` dependency in the client bundle.

## Consequences

- ADR-0053's "never tabs" and "one stack of collapsible entries" no longer describe desktop. Entries inside a tab render without a collapse chevron. The narrow overlay keeps ADR-0053's behaviour.
- ADR-0138's "configuration moves to the Channel sidebar as separate collapsible entries" now reads "configuration is a Channel settings section". Its Profile rule is unchanged. Model and Workspace Grants stay sidebar entries until a later slice of #1518 removes or relocates them.
- Private accounts ([#1521](https://github.com/BotHarness/DeepSeekBot/issues/1521)) arrive as a Channel settings section through the same `surface: 'settings'` seam.
- `CONTEXT.md` adds **Channel sidebar tab**, **Channel settings** and **Channel settings section**, and narrows **Channel sidebar entry**.
