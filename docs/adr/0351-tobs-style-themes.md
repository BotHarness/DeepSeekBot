---
Status: Accepted
Date: 2026-11-17
Issues: [#4282](https://github.com/BotHarness/DeepSeekBot/issues/4282)
---

# Tobs has three switchable style themes over one token set

ADR-0348 gave Tobs its own tokens for one look, direction A. The owner wants three looks, switchable at runtime, with every panel of the app speaking the same design language. The decisions below come from two rounds of review with the owner, grounded in `docs/research/4282-design-token-best-practices.md`.

## Decision

**Three independent axes.** Colour mode (light, dark), style (A Default, B Apple, C Material; B and C are named after the design languages they draw on, macOS/iOS and Material 3 Expressive) and accent preset are independent switches. The token source moves to the W3C Design Tokens 2025.10 format: object colour and dimension values, light and dark as separate sets, and a resolver file with the modifiers `mode`, `style` and `accent`. The generator still emits `--tobs-*` custom properties and StyleX constants. The style switch sits in Appearance settings next to the accent preset and is stored per device, like colour mode. A is the default.

**What a style changes.** About 25 style tokens, all aliases into shared primitive scales, so a style never carries a colour value:

- UI text size: 13/20 for A and B, 14/20 for C.
- Control height: 28 for A, 24 for B, 32 for C (each as in its prototype). The 24px minimum stays.
- Row heights for navigation and lists.
- List model: one grouped card per section with inset hairline separators, on the raised layer with no edge (A) or on an elevated layer with a hairline edge over a grey backdrop (B); separate tiles with 2px gaps (C). Rows use UI text, not title text, as in the prototypes.
- Radius by role (`control`, `field`, `container`, `overlay`, `list-group`, `list-item`, `nav-selected`, `composer`, `bubble`) over the primitive scale 0/4/6/10/12/14/16/20/28/full.
- Selected-navigation fill and ink: neutral fill (A), accent fill with white ink (B), tonal accent container (C).
- Icon size and slot, segmented control, switch and chip shapes.
- In the chat area: bubble radius, composer radius (a pill in C), spacing between messages and message text size. Avatar size and code fonts stay shared.

Colour roles, spacing, font families, motion, breakpoints and z-order are shared by all styles.

**Colour rules.**

- Accent reach differs by style. In A and B only accent-bearing elements (primary buttons, switches, selection, focus) follow the accent; panels and muted ink stay neutral. C follows Material 3's tonal surfaces: panel layers, the selected state, hover and secondary, tertiary and quiet ink take a small share of the accent (a custom colour included), re-checked for contrast after tinting.
- Text ink, including tertiary, meets 4.5:1 on every surface it can sit on. A separate `ink.quiet` at 3:1 is for icons and decoration only.
- Each accent preset gets a fixed role set per mode at build time (`solid`, `solid-hover`, `on-solid`, `container`, `on-container`, `tint`, `ink`, `focus`, and `selection` for style B, which keeps white ink in both modes). Runtime colour mixing stays only for a user's custom colour.
- The contrast test runs in CI for every combination: 2 modes × 3 styles × 4 accents, over every surface and selected state.

**Interaction rules.**

- Selection never shifts layout. A selected item takes the selected fill, primary ink for text and icon, and medium weight, as in the prototypes (revised 2026-11-17 after review: the earlier accent icon, regular weight and 1.5:1 fill read worse than the prototype). The fill stays at least 1.1:1 against its surface. The label fills the row and truncates, so the weight change does not move the trailing content. No border marks a selection.
- Surfaces are separated by gaps that show the canvas, not by lines. Borders are kept for inputs, focus rings and the row separators inside style B's grouped cards. Lint flags new borders elsewhere.
- Focus rings are 2px in every style: drawn outside controls and inset on list rows, with an `edge.focus-offset` token.
- Icon stroke is defined in rendered pixels, starting at 1.5px.
- There is no separate density setting; each style sets its own density.

**One design language across panels.** Shared `ds/` primitives (panel, panel header, toolbar, section header, list group, list row, setting row, controls, menus) read the style tokens. Chat, sidebar, settings, activity, memory, market, dialogs and menus all compose them, so switching style changes every panel by swapping tokens only.

**Mobile.** The Expo app has no style switch. It uses the platform's current native controls (iOS 27 on iOS, Material 3 Expressive on Android) and shares only the colour tokens, including accent and status colours. Narrow Web layouts use the same styles as desktop.

**Golden examples.** Each style has prototype screenshots in light and dark, linked from its tracer-bullet issue (#4325 for A, #4326 for B, #4327 for C). A PR that builds or changes a style shows its own screenshot of the same settings state beside the golden one and explains any difference.

**Order.** (1) Rebuild the token source and resolver with no visual change to A beyond the colour rules above. (2) Build the shared primitives and move every panel onto them. (3) Add B. (4) Add C. Each step merges when CI is green.

## Considered Options

- **One look only** — rejected by the owner, who wants all three.
- **Per-component tokens for everything (Material 3)** — more tokens than the three styles need. Style tokens cover only the families that differ.
- **A density axis** — each extra axis multiplies the resolutions to test, and the styles already set density.
- **Styles also on mobile** — native controls on each platform read better than a mirrored desktop style.

## Consequences

- `design/tokens/` gains set files and a resolver. The generator emits one CSS block per style and mode, and the Appearance scope applies the active style as an attribute.
- Components stop reading size-named radii directly and read role tokens.
- The contrast test grows to 24 resolutions; a failing combination blocks CI.
