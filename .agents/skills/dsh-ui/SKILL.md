---
name: dsh-ui
description: Use when building, styling, or reviewing in-harness UI — the BotHarness client plugin inside the DeepSeek Harness Web Client. Trigger on new or changed components under `packages/client`, layout or padding alignment with native DSH, tokens/primitives or theme questions, slot and shadow wiring, and any "match the native shell" request.
---

# DSH-native UI

Bot mode owns its components and tokens inside the DSH shell. Measure Slot and inset geometry against the running shell. See the [Desktop/Web UI decisions](../../../docs/decisions/desktop-ui.md#adr-0028).

Before designing or reviewing a changed surface, apply the shared [UI design standard](../../../docs/agents/ui-design.md) and its review gate: layout, icons and interaction carry the task; prose supplies only necessary context.

## Build order

1. **Slot wiring** — register through the documented seams: `sidebar.footer.action` for the persistent entry; shadow `sidebar.workspaces` and `main key=conversation` only while a mode is active, reconciling from one store and disposing on exit. Desktop Bot mode also shadows the whole `sidebar` slot at `-1` to draw the Bot mode sidebar ([Dock workspace](../../../docs/decisions/desktop-ui.md#adr-0203)). A shadow cannot re-render the native `sidebar.*` sub-slots, so it must provide its own way out of Bot mode. Keep one entry per concept. Done when the entry appears in the running shell and the shipped UI returns intact when the mode is off.
2. **Tokens** — use the generated roles in `ds/tobs.stylex.ts` for Bot mode. Match the current style and appearance mode. Done when `check-design-tokens` passes and the light and dark review confirms legibility.
3. **Design system** — compose the shared `ds/` components. Give each settings row one title and one control. A single field saves on Enter or blur. Use footer actions for grouped writes and destructive steps, with at most one primary action. Follow [UI copy](../../../docs/agents/ui-copy.md). Done when the shared components and rules cover the feature's controls.
4. **Composition** — for a net-new surface or control, pick the closest precedent in `references/design-references.md` before choosing layout; borrow composition, hierarchy, and states, not styling. Done when the PR names the borrowed pattern and every deliberate deviation.
5. **Layout** — apply the native inset contract in `references/native-contract.md`. Done when top-level content measures 16px from both sidebar edges and list-row backgrounds reach the scrollbar gutter.
6. **Primitives and icons** — use the shared Tobs controls and glyphs on Bot-mode surfaces. Done when their measured layout fits the shell and the PR records any deliberate geometry exception.
7. **Verify & ship** — `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`; confirm the client bundle requires only react-family plus declared baseline modules; check the `web-dev` profile in light and dark. Done when the bundle revision changed and both themes pass by eye.

## Rules

- **Tobs tokens** ([ADR-0348](../../../docs/decisions/desktop-ui.md#adr-0348), #4282): new or touched Bot-mode code reads `ds/tobs.stylex.ts` (generated from the DTCG 2025.10 sets under `design/tokens/`, wired by `tobs.resolver.json`, by `pnpm tokens`; components read style role tokens (`style.*`) and accent roles (`accent.solid`, `accent.container`, …), never size-named radii for a role ([ADR-0351](../../../docs/decisions/desktop-ui.md#adr-0351))) and composes `ds/` components such as `NavItem`; `scripts/check-design-tokens.mjs` rejects new `--dsw-*`, DSH UI imports and styled raw controls outside `ds/`.
- **Overlays are Tobs components on Base UI** ([ADR-0349](../../../docs/decisions/desktop-ui.md#adr-0349), #4285): use `ds/Dialog` (and the Menu, Popover, Tooltip, Select and Toast that follow) instead of DSH overlays. Only `ds/shell-layer.ts` talks to DSH's overlay stack.

- **Native lookups beat intuition**: extract the shipped CSS from the installed packages before adding spacing or a control (`references/native-contract.md` has the recipe).
- **One authority per concept**: one mode entry, one projection of state; a second entry point reads as a second feature.
- **Tokens over literals**. Use shared role tokens in StyleX and interpolate them in plain CSS. Use spacing and surfaces for separation. The [style theme contract](../../../docs/decisions/desktop-ui.md#adr-0351) defines the allowed lines and focus treatments.
- **Layers match mobile** (`apps/mobile/DESIGN.md`, "Layers and states"): Bot bubbles and cards are `color.surface` with no edge, a recessed area inside them (option lists, command previews) is `color.well`, and the Human's pick on a well is `color.accentTint`. A DM's Human bubble takes the Bot's primary colour through `humanBubbleColors`, the same rule as the mobile `withAccent`. Action-card buttons are borderless pills: primary is `fg` with a `base` label (`bh-request-primary`), secondary is the opaque `--bh-surface-selected`, and danger is `--bh-on-surface-danger` on `--bh-surface-danger`; never a translucent role as a fill.
- **Baseline externals only** in the client bundle; adding one updates the bundle contract test in the same commit.
- **Modes unwind**: shadows and listeners reconcile from a single store and dispose cleanly.

- **Pointer menus have one positioning owner**: use `ds/PointerMenu` for every application right-click menu. Pass unmodified `clientX/clientY`; never add feature-local offsets or construct a coordinate proxy anchor. See the coordinate contract in `references/native-contract.md`. Native anchored dropdowns continue to use `Menu`, except the measured compact Settings picker and shared `ds/Select` under whole-window zoom; its owning-Modal container contract is recorded in the native-contract reference.

## Reference

- `references/native-contract.md` — measured sidebar geometry, the shipped-CSS extraction recipe, and the headless measurement script.
- `references/design-references.md` — external precedents (coss.com/ui, Beautiful UI, shadcn/ui, Lucide): what to borrow and what stays out.
