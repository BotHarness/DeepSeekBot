---
Status: Proposed
Date: 2026-10-14
---

# Bot mode is a dockable layout that plugins extend with Dock panels

DeepSeekBot can already do far more than DSH's native shell shows, and Humans will add their own extensions: a goal tracker, a to-do list, or another store DSH does not have, like the Bot Inbox did. Such an extension needs a place on screen. Most Humans will not want every extension, so these extensions should stay plugins rather than built-ins, and BotHarness should make writing one easy. Today the desktop Bot mode panel has three fixed regions: the DSH-native App Sidebar on the left, the Channel body in the center, and the Channel sidebar on the right with icon tabs ([ADR-0183](0183-channel-sidebar-is-tabbed-and-configuration-lives-in-channel-settings.md)). Only the Channel sidebar width can change. A plugin can add a Channel sidebar entry, but it cannot add a region, and the Human cannot rearrange anything. We decided: **on desktop, Bot mode becomes one dockable layout in the style of VS Code. The App Sidebar, the Channel body and every Channel sidebar entry are Dock panels. Other DSH plugins add their own Dock panels through a BotHarness Service, and each Human arranges a browser-local layout.**

## Decision

### Scope

- **Desktop Bot mode only.** The Bot layout exists only while the Client is in Bot mode at 960 px or wider. Outside Bot mode, DSH's native shell is unchanged. Below 960 px the Client falls back to today's responsive layout, where the Channel sidebar is an overlay of collapsible entries. The saved layout is kept and returns when the window widens again. Phones keep their current layout.

### The App Sidebar is taken over in Bot mode

- **BotHarness renders the whole Bot mode surface.** In Bot mode the Client shadows the DSH `sidebar` single slot at a higher priority so the native left column gives up its width. The Client then renders the Bot layout across the full width, in the `main` panel it already shadows. Leaving Bot mode disposes the shadow and the native App Sidebar returns. The first slice must verify this against the pinned DSH release before building on it: the `sidebar` shadow is legal and frees the column, `ctx.layout` geometry still works, and the Bot mode exit stays reachable.
- **The App Sidebar is one Dock panel that keeps native content.** The **App Sidebar panel** renders the same DSH sub-slots that the native column renders: `sidebar.toggle.badge`, `sidebar.brand.mark`, `sidebar.brand.name`, `sidebar.panellist`, `sidebar.workspaces` (where the Roster is, as today), `sidebar.settings` and `sidebar.footer.action`. Contributions from other plugins to those slots keep appearing. The panel can be moved, resized and docked like any other panel. Splitting it into several panels is deferred.
- **We also ask DSH for a layout API.** We will file an upstream request for a supported way for a plugin to own or rearrange the shell columns. If DSH ships one, the takeover moves onto it and this shadow is removed.

### Layout engine

