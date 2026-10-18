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

Application-defined context menus use `packages/client/src/client/ds/pointer-menu.tsx`. A mouse caller supplies raw viewport `clientX/clientY`; a keyboard caller supplies the trigger's `getBoundingClientRect()` left/bottom. Do not use page/offset coordinates, feature-local nudges, or a transformed panel as a positioning container. Ordinary button-anchored dropdowns keep the native `Menu`.

`PointerMenu` portals to `document.body`, measures its rendered coordinate scale and the actual native menu rectangle, and positions the menu at the requested viewport point. It alone owns window-edge clamping, native traffic-light clearance, available menu size and resize/scroll repositioning. A menu moves away from the pointer only to remain inside the safe viewport; native scrolling and submenu behavior remain intact. This keeps panel transforms, clipping ancestors and CSS zoom out of feature code.

Regression: run `scripts/e2e-panel-workspace.mjs` against an isolated Host. It checks Channel-header and Channel-row menus at 100% and 125% CSS zoom, plus every Control Rail Panel’s header at normal scale, verifies alignment within one rendered pixel away from edges, tests bottom/right clamping and keyboard dismissal, and saves numeric evidence. Panel header Close menus use the same `usePanelMenu` → `PointerMenu` path regardless of Panel type. Closing affects only that Panel; its Control Rail switch and remembered position remain available. Escape restores header focus, and Shift+F10 anchors to the header’s lower-left corner. CSS zoom stress is Web evidence, not qualification of native macOS window behavior.

## Panel scrollbar visibility

Panel scroll containers use the shared `ds/panel-scrollbars` activity owner mounted once per Dock. Keep the DSH-native scrollbar dimensions, track, thumb tokens and native dragging; never toggle `overflow` or `scrollbar-width` to hide it. Only the scrolling element's thumb becomes visible. After 800ms without scrolling, its thumb fades over 200ms; further scrolling immediately restores it. Hover alone does not reveal an idle thumb. Native thumb dragging remains visible while pressed. Reduced-motion preference removes the fade.

The owner captures descendant scroll events, including dynamically mounted and nested Panels, without React state updates. It cancels idle timers/animation frames on disposal. Do not add per-Panel listeners, hover-only scrollbar rules or content remounts. Scope this behavior to the Dock so native DSH surfaces and portaled menus/dialogs keep their own scrollbar contract.
