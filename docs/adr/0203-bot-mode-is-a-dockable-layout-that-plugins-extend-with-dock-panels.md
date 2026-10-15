---
Status: Proposed
Date: 2026-10-14
---

# Bot mode is a dockable layout that plugins extend with Dock panels

DeepSeekBot can already do far more than DSH's native shell shows, and Humans will add their own extensions: a goal tracker, a to-do list, or another store DSH does not have, like the Bot Inbox did. Such an extension needs a place on screen. Most Humans will not want every extension, so these extensions should stay plugins rather than built-ins, and BotHarness should make writing one easy. Today the desktop Bot mode panel has three fixed regions: the DSH-native App Sidebar on the left, the Channel body in the center, and the Channel sidebar on the right with icon tabs ([ADR-0183](0183-channel-sidebar-is-tabbed-and-configuration-lives-in-channel-settings.md)). Only the Channel sidebar width can change. A plugin can add a Channel sidebar entry, but it cannot add a region, and the Human cannot rearrange anything. We decided: **on desktop, Bot mode becomes one dockable layout that the Human can rearrange freely, but that stays as plain as an IM client such as Slack: each panel stands alone, with no tabs. The Channel body and every Channel sidebar entry are Dock panels inside the `main` area, while the App Sidebar column becomes BotHarness's own Bot mode sidebar, outside the dock. Other DSH plugins add their own Dock panels through a BotHarness Service, and each Human arranges a browser-local layout.**

## Decision

### Scope

- **Desktop Bot mode only.** The Bot mode layout exists only while the Client is in Bot mode at 960 px or wider. Outside Bot mode, DSH's native shell is unchanged. Below 960 px the Client falls back to today's responsive layout, where the Channel sidebar is an overlay of collapsible entries. The saved layout is kept and returns when the window widens again. Phones keep their current layout.

### Execution stays on DSH

- **The Bot mode layout is presentation only.** It changes where things appear on screen. It does not change how work runs. A PersonaBot is still an abstraction on top of DSH Sessions: the Orchestrator Session, Assignment Sessions and every Bot tool call run through DSH's Session execution and its plugin ecosystem. The Human talks to a Bot rather than to a raw Session, but each turn still runs in a DSH Session. A Dock panel, including one from a third-party plugin, reaches the Host only through DSH Services and the existing Host↔Client seam, and never through a second execution path.

### Bot mode draws its own App Sidebar, outside the dock

