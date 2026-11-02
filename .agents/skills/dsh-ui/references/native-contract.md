# Native contract

Measured against DSH `0.1.5-rc.2` (`@deepseek-ai/dsh-client-ui-sidebar`, `@deepseek-ai/dsh-client-ui-workspace`) and verified in the running `web-dev` profile. Numbers are CSS pixels from the sidebar's outer left edge.

## Sidebar geometry

| Layer | CSS | Effect |
| --- | --- | --- |
| sidebar root | `padding-inline: var(--dsh-sidebar-inline-padding)` (12px) | content starts at 12 |
| shell `regionArea` (where a `sidebar.workspaces` registrant renders) | `padding-left: 4px; margin-left: -4px` (net 0) and `margin-right: calc(-1 * var(--dsh-sidebar-inline-padding))` | the right inset is the registrant's job; the rail variant zeroes both |
| registrant root | `padding-right: var(--dsh-sidebar-inline-padding)` | content right edge back to 12 |
| top-level rows (search, section headers, empty states) | own `padding: … 4px` | 16px on both edges — the symmetric result |
| list rows | wrap in `list-area`: `margin-right: calc(-1 * var(--dsh-sidebar-inline-padding))`; row `padding: … 8px` | row background bleeds under the scrollbar; text inset 8 |

Shipped reference (extracted): `hHd-Xa_regionArea`, `bhn1Oq_root`, `bhn1Oq_listArea`, `YDXeBa_sessionRow`.

### Measured rows (280px sidebar, light theme)

| Row | Box | CSS |
| --- | --- | --- |
| `.projectRow` (section header) | x 12, right 268, 256×34 | `padding: 0 8px`, `gap: 6px`, radius 8, `--dsw-alias-label-primary`; hover `--dsw-alias-interactive-bg-hover`; triangle `IconTriangleRightFill14` rotates 90° in 150ms `var(--ds-ease-in-out)`; trailing 16px glyphs, gap 12, hover-only |
| `.sessionRow` (channel/session) | x 12, right 268, 256×32 | `padding: 0 8px`, `gap: 0`, title `14px/20px` with `margin: 0 6px 0 4px` after the 16px leading slot; hover and selected both `--dsw-alias-interactive-bg-hover` |
| scopes | — | 2px between rows of one list/section, 4px between `.groupSection` blocks |

Both rows stop at the root content edge (12px from each sidebar edge). The
extracted `.listArea` `margin-right: -12px` is cancelled by `.list`'s own
`margin-right: 2px`, `padding-right: 2px` and 8px stable scrollbar gutter; a
registrant whose scroll root already carries the 12px right inset must not add
the bleed itself or its rows measure 12px wider than native.

## Tokens

- Three layers: `--dsw-static-*`, `--dsw-alias-*`, `--dsw-specific-*`; dark theme under `body[data-ds-dark-theme]` — never write a theme selector.
- Surfaces: `--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`; borders `--dsw-alias-border-l2`; text `--dsw-alias-label-primary|secondary|tertiary`; hover `--dsw-alias-interactive-bg-hover`; selection `--dsw-specific-sidebar-nav-item-active`; states `--dsw-alias-state-business|success|warn|error-primary`.
- Brand accents live in one `@bh-brand-aliases` block (≤3 entries); the `styles-tokens` test fails on any other `#hex`/`rgb(`/`hsl(`.

## Primitives and icons

- `@deepseek-ai/dsh-client-ui-primitives` is a shell baseline module: value-import it, keep it external in the bundle.
- Exports used so far: `Input`, `Tag`, `Pill`, `StateDot`, `Tooltip`, and the `Icon*Outline16` glyph set (`IconSearchOutline16`, `IconPlusOutline16`, `IconAgentPresetOutline16`, `IconNewChatOutline16`, `IconFolderOpenOutline16`, `IconChevronDownOutline14`, …). Icons carry `aria-label` on the button because the glyph itself does not.
- The `Button` export is a 36/28px capsule: wrong geometry for 32px square icon buttons and full-width rows — keep those hand-rolled and styled from tokens.

## Extract the shipped CSS

