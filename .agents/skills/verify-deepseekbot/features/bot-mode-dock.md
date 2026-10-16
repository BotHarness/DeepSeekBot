# Bot mode dock (desktop layout)

On a desktop-width window (961px and wider), Bot mode lays out the Channel body and the Channel sidebar entries as Dock panels. The Bot mode App Sidebar occupies the native-sized column outside the dock; see [bot-mode.md](bot-mode.md). Narrower windows keep the overlay Channel sidebar.

## Sub-features

- `default-layout` opens the Channel body with Sessions above Bot Inbox on the right. Other panels start closed.
- `panels-menu` appears at the top right of the Channel body only while the App Sidebar is collapsed. It lists every registered panel, reopens a closed one where it was, and has `Reset layout`. With the App Sidebar expanded, use its pinned panel cards.
- `dock-panels-service` lets another plugin `inject(['dockPanels'])` and `register({ id, title, icon, scope, defaultPosition, order, component })`. A `global` panel keeps its content and place when the active Channel changes; a `channel` panel receives the active Channel. `open`, `close`, `toggle`, `isOpen` and `openPanels` drive the mounted layout.
- `pinned-cards` toggles any panel from its card in the Bot mode sidebar; `activity-center` is a built-in `global` panel opened from the first card.
- `close` closes any panel except the Channel body.
- `drag-split` drags a panel by its header to split beside another panel or the layout edge. A drop on a panel's center is refused, so panels never become tabs.
- `persist` saves the layout to `localStorage` key `botharness.bot-mode-layout` (versioned dockview serialization) and restores it on reload.
- `narrow` falls back to the overlay sidebar below 961px and returns to the dock when widened.

## How to get to it (user POV)

- Enter Bot mode in a window at least 961px wide and open any Channel.
- Use the pinned panel cards in the expanded App Sidebar, or collapse the App Sidebar to reveal the `Panels` button at the top right of the Channel body. Each panel also has its own close button.

## Driving it with verify-app

Preconditions: a fresh instance that passes `doctor`.

- **Default layout.** Run `node scripts/verify-app.mjs shot dock --name <n> --bot-mode`. The ARIA file has `region "Bot mode layout"`, `button "Close Sessions"` and `button "Close Bot Inbox"`, and no close button for the Channel body. With the App Sidebar expanded there is no visible `Panels` button; its pinned cards still toggle panels.
- **Collapsed menu.** Click `Collapse sidebar`: `Panels` appears. Open it, then expand with `Open sidebar`: the trigger and open menu disappear. Collapse again to reopen the menu; panel selections and positions stay unchanged. Also resize across the native responsive collapse boundary while keeping the desktop dock active.
- **Close and reopen.** Add `--click "Collapse sidebar" --click "Close Bot Inbox" --click Panels --click "Bot Inbox"`. Bot Inbox is back below Sessions.
- **Narrow.** `shot` captures at 1440px. From a Puppeteer script, `page.setViewport({ width: 900, height: 800 })` after Bot mode loads: the ARIA tree has no `region "Bot mode layout"` and the old sidebar toggle is back. Widen again and the dock returns.
- **Plugin panel.** In the page, after Bot mode loads, register a test panel through the Client context the way a plugin does, then open it from `Panels`. The panel's title is in the menu and its header has `Close <title>`. Switch Channels: a `global` panel stays put.
- **Canonical state.** The layout is browser state, not Host state: read `localStorage.getItem('botharness.bot-mode-layout')` from the page. `version` is `1` and `layout.panels` lists the open panels.

## Gotchas

- `shot` has no drag action. Drag and drop uses HTML5 drag events, which plain `page.mouse` moves in headless Chromium never fire. Drive drags from a Puppeteer script with `page.setDragInterception(true)`, then `page.mouse.drag(from, to)`, `dragEnter`, `dragOver` and `drop` at a point near the target's edge.
- A drop near the top of a panel header resolves to a split on the layout edge, not a tab. That is expected.
- The layout is one per browser, not per Channel. In a group Channel, the DM panels (Sessions, Bot Inbox) stay open and show `Nothing to show for this Channel.`, and Members starts closed.
