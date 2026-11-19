# Design references

Use these precedents for composition. Bot mode uses shared Tobs components and tokens within the measured shell contract. See the [Desktop/Web decision](../../../../docs/decisions/desktop-ui.md#adr-0028).

## What to borrow, what stays out

| Source | Borrow | Leave |
| --- | --- | --- |
| [coss.com/ui](https://coss.com/ui) · [get started](https://coss.com/ui/docs/get-started) | Anatomy, interaction states, and composition for generic controls — dialog, menu, accordion, forms, toolbars. The installed `coss` and `coss-particles` skills index the same set locally. | Its components, Tailwind classes, tokens, and dark selector. COSS is the docs-site brand surface; `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md` maps the token differences. |
| [beautifului.dev](https://www.beautifului.dev/) | Agent-facing surfaces — conversation, tool calls, diff/code blocks, compact data views. Its visual grammar (single gutter, accent bars, tints, word-level highlight, wrap over horizontal scroll) translates directly into tokens. | Its files as dependencies: MIT copy-paste source, no registry. Diff compute stays with `DiffBlock`/jsdiff; distilled grammar in `docs/research/2026-09-21-workbench-plugin-and-beautifului-memory-ui.md` §6. |
| [shadcn/ui](https://ui.shadcn.com/) | Vocabulary and state conventions for common controls — variants, sizes, disabled/loading/empty, focus behavior — when naming a control or shaping its API. | Adding it in-harness; it is not part of the shell baseline. The docs landing consumes COSS through the same registry schema (`apps/docs/components.json`) — that path stays on the docs site. |
| [Lucide](https://lucide.dev/) | Single glyphs the exported `Icon*Outline16` set lacks, matched to its 2/24 stroke geometry. | The package at runtime or the set wholesale. Vendor one glyph as first-party source with its ISC header and a `packages/client/THIRD_PARTY_NOTICES.md` entry (`packages/client/src/client/hash-icon.tsx` is the precedent; ADR-0032). |

## The composition bar

- **Task first** — the surface's job and its one primary action decide the layout; choose components after.
- **Shell scale** — chat-scale density, not a marketing page: no hero blocks, display type, or decorative card grids.
- **Full states** — hover, focus-visible, disabled, loading, and empty ship with every interactive element.

## Reading a reference

1. Name the precedent and what it contributes: composition, hierarchy, or states — not styling.
2. Express it with `--dsw-*` tokens, the exported primitives, and the native inset contract; pass light and dark.
3. The shell's existing pattern wins where one exists; a reference fills only the gaps.
4. In the PR, name the borrowed pattern and each deliberate deviation.