```bash
cd /tmp && npm pack @deepseek-ai/dsh-client-ui-workspace@0.1.5-rc.2 --pack-destination /tmp
mkdir -p /tmp/ui-workspace && tar -xzf /tmp/deepseek-ai-dsh-client-ui-workspace-0.1.5-rc.2.tgz -C /tmp/ui-workspace
# sidebar bundle already exists at packages/client/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js
```

```js
// node: print every CSS rule whose selector or body matches a filter
const fs = require('fs');
const s = fs.readFileSync('/tmp/ui-workspace/package/lib/client.js', 'utf8');
const rules = [...s.matchAll(/\.[A-Za-z0-9_\-:\[\] >,+*]{1,80}\{[^{}]{1,260}\}/g)].map((m) => m[0]);
console.log([...new Set(rules.filter((r) => r.includes('listArea')))].join('\n'));
```

## Measure the running shell

Use the Puppeteer install from `node_modules/.pnpm/puppeteer@*/node_modules/puppeteer` with a `createRequire` shim, load the DSH web URL, then read `getBoundingClientRect()` + `getComputedStyle()` for the native rows (`新会话`, `设置`) and our elements in one table. The token URL is one-shot per browser: reuse the curl cookie jar or restart `dsh web` for a fresh token before the headless run.

## Pointer-anchored context menus

Application-defined context menus use `packages/client/src/client/ds/pointer-menu.tsx`. A mouse caller supplies raw viewport `clientX/clientY`; a keyboard caller supplies the trigger's `getBoundingClientRect()` left/bottom. Do not use page/offset coordinates, feature-local nudges, or a transformed panel as a positioning container. Ordinary button-anchored dropdowns keep the native `Menu`, except the measured shared `ds/Select` contract below.

`PointerMenu` portals to `document.body`, measures its rendered coordinate scale and the actual native menu rectangle, and positions the menu at the requested viewport point. It alone owns window-edge clamping, native traffic-light clearance, available menu size and resize/scroll repositioning. A menu moves away from the pointer only to remain inside the safe viewport; native scrolling and submenu behavior remain intact. This keeps panel transforms, clipping ancestors and CSS zoom out of feature code.

### Qualified compact Settings picker exception

The compact Settings section picker uses `PointerMenu` because the pinned native body-portaled dropdown multiplies viewport coordinates under whole-window CSS zoom. Its optional `container` is the owning `[role="dialog"]`, so the native Menu root remains inside the active Modal and the native keyboard owner admits selection and Escape. Other callers retain the default `document.body` container. Keep the fixed viewport coordinate owner, measured scale, edge/traffic-light clamping and native scroll behavior; do not use a transformed Panel as a container. This exception is specific to the measured Settings picker, not permission to replace all anchored dropdowns. The #2269 native 430% journey verified viewport bounds, Down/Return selection, menu-only Escape, focus return and reset recovery; the feature map records remaining popup and platform qualification.

Regression: run `scripts/e2e-panel-workspace.mjs` against an isolated Host. It checks Channel-header and Channel-row menus at 100% and 125% CSS zoom, plus every Control Rail Panel’s header at normal scale, verifies alignment within one rendered pixel away from edges, tests bottom/right clamping and keyboard dismissal, and saves numeric evidence. Panel header Close menus use the same `usePanelMenu` → `PointerMenu` path regardless of Panel type. Closing affects only that Panel; its Control Rail switch and remembered position remain available. Escape restores header focus, and Shift+F10 anchors to the header’s lower-left corner. CSS zoom stress is Web evidence, not qualification of native macOS window behavior.

## Panel scrollbar visibility

Panel scroll containers use the shared `ds/panel-scrollbars` activity owner mounted once per Dock. Keep the DSH-native scrollbar dimensions, track, thumb tokens and native dragging; never toggle `overflow` or `scrollbar-width` to hide it. Only the scrolling element's thumb becomes visible. After 800ms without scrolling, its thumb fades over 200ms; further scrolling immediately restores it. Hover alone does not reveal an idle thumb. Native thumb dragging remains visible while pressed. Reduced-motion preference removes the fade.

