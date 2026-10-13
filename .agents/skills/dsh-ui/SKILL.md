---
name: dsh-ui
description: Use when building, styling, or reviewing in-harness UI — the BotHarness client plugin inside the DeepSeek Harness Web Client. Trigger on new or changed components under `packages/client`, layout or padding alignment with native DSH, tokens/primitives or theme questions, slot and shadow wiring, and any "match the native shell" request.
---

# DSH-native UI

The in-harness UI is part of the shell, not a standalone app (ADR-0028): style with `--dsw-*` tokens, compose with `ui-primitives`, and copy the native layout contract instead of inventing spacing. **Measure the running shell; do not guess.**

## Build order

1. **Slot wiring** — register through the documented seams: `sidebar.footer.action` for the persistent entry; shadow `sidebar.workspaces` and `main key=conversation` only while a mode is active, reconciling from one store and disposing on exit. Keep one entry per concept. Done when the entry appears in the running shell and the shipped UI returns intact when the mode is off.
2. **Tokens** — every colour, font, and radius reads from `--dsw-*` (static/alias/specific layers); dark arrives through `body[data-ds-dark-theme]`. Brand accents stay inside the ≤3-entry alias block. Done when the `styles-tokens` guard passes and a dark pass shows no unreadable text.
3. **Design system** — build Bot-mode surfaces from `packages/client/src/client/ds/` (ADR-0194): `SettingsDialog`, `SettingsSection`, `SettingsRow`, `Select`, `NumberStepper`, `Note`, `EmptyState`, styled with StyleX and the tokens in `ds/tokens.stylex.ts`. Follow its content rules: one title, one line of description and one control per row; switches, choices and steppers apply on change; one text field saves on Enter or blur; at most one primary button; internal ids and revisions stay out of the default view. Done when the `design-system-tokens` guard passes and no new `bh-` rule duplicates a component.
4. **Composition** — for a net-new surface or control, pick the closest precedent in `references/design-references.md` before choosing layout; borrow composition, hierarchy, and states, not styling. Done when the PR names the borrowed pattern and every deliberate deviation.
5. **Layout** — apply the native inset contract in `references/native-contract.md`. Done when top-level content measures 16px from both sidebar edges and list-row backgrounds reach the scrollbar gutter.
6. **Primitives & icons** — use the exported set (`Input`, `Tag`, `Pill`, `StateDot`, `Tooltip`, …) and `Icon*Outline16` glyphs where geometry matches; keep a custom icon only where the set has no analogue. Done when controls sit on the shell's grid; record every deliberate omission (for example the 36px capsule `Button`) in the PR.
7. **Verify & ship** — `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`; confirm the client bundle requires only react-family plus declared baseline modules; check the `web-dev` profile in light and dark. Done when the bundle revision changed and both themes pass by eye.

## Rules

- **Native lookups beat intuition**: extract the shipped CSS from the installed packages before adding spacing or a control (`references/native-contract.md` has the recipe).
- **One authority per concept**: one mode entry, one projection of state; a second entry point reads as a second feature.
- **Tokens over literals**; the guard test enforces it. Centralise fallbacks in one delimited alias table per bundle (`@bh-<bundle>-aliases`, values audited against the pinned theme); components read table names, never inline hex or bare `var(--dsw-*)`. A missing DSH token gets a table entry with rationale; content-fixed colours (video letterbox) live in a separate delimited block with rationale.
- **Baseline externals only** in the client bundle; adding one updates the bundle contract test in the same commit.
- **Modes unwind**: shadows and listeners reconcile from a single store and dispose cleanly.

## Reference

- `references/native-contract.md` — measured sidebar geometry, the shipped-CSS extraction recipe, and the headless measurement script.
- `references/design-references.md` — external precedents (coss.com/ui, Beautiful UI, shadcn/ui, Lucide): what to borrow and what stays out.
- `docs/adr/0194-deepseekbot-design-system-is-stylex-tokens-over-dsh.md` records the design system, its content rules and why tokens are `defineConsts`.
- `docs/adr/0028-in-harness-ui-uses-dsh-design-system.md` and `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md` hold the decision and the token inventory.
