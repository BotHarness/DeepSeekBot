# Docs site maintenance contracts

The docs site combines authored Astro and TypeScript with content generated from repository sources. Code stays comment-free under the [source policy](source-policy.md); Markdown and MDX remain the place for operational and design explanations.

## Content and routes

- `scripts/sync-docs.mjs` builds the English and Chinese content trees, changelog pages, DSH pages, and development reference. Edit their repository sources rather than generated `apps/docs/src/content/**` files. `apps/docs/src/components.ts` registers the MDX components available without local imports.
- English pages live at the root and Chinese counterparts under `/zh/**`. `apps/docs/src/lib/language.ts` owns locale labels, canonical counterpart URLs, and `hreflang` alternates. The `/docs` and `/dev` rails stay scoped to their own sections. Route flags such as `sidebar: false` suppress both the rail and its mobile trigger.
- Clean `/<slug>.md` and `/zh/<slug>.md` siblings expose page content to agents; the older `/index.md` routes remain compatible. The root and Chinese 404 pages are static, while the language-specific page selection happens in the client. OG cards are generated at build time, including Chinese text through the committed Noto Sans SC subset.
- Shared Button and LinkButton variants live in `apps/docs/src/components/ui/button/variants.ts`. A new MDX primitive belongs in `apps/docs/src/components.ts` after its component contract is defined.

## Navigation and client state

- Live docs routes use the Nimbus/Astro sidebar in `apps/docs/src/layouts/DocsLayout.astro` and `apps/docs/src/components/ui/sidebar/`. The desktop tree keeps open groups and scroll position in `sessionStorage`; active links open their ancestor groups. The filter sits above that tree and `/` focuses it. The narrow-screen drawer is a native `<dialog>` with focus, Escape, backdrop, and scroll-lock behavior. Its trigger survives Astro navigation; an open drawer closes before a swapped route can strand focus.
- The landing page keeps only its used COSS primitives: Badge, Button, Card, Frame, Group, Separator, and Button's Spinner dependency. Add other primitives from the COSS registry when a page needs them; the docs sidebar remains the Nimbus/Astro implementation above.
- The theme preference uses `ui-mode` in `localStorage`; `BaseLayout.astro` applies it before paint, while the toggle handles user actions. Package-manager tabs use `ui-pm-tab` in `sessionStorage` and restore before paint. Search, TOC, tabs, collapsibles, and dialogs use their `*.client.ts` controllers; controllers must clean up listeners and observers when Astro swaps a page. Search remains scoped to the page locale and section.

## Styling and diagrams

- `apps/docs/src/styles/globals.css` defines Nimbus `--nb-*` tokens, maps them into Tailwind utilities, then provides COSS semantic aliases that point back to Nimbus values. Keep this docs-site COSS system separate from the in-harness DSH token choice in [ADR-0028](../decisions/desktop-ui.md#adr-0028).
- `prose.css` styles classless Markdown content while leaving component-owned markup alone. Wide tables scroll inside `.nb-table-scroll`; Shiki blocks, focus states, and mobile navigation take their tokens from `globals.css`. `mermaid.css` reserves compact space before rendering, and `apps/docs/src/scripts/mermaid.ts` loads the large Mermaid bundle only when needed.
- After changing authored docs-site code, run `corepack pnpm --filter docs typecheck` and `corepack pnpm --filter docs build`. Exercise a long docs page on desktop and a narrow viewport: open and close the rail, use its filter and route links, toggle the drawer by pointer and keyboard, and repeat in light and dark themes.

## Agent workflow

- Docs site: Nimbus in `apps/docs` — content is generated from repo sources by `scripts/sync-docs.mjs` (never edit generated files); sections are `/docs` (user guides), `/dsh` (stable DSH/Cordis Context + Decision Tree, generated from `dsh-plugin-dev`) and `/dev` (BotHarness Design / verified Guides / code-generated Reference / ADR). Design is normative target state; Reference is current implementation fact. English is primary at the root; maintained Chinese counterparts live under `/zh/**`. Every docs page exposes a clean `.md` sibling; the legacy `/index.md` form remains compatible. The landing page uses **coss ui** (`src/components/coss/`, brand tokens in `design/tokens.css`); docs pages use Nimbus UI.
- Diagrams: edit `docs/architecture/diagrams/*.mmd` and its English counterpart in `diagrams/en/*.mmd`, run `pnpm diagrams`, and commit the rendered light/dark SVGs (`rendered/*.svg` and `rendered/en/*.svg`); the architecture page embeds those committed SVGs via the `<Diagram>` component, while the runtime mermaid loader remains for ad-hoc `mermaid` fences in hand-authored content.
- OG cards: `apps/docs/src/pages/og/**` renders at build time with CanvasKit; Chinese titles use the committed Noto Sans SC subset. After editing Chinese page copy, run `pnpm og:font` (needs network) to regenerate `apps/docs/public/fonts/NotoSansSC-Bold.og-subset.otf`.
- Local docs dev: `pnpm dev` (portless from `apps/docs` → https://docs.botharness.localhost; no-sudo variant `PORTLESS_PORT=8788 PORTLESS_HTTPS=0`) or `pnpm docs:dev` (http://localhost:4321); `syncDocs()` runs at Astro config load, so plain `astro dev`/`astro build` also works.