The owner captures descendant scroll events, including dynamically mounted and nested Panels, without React state updates. It cancels idle timers/animation frames on disposal. Do not add per-Panel listeners, hover-only scrollbar rules or content remounts. Scope this behavior to the Dock so native DSH surfaces and portaled menus/dialogs keep their own scrollbar contract.

## Desktop Panel drag ownership

Only the shared Panel title button (`data-panel-hide`, icon + label) is a Panel drag handle. Channel identity, header tabs and actions remain outside it. Header whitespace and unused Control Rail space use the DSH native window-drag contract; interactive descendants opt out with `data-window-drag-recall`.

Verified against Dockview 8.4.1 and the shipped DSH 0.2.1-rc.2 frontend: Dockview adds a draggable, focusable `role=tab` wrapper outside our React header. A drag starting on that wrapper never traverses the inner header's capture handler. Reject non-title header drag starts at the outer Dock capture boundary, before Dockview's native listener. Regression tests must dispatch on the real `.dv-tab` and `.dv-tabs-and-actions-container` as well as the inner header, and separately prove title drags remain allowed.

DSH marks `[tabindex]` and `[role=tab]` as native `no-drag` regions. On macOS, explicitly restore `drag` on these Dock header wrappers while keeping title, context, tabs and actions `no-drag`. A passing DOM drag test does not prove native window movement: check both blank-header window displacement and title-only Panel drops in a non-fullscreen Desktop.

### Shared Select under whole-window zoom

The shared `ds/Select` also uses `PointerMenu` after the native body-portaled menu was measured
outside the viewport at 144% and 430%, and detached from its trigger below 100%. Its trigger
supplies the measured left/bottom or right/bottom anchor, and the menu owner applies start/end
alignment, native frame clearance and viewport clamping. The owning dialog is the portal
container so native Modal keyboard ownership still applies. Zoom/style, resize and scroll
changes update the anchor; closing restores focus only if the next action did not move it.
Native Menu still owns option rendering, composition guards and keyboard traversal. Other
button-anchored native Menu callers are unchanged and require their own qualification.

The coordinate owner uses CSSOM `currentCSSZoom` when available, with its existing rendered
probe fallback. A 1px probe is quantized at small zoom factors and cannot reliably convert a
long viewport distance in one placement. The qualified Desktop exposes `currentCSSZoom`;
[CSSOM View](https://www.w3.org/TR/cssom-view/#dom-element-currentcsszoom) defines it as the
effective CSS zoom. Available width also caps the native minimum so a choice menu can fit a
small viewport. This changes popup geometry, not the owning Panel's minimum constraints.

Run `node scripts/check-select-zoom.mjs --output <report.json>` for the real production
Select/SettingsDialog/PointerMenu and unmodified reachable native Menu/Modal code and CSS.
The isolated source fixture covers all 17 levels, start/end alignment, page/dialog placement,
two viewport sizes, keyboard selection, menu-only Escape, focus return, outside clicks and
zoom changes while open. `--baseline <ref>` runs the old Select and must fail on the reported
coordinate bug. It does not qualify a running DSH Host, native window controls or guest painting;
macOS acceptance remains a separate #2269 check.

### Native Tooltip under qualified desktop zoom

The 0.2.1-rc.2 native Tooltip also writes viewport anchor coordinates into a zoomed fixed
position element. At 144%, the Home name tooltip was measured around x907 while its button
was at x659–705. The downstream zoom lease owns the conversion for the pinned
`role=tooltip` / `data-side` / `data-align` contract. It records the focus/hover trigger,
measures the actual bubble, fits its screen rectangle and converts only the corrective
translation through `currentCSSZoom`; native visibility, delays, keycaps, dismissal and
composition remain native. It restores its translation/width lease on disposal and does not
run in ordinary browsers or unsupported desktop compositions. An existing independent
translation is not taken over. Source checks include all 17 levels, three sides, two alignments,
two viewport sizes and retained pinned bubbles while zoom changes. Native window
pixels remain a separate acceptance check; programmatic/unmapped third-party tooltip
triggers are not qualified by these representative button paths.
