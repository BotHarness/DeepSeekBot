# In-harness UI follows the DSH design system; COSS stays on the docs site

The DSH Web Client ships a real design system: three token layers (`--dsw-static-*`, `--dsw-alias-*`, `--dsw-specific-*`) with a dark-theme override on `body[data-ds-dark-theme]`, plus `@deepseek-ai/dsh-client-ui-primitives` (Button, Input, Menu, Tag, Pill, StateDot, Tooltip, Toast, Modal, MarkdownText, `ic_ds_*` icons) which is part of the shell baseline every client plugin can reuse. Our client UI therefore styles with DSH tokens and primitives so it reads as part of the Harness and inherits light/dark theming; hand-rolled literal colours are not allowed. COSS — the Tailwind v4 + Base UI component set used by botharness.ai (`apps/docs`) — is scoped to the docs site and landing page: its tokens bridge to Nimbus (`--nb-*`), its dark selector (`[data-mode='dark']`) differs from DSH's, and the upstream client-plugin rule forbids adding a component library or Tailwind to an in-harness plugin. Brand expression inside the product is limited to a thin alias mapping (1–3 tokens), not a second design system.

## Considered Options

- **Adopt COSS components in-harness** — rejected: two design systems side by side, a dark-mode selector that does not match DSH's, and a bundle that inlines a UI kit the shell deliberately does not share.
- **Keep hand-rolled literal colours** — rejected: light-only, drifts from the shell, breaks dark theme.
- **DSH tokens + primitives** — chosen: consistent with the shell, themeable for free, no new runtime dependency (the baseline already provides it).

## Consequences

- `packages/client/src/client/styles.ts` maps onto `--dsw-*` only; controls are replaced with `ui-primitives` where the exported set fits, while the layout stays ours.
- UI acceptance runs in the `web-dev` profile in both themes.
- botharness.ai keeps COSS as its external brand surface; product and marketing may share accents through a small alias map, never a shared component library.

## Update (2026-09-19)

Icon-set gaps are filled by **vendoring external glyphs** as first-party components — Lucide (ISC), starting with hash and group chat, each with an attribution header, plus `packages/client/THIRD_PARTY_NOTICES.md` — not by adding a component library or a runtime icon dependency. The rule above stands unchanged for our own UI: DSH tokens and primitives, no second design system (ADR-0032).

## Update (2026-10-13)

ADR-0193 adds the DeepSeekBot design system on top of this record: StyleX tokens and components that resolve to `--dsw-*` and compose DSH primitives. It is a semantic layer over DSH, not a second design system, so the rule above stands.