- **dockview.** The layout uses [dockview](https://dockview.dev) (React, MIT, no runtime dependencies). It provides groups, tabs, splits, drag-to-dock, floating groups inside the window, and a serializable layout. It is themed only through the dsh-ui token alias table, so the shell stays visually native.
- **Floating inside the window, no pop-out windows.** A group can float above the layout. Popping a panel out into a separate browser window is not supported.

### Dock panels

- **Built-in Dock panels.** The built-in panels are the App Sidebar panel, the Channel body, and one panel for each Channel sidebar entry: Sessions, Bot Inbox, Memory files, Memory evolution, Schedules, Computer, Browser, and any plugin entry. Entries that ADR-0183 put together under one tab, such as Sessions with Bot Inbox, or Memory files with Memory evolution, are now separate panels.
- **One Channel body for now.** Exactly one Channel body exists and it cannot be closed. Selecting a Channel changes what it shows. Several Channel bodies, as tabs or side by side, are deferred, and the rule below already covers them.
- **The focused Channel body defines the active Channel.** The App Sidebar highlights the active Channel, and every `channel`-scoped Dock panel shows that Channel. When several Channel bodies exist later, focusing one changes the active Channel and everything follows it.
- **Each panel declares its scope.** A `channel` panel follows the active Channel. A `global` panel, such as a to-do list, does not follow it. A `channel` panel with nothing to show for the active Channel, such as a DM-only entry while a group is active, shows an empty state rather than disappearing, so the layout does not jump.

### The Dock panel registry

- **A Cordis Service.** The BotHarness Client provides a `dockPanels` Service (`ctx.provide`). A plugin is a Consumer that `inject`s it and calls `register(panel)`, and gets back a disposable. A registration carries a stable `id`, `title`, `icon`, `scope` (`global` or `channel`), a `defaultPosition` hint (a zone `left | center | right | bottom`, optionally relative to another panel id), an optional `order`, and a React `component`. Registration, removal and ordering follow the Registry rules of [ADR-0053](0053-channel-sidebar-is-the-scoped-right-sidebar.md). Ids are owned by their plugin, and registering a duplicate id throws.
- **`channelSidebar` stays as a compatibility Consumer.** `channelSidebar.register(entry)` registers a `channel`-scoped Dock panel. `registerTab(tab)` turns into a default-layout hint that places its entries in one group. Entries with `surface: 'settings'` remain Channel settings sections. The narrow overlay still renders entries the way it does today. Existing callers, such as the Computer and Browser plugins, keep working unchanged.

### Data belongs to the plugin's own capability seam

- **A Dock panel is only a UI Consumer.** A plugin that keeps data, such as goals or to-dos, follows DSH's Capability seam (`Consumer → Service Definition → Provider`). It defines its own Service and a Host Provider that persists the data. The Dock panel and the plugin's Bot tools are both Consumers of that Service. BotHarness adds no generic panel store, and the Bot layout never holds plugin data.
- **CLI parity applies to the plugin's Host surface, not to the layout.** The layout is browser-local presentation, with no bridge method, Host route or Bot tool, so it has no CLI command. A plugin's own bridge methods, routes and Bot tools follow [CLI parity (AX)](../../AGENTS.md#cli-parity-ax) as usual.

### The Human arranges the layout

- **One layout per browser, plus Reset.** The layout lives in browser localStorage under a new key, as a versioned dockview serialization. When restoring, panels that are not registered right now (a plugin was removed) are skipped, but their last position is remembered and reused when they register again. Saving named layouts is deferred. On first load, the existing `botharness.channel-sidebar` preferences seed the layout: width, tab order and hidden tabs. The default layout reproduces today's arrangement: App Sidebar on the left, Channel body in the center, and on the right the Channel sidebar groups in ADR-0183's tab order, each group showing two entries in a top and bottom split as before.
- **A Panels menu replaces + Views on desktop.** The App Sidebar panel header has a **Panels** menu, like VS Code's View menu. It lists every registered Dock panel except the Channel body, each with a checkbox. A panel that is closed and then reopened returns to its last position, or to its default position if it has none. The menu ends with **Reset layout**. Panels other than the Channel body can be closed from their tab as well.

### Making plugins easy to write

- **Example plugin, guide and skill.** The same change train ships a minimal example plugin. It contains a to-do Service with a Host Provider, a Bot tool with its CLI command, and a `global` to-do Dock panel. It also ships a bilingual authoring guide and a skill, so that a Bot running in DSH's creative Profile, which can author plugins, can build a panel for itself by following them.

## Delivery

These are tracer-bullet slices. Each one ends in a state the Human can run and judge.

1. **Docked Channel.** Desktop Bot mode renders dockview inside `main`, containing the Channel body and every Channel sidebar entry as Dock panels, through the `channelSidebar` compatibility Consumer. Panels can be dragged, docked, tabbed and floated. The layout persists browser-locally and the narrow fallback still works.
2. **App Sidebar takeover.** Shadow `sidebar` in Bot mode and add the App Sidebar panel that renders the native sub-slots. The focused Channel body defines the active Channel and the App Sidebar highlights it.
3. **Public registry.** Add the `dockPanels` Service with `global` and `channel` scopes, the Panels menu and Reset layout. Seed the layout from the old preferences and retire + Views on desktop.
4. **Example plugin and guide.** The to-do example plugin with its Service, Provider, Bot tool, CLI command and Dock panel, plus the authoring guide and skill.
5. **Upstream.** File the DSH layout API request and track it.

## Considered Options

- **motion-panels.** Rejected as the engine. It animates split panes, with fold, collapse and snap animations on resize. It has no tabs, no docking between groups, no floating and no layout serialization. It is also pre-1.0 with one maintainer.
- **Keep the native App Sidebar and lay out only the right-hand area.** This was the lower-risk option, but the Human wants the App Sidebar inside the layout. The DSH upstream request keeps a path back to a supported API.
- **Fixed zones only (left, center, right, bottom).** Rejected in favour of full docking, which is the VS Code experience the Human asked for.
- **Splitting the App Sidebar into several panels now.** Deferred. Rendering the native sub-slots in one panel preserves every other plugin's contribution.
- **Declarative panels generated by a Bot without code.** Deferred. Code plugins come first. A Bot in the creative Profile can already write a code plugin, so it gets the same result once authoring is easy.
- **A generic BotHarness panel store.** Rejected. Storage belongs to each plugin's own Service and Provider, the way DSH composes capabilities.
- **Host-synced layout and named layouts.** Deferred. Host sync would add a bridge surface and a CLI command for what is presentation. One browser-local layout plus Reset matches how Channel sidebar preferences work today.
- **Pop-out browser windows.** Rejected. Rendering React across windows and keeping DSH Context alive in them is costly, for little benefit.

## Consequences

- On desktop, this supersedes ADR-0183's tab strip, its top and bottom split, and the + Views menu. ADR-0183 continues to govern Channel settings and the narrow overlay. ADR-0053's entry Registry rules carry over to Dock panels.
- The dsh-ui rule "shadow only `sidebar.workspaces` and `main key=conversation`" gains an exception for the `sidebar` slot in desktop Bot mode. Because a DSH change to the `sidebar` slot or its sub-slots can now break Bot mode, the pinned-release end-to-end tests must cover the takeover.
- dockview adds to the Client bundle, and its CSS must be fully mapped to DSH tokens.
- `verify-deepseekbot`'s feature map, `CONTEXT.md` and the living architecture are updated when each slice lands.