- **BotHarness owns the left column in Bot mode.** On desktop Bot mode the Client shadows the DSH `sidebar` single slot at a lower priority than native (`priority: -1`; in DSH's slot rules the lowest number renders) and draws its own **Bot mode sidebar** in that column: brand, pinned panel cards, the Roster, Bot mode settings and an explicit **Exit Bot mode** control (`ctx.layout.selectPanel(null)`), because the native panel rows that used to lead out of Bot mode are no longer shown. Leaving Bot mode disposes the shadow and the native App Sidebar returns unchanged. Narrow layouts and phones keep today's behaviour.
- **It is not a Dock panel.** DSH still sizes the column from its own layout store (264–420 px, with its own resize and collapse), so the Bot mode sidebar keeps that width and the dock lives only in `main` (`main` key=`conversation`).
- **Other plugins' left-column contributions are hidden in Bot mode.** DSH only lets the entry that declared a slot render it, so a shadow cannot re-render `sidebar.panellist`, `sidebar.settings`, `sidebar.footer.action` or the other native sub-slots ([evidence](https://github.com/BotHarness/DeepSeekBot/issues/1790#issuecomment-6174806479)). They are absent while Bot mode is on and come back outside it. The Human accepted this trade-off for a Bot mode with its own look.
- **We ask DSH for a layout API.** We file an upstream request for a supported way for a plugin to own or rearrange the shell columns ([#1794](https://github.com/BotHarness/DeepSeekBot/issues/1794)). If DSH ships one, the Bot mode sidebar can become a Dock panel and keep other plugins' contributions.

### Layout engine

- **dockview.** The layout uses [dockview](https://dockview.dev) (React, MIT, no runtime dependencies). It provides splits, drag-to-dock and a serializable layout; its floating groups and pop-out windows are turned off. It is themed only through the dsh-ui token alias table, so the shell stays visually native.
- **One panel is one panel: no tabs.** A panel never shares its space with another panel as a tab. Each dockview group holds exactly one panel, and its tab strip is replaced by a plain panel header with the title, which is also the drag handle. Dropping a panel onto another panel's center (which would tab them) is disabled; dropping on an edge splits the space. Panels sit next to each other, as in Slack.
- **No floating, no pop-out windows.** Every panel is docked. A panel cannot float above the layout or pop out into a separate browser window.

### Dock panels

- **Built-in Dock panels.** The built-in panels are the Channel body, the **Activity Center**, and one panel for each Channel sidebar entry: Sessions, Bot Inbox, Memory files, Memory evolution, Schedules, Computer, Browser, and any plugin entry. Entries that ADR-0183 put together under one tab, such as Sessions with Bot Inbox, or Memory files with Memory evolution, are now separate panels.
- **Activity Center is a `global` Dock panel** (`id: 'activity-center'`, amended for [#1829](https://github.com/BotHarness/DeepSeekBot/issues/1829)). It shows the same Overview and Human Inbox as the full Activity Center page, so the Human can keep it open next to the Channel body. Its tabs are local to the panel, and opening a Channel from it leaves the panel open. The full page remains the destination when no Channel is open, on narrow windows and on phones.
- **Exactly one Channel body.** Exactly one Channel body exists and it cannot be closed. Selecting a Channel changes what it shows. Several Channel bodies, whether as tabs or side by side, are rejected, because they would make the interaction and the screen too complex.
- **The App Sidebar selects the active Channel.** Selecting a Channel in the Roster of the Bot mode sidebar makes it the active Channel. The Roster highlights it, the Channel body renders it, and every `channel`-scoped Dock panel shows it.
- **Each panel declares its scope.** A `channel` panel follows the active Channel. A `global` panel, such as a to-do list, does not follow it. A `channel` panel with nothing to show for the active Channel, such as a DM-only entry while a group is active, shows an empty state rather than disappearing, so the layout does not jump.

### The Dock panel registry

- **A Cordis Service.** The BotHarness Client provides a `dockPanels` Service (`ctx.provide`). A plugin is a Consumer that `inject`s it and calls `register(panel)`, and gets back a disposable. A registration carries a stable `id`, `title`, `icon`, `scope` (`global` or `channel`), a `defaultPosition` hint (a zone `left | center | right | bottom`, optionally relative to another panel id), an optional `order`, and a React `component`. Registration, removal and ordering follow the Registry rules of [ADR-0053](0053-channel-sidebar-is-the-scoped-right-sidebar.md). Ids are owned by their plugin, and registering a duplicate id throws.
- **`channelSidebar` stays as a compatibility Consumer.** `channelSidebar.register(entry)` registers a `channel`-scoped Dock panel. `registerTab(tab)` turns into a default-layout hint that places its entries next to each other, split rather than tabbed. Entries with `surface: 'settings'` remain Channel settings sections. The narrow overlay still renders entries the way it does today. Existing callers, such as the Computer and Browser plugins, keep working unchanged.

### Data belongs to the plugin's own capability seam

- **A Dock panel is only a UI Consumer.** A plugin that keeps data, such as goals or to-dos, follows DSH's Capability seam (`Consumer → Service Definition → Provider`). It defines its own Service and a Host Provider that persists the data. The Dock panel and the plugin's Bot tools are both Consumers of that Service. BotHarness adds no generic panel store, and the Bot mode layout never holds plugin data.
- **CLI parity applies to the plugin's Host surface, not to the layout.** The layout is browser-local presentation, with no bridge method, Host route or Bot tool, so it has no CLI command. A plugin's own bridge methods, routes and Bot tools follow [CLI parity (AX)](../../AGENTS.md#cli-parity-ax) as usual.

### The Human arranges the layout

- **One layout per browser, plus Reset.** The layout lives in browser localStorage under a new key, as a versioned dockview serialization. When restoring, panels that are not registered right now (a plugin was removed) are skipped, but their last position is remembered and reused when they register again. Saving named layouts is deferred. On first load, the existing `botharness.channel-sidebar` width seeds the right column. Because panels are never tabbed, every open panel is visible at once, so the default layout opens only a few: the Channel body on the left of the `main` area and Sessions above Bot Inbox on its right, which matches today's default Sessions tab. Every other panel (Memory files, Memory evolution, Schedules, Computer, Browser, plugin panels) starts closed and is opened from the Panels menu. When it opens, it splits into the right column unless its registration asks for another position.
- **Pinned panel cards in the Bot mode sidebar** (amended for [#1829](https://github.com/BotHarness/DeepSeekBot/issues/1829)). Below the brand row, the Bot mode sidebar shows a row of small cards, one per registered Dock panel except the Channel body, like a browser's pinned tiles. A card shows its panel's icon, is highlighted while that panel is open, and toggles it through the `dockPanels` Service (`toggle`, `openPanels`, and `available` for whether a layout is mounted); it never touches dock internals. The Activity Center card replaces the old Activity Center row and keeps its unread count and action dot. While no layout is mounted, such as before a Channel is open, the Activity Center card opens the full Activity Center page and the other cards are disabled. On the collapsed rail the cards become a vertical icon stack. The cards are a second entry point beside the Panels menu, not a replacement for it.
- **A Panels menu replaces + Views on desktop.** The Channel body header has a **Panels** button, like VS Code's View menu, because the Channel body is the one panel that is always open. It lists every registered Dock panel except the Channel body, each with a checkbox. A panel that is closed and then reopened returns to its last position, or to its default position if it has none. The menu ends with **Reset layout**. Panels other than the Channel body can also be closed with the close button in their panel header.

### Making plugins easy to write

- **Example plugin, guide and skill.** The same change train ships a minimal example plugin. It contains a to-do Service with a Host Provider, a Bot tool with its CLI command, and a `global` to-do Dock panel. It also ships a bilingual authoring guide and a skill, so that a Bot running in DSH's creative Profile, which can author plugins, can build a panel for itself by following them.

## Delivery

These are tracer-bullet slices. Each one ends in a state the Human can run and judge.

1. **Docked Channel** ([#1789](https://github.com/BotHarness/DeepSeekBot/issues/1789)). Desktop Bot mode renders dockview inside `main`, containing the Channel body and every Channel sidebar entry as Dock panels, through the `channelSidebar` compatibility Consumer. Panels can be dragged and docked by splitting, and are never floated or tabbed. The layout persists browser-locally and the narrow fallback still works.
2. **Public registry** ([#1791](https://github.com/BotHarness/DeepSeekBot/issues/1791)). Add the `dockPanels` Service with `global` and `channel` scopes, the Panels button and Reset layout. Seed the layout from the old preferences and retire + Views on desktop.
3. **Example plugin and guide** ([#1792](https://github.com/BotHarness/DeepSeekBot/issues/1792)). The to-do example plugin with its Service, Provider, Bot tool, CLI command and Dock panel, plus the authoring guide and skill.
4. **Bot mode sidebar** ([#1790](https://github.com/BotHarness/DeepSeekBot/issues/1790)). Shadow `sidebar` at `-1` in desktop Bot mode and draw the Bot mode sidebar with the Roster and an Exit Bot mode control. It does not depend on the dock and can run in parallel with slice 1.
5. **Upstream** ([#1794](https://github.com/BotHarness/DeepSeekBot/issues/1794)). File the DSH layout API request with the evidence from #1790 and track it.
6. **Pinned panel cards** ([#1829](https://github.com/BotHarness/DeepSeekBot/issues/1829)). Replace the Activity Center row in the Bot mode sidebar with pinned panel cards, and make Activity Center a `global` Dock panel.

## Considered Options

- **motion-panels.** Rejected as the engine. It animates split panes, with fold, collapse and snap animations on resize. It has no tabs, no docking between groups, no floating groups and no layout serialization. It is also pre-1.0 with one maintainer.
- **Make the App Sidebar a Dock panel that keeps the native sub-slots.** Chosen first, then rejected after checking DSH `0.2.0-rc.2`: a `sidebar` shadow does not free the column's width and cannot render the native sub-slots. Waits for the DSH layout API.
- **Keep the native App Sidebar in Bot mode.** The lowest-risk option, since every plugin's left-column contribution keeps working. Rejected because the Human wants Bot mode to have its own sidebar.
- **Collapse the native column and dock our sidebar inside `main`.** Rejected. On the web a 56 px rail remains, and collapsing flips the Human's own sidebar preference.
- **Fixed zones only (left, center, right, bottom).** Rejected in favour of full docking, which is the VS Code experience the Human asked for.
- **Tabbed panel groups and several Channel bodies (VS Code style).** Rejected. Tabs inside a panel and several open Channels make the interaction and the screen too complex. An IM client such as Slack shows that one panel per region is easy to understand.
- **Declarative panels generated by a Bot without code.** Deferred. Code plugins come first. A Bot in the creative Profile can already write a code plugin, so it gets the same result once authoring is easy.
- **A generic BotHarness panel store.** Rejected. Storage belongs to each plugin's own Service and Provider, the way DSH composes capabilities.
- **Host-synced layout and named layouts.** Deferred. Host sync would add a bridge surface and a CLI command for what is presentation. One browser-local layout plus Reset matches how Channel sidebar preferences work today.
- **Only the Panels menu, with no sidebar entry for panels.** Rejected by the Human for #1829: panels keep growing, and cards show at a glance which are open and toggle them in one click.
- **Floating panels inside the window.** Rejected for now by the Human. Docked panels alone keep the layout simple; floating can return later if a panel needs it.
- **Pop-out browser windows.** Rejected. Rendering React across windows and keeping DSH Context alive in them is costly, for little benefit.

## Consequences

- On desktop, this supersedes ADR-0183's tab strip, its top and bottom split, and the + Views menu. ADR-0183 continues to govern Channel settings and the narrow overlay. ADR-0053's entry Registry rules carry over to Dock panels.
- Bot mode owns its left column and the layout of its `main` area, which moves DeepSeekBot closer to a standalone product that runs on DSH. The dsh-ui rule "shadow only `sidebar.workspaces` and `main key=conversation`" gains one exception: desktop Bot mode shadows the whole `sidebar` slot at `-1`. DSH tokens, primitives and the inset contract still apply in the Bot mode sidebar and inside every Dock panel. Because a DSH change to the `sidebar` slot can now break Bot mode, the pinned-release end-to-end tests cover the Bot mode sidebar and the way out of Bot mode.
- dockview adds to the Client bundle, and its CSS must be fully mapped to DSH tokens.
- `verify-deepseekbot`'s feature map, `CONTEXT.md` and the living architecture are updated when each slice lands.
