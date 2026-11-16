---
Status: Proposed
Date: 2026-11-16
Issues: [#4282](https://github.com/BotHarness/DeepSeekBot/issues/4282), [#4283](https://github.com/BotHarness/DeepSeekBot/issues/4283)
---

# Tobs owns its design tokens

ADR-0194 made the Bot-mode design system a semantic layer over DSH: every colour resolved to a `--dsw-*` variable, and DSH primitives stayed the controls. In practice that layer could not fix how Bot mode looks. Rows, icon slots and gaps were decided component by component, DSH outline icons differ in optical weight, and the colours were DSH aliases with ad-hoc `color-mix`. The mobile palette was generated from the same DSH theme, so a DSH upgrade moved both apps at once. The owner asked for our own token specification and a full refactor.

## Decision

Tobs has its own design tokens, with one source: `design/tokens/tobs.tokens.json`, in the W3C Design Tokens format.

- **Three tiers.** `core` holds what every product family shares: the four accent families, status colours and breakpoints. The desktop/Web semantic layer (`web`) holds roles, not values: layers (canvas, raised, well, field, nav, sheet, scrim), ink, lines, interaction states, accent, status, type, space, size, radius, edge, elevation and motion. Mobile and the docs/marketing sites read `core` and keep their own semantic layers and native or coss controls.
- **Light and dark come from the Appearance preference only.** Colour and shadow tokens carry a dark value. The Appearance scope installs the `--tobs-*` custom properties for the active mode; Bot mode neither reads nor writes DSH's `data-ds-dark-theme`. A preset swaps only the accent family.
- **Generated, checked outputs.** `scripts/generate-tokens.mjs` writes `ds/tobs-tokens.generated.ts` (the custom properties per mode, accent families and breakpoints) and `ds/tobs.stylex.ts` (StyleX constants: colours as `var(--tobs-*)`, dimensions as literals). `pnpm lint` fails when either is stale. A test holds the contrast gate: primary and secondary ink at least 4.5:1 on canvas, raised and well, and tertiary ink and accent at least 3:1, in both modes.
- **Alignment is a component contract.** A navigation or list row is inset, a 20px icon slot with the 16px glyph centred, an 8px gap, then the label column. Group headings carry no icon and start on the label column. `ds/NavItem` and `ds/NavGroupHeading` own it; screens do not compute it.
- **Migration is guarded.** `scripts/check-design-tokens.mjs` (in `pnpm lint`) rejects new `--dsw-*` references, new DSH UI imports and newly styled raw `<button>`, `<input>`, `<select>` or `<textarea>` elements outside `ds/` in `packages/client`. Existing uses sit in `scripts/design-token-baseline.json`, which only shrinks.

This supersedes ADR-0194's rule that colours resolve to `--dsw-*` and that DSH primitives stay the controls. Its content rules, StyleX authoring and `defineConsts` choice remain. Replacing DSH overlays with Base UI, which revisits ADR-0028's component-library clause, is a separate decision in #4285.

## Considered Options

- **Keep the semantic layer over DSH and fix #4279 locally** — fixes one page's alignment but not the colours, and leaves every future surface on DSH's values.
- **Per-platform token files** — Web, mobile and the sites would drift, and a brand change would need three edits.
- **Read DSH's dark flag** — rejected so Bot mode cannot inherit DSH theme bugs and the two never fight over the attribute.

## Consequences

- Bot mode changes appearance only where a surface reads Tobs tokens. The first one is the Bot settings sidebar; the remaining surfaces move in #4284 onward, each shrinking the baseline.
- Mobile keeps `palette.generated.ts` from DSH until #4289 points its generator at `core`.
