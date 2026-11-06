# This Nimbus docs site

> `CLAUDE.md` delegates here. Keep project instructions canonical in this file.

Astro-based docs. The `nimbus-docs` package handles content schemas, sidebar/TOC, MDX→markdown, build hooks, and the `nimbus` CLI. Everything in `src/` is yours to edit.

## File layout

```
astro.config.ts              # imports nimbus + defineNimbusConfig
nimbus.json                  # records the last reviewed Nimbus package version
src/
├── components.ts            # MDX globals registry — every component used in .mdx must be listed
├── components/              # AgentDirective, Header, Render + ui/<slug>/
├── content/
│   ├── docs/*.mdx
│   └── partials/*.mdx       # referenced via <Render file="..." />
├── content.config.ts        # registers docsCollection() + partialsCollection()
├── layouts/                 # BaseLayout (NimbusHead), DocsLayout (sidebar/TOC/breadcrumbs)
├── lib/cn.ts                # Tailwind className merger
├── pages/
│   ├── [...slug].astro
│   ├── [...slug].md.ts         # canonical per-page markdown sibling
│   ├── [...slug]/index.md.ts   # compatibility markdown alternate
│   ├── llms.txt.ts
│   ├── og.png.ts                # site-level OG card
│   ├── og/
│   │   ├── _og-card-config.ts   # shared OG theme tokens (underscore = not a route)
│   │   └── [...slug].ts         # per-page OG cards
│   └── robots.txt.ts
└── styles/                  # globals.css, prose.css
```

Cloudflare deploys also have `wrangler.jsonc` at the project root.

## Writing docs

Frontmatter validates against `docsSchema` (`nimbus-docs/schemas`). Required: `title`.

```mdx
---
title: My page
description: One-line summary.
---

Content here. The page H1 comes from `title` — don't repeat it in the body.

## Section heading
```

Rules:

- **Components must be PascalCase and registered in `src/components.ts`.** A pre-build validator catches typos with a "did you mean" hint.
- **Partials use `<Render file="..." />`.** Don't import `.mdx` directly. Shared content lives in `src/content/partials/<slug>.mdx`.
- **Icons** use the Nimbus `Icon` component (`@cloudflare/nimbus-docs/components/Icon.astro`): HugeIcons for section/nav glyphs — `<Icon name="hugeicons:book-02" class="w-4 h-4" />` — and Phosphor (`ph:<glyph>`) where a HugeIcon doesn't fit (e.g. `ph:rss`, `ph:github-logo`). Glyph sets: [hugeicons.com](https://hugeicons.com) · [phosphoricons.com](https://phosphoricons.com).
- **Don't remove `<AgentDirective />` from `BaseLayout.astro`.** It points agents at `/llms.txt`.

## Landing page (coss)

`src/pages/index.astro` is the brand surface: it imports root `design/tokens.css` and renders `src/components/landing/Landing.tsx` over **coss ui**, not the Nimbus registry. COSS stays on the landing; docs pages are Nimbus UI and in-harness UI is DSH tokens/primitives (ADR-0028, root `AGENTS.md`).

- Add or update a component through the `@coss` registry in `components.json`: `pnpm dlx shadcn@latest add @coss/<name>` — preview with `--dry-run` / `--diff` first. Components land in `src/components/coss/`.
- Use the installed `coss` and `coss-particles` skills for composition and usage rules; coss.com/ui is the source of truth for a component's API.
- Icons: coss components bring their own `lucide-react` glyphs; the landing's own iconography uses HugeIcons through `@iconify/react` (`Landing.tsx` is the precedent).

## Sections

One build serves both domains (`botharness.ai` and `botharness.dev`):

| Section | Content |
|---|---|
| `/docs` | User guides (`overview`, `quickstart`) |
| `/dsh` | DSH plugin development (generated from `.agents/skills/dsh-plugin-dev/` + `docs/dsh/`) |
| `/dev` | BotHarness Design / Guides / generated Reference / ADR (generated from repo sources) |
| `/development` | Bilingual four-state Development status for DeepSeekBot and DSH Skill |
| `/changelog` | Bilingual release feed + `/changelog/<slug>` + `/zh/changelog/<slug>` permalinks |

## Bilingual layout

English is primary at the root; Chinese mounts at `/zh/**` via the `docs-zh`
collection + Nimbus `versions.others` (`astro.config.ts`). Generated `/dev`
pages are written into both trees: the English tree (`docs/dev`) carries the
Chinese source flagged `untranslated: true`, which the root route renders with
`This page has not been translated yet.`; the Chinese tree (`docs-zh/dev`) is
clean. Architecture pages are the exception — the maintained English source
`docs/architecture/botharness-architecture.en.md` goes to the English tree and
the Chinese source to the `/zh` tree (no banner on either). English-only pages
with no Chinese counterpart (rare) are flagged in `docs-zh`, and the `/zh`
route shows `本页暂未提供中文。` Site-owned translations live in
`src/content/docs/docs/` (English) and `src/content/docs-zh/docs/` (Chinese).
`src/lib/language.ts` owns the switcher mapping (`/docs/x` ↔ `/zh/docs/x`,
fallback `/zh/docs/overview`) and `Header.astro` renders it. Edit the repo
sources — never generated files.

Changelog entries come from the canonical bilingual Release Ledger:
`CHANGELOG.md` is the English authority and `CHANGELOG.zh.md` its maintained
counterpart. `scripts/sync-docs.mjs` validates their structural parity,
excludes `Unreleased`, and writes each dated SemVer section into its own tree
(`changelog` → `/changelog/**`, `changelog-zh` → `/zh/changelog/**`). The
one-time `Development` section becomes an explicitly non-versioned history
summary. Edit the ledgers, never generated changelog content.

Development status is a separate projection: `In progress` comes from
`src/data/development-status.json`, while the two canonical Release Ledgers
supply merged, pre-release, and released facts. Edit those authorities rather
than page copy; `src/lib/development-status.ts` assembles both human and agent
routes.

## Diagrams

`.mmd` sources live in `docs/architecture/diagrams/` at the repo root, with
English variants in `diagrams/en/`. `pnpm diagrams` (root) re-renders the
committed light/dark `rendered/*.svg` (English under `rendered/en/`) and syncs
them to `public/diagrams/` (`public/diagrams/en/`); the architecture page
embeds those via the `Diagram` component (light/dark `<img>` + lightbox),
passing `lang="en"` on the English page. The runtime mermaid loader remains
only for ad-hoc `mermaid` fences in hand-authored pages.

## Generated directories — don't edit

- `src/content/docs/dev/**` — English tree: living architecture, BotHarness Product Context,
  Guides, generated Reference, and ADR, from maintained repository sources (`GLOSSARY.md` is
  paired with `GLOSSARY.zh.md` for the Chinese tree)
- `src/content/docs-zh/dev/**` — Chinese tree at `/zh`: the same sources,
  clean, plus the Chinese architecture page
- `src/content/docs/dsh/**` — DSH Dev Docs: the landing from `docs/dsh/index.md`
  and the skill pages from `.agents/skills/dsh-plugin-dev/`, each carrying the
  skill's provenance fields
- `src/content/docs-zh/dsh/**` — Chinese tree: the hand-written landing
  (`docs/dsh/index.zh.md`); skill pages are English flagged `untranslated`
- `src/content/changelog/**` — English release tree generated from root `CHANGELOG.md`
- `src/content/changelog-zh/**` — Chinese release tree generated from root `CHANGELOG.zh.md`
- `public/diagrams/**` — from `docs/architecture/diagrams/rendered/`

`scripts/sync-docs.mjs` rebuilds all of them on every `syncDocs()` call.
`scripts/docs-reference.mjs` parses the current core Config, `defineTool`
registrations, and literal Cordis event calls for `/dev/reference/**`; it
fails on dynamic names or unsupported shapes instead of publishing a stale
catalog.

## Adding things

| Goal | Action |
|---|---|
| New doc page | Create `src/content/docs/<slug>.mdx`. Sidebar picks it up. |
| New partial | Create `src/content/partials/<slug>.mdx`. Use via `<Render file="<slug>" />`. |
| UI from registry | `pnpm exec nimbus-docs add <slug>`. Register in `src/components.ts` if used in MDX. |
| Feature recipe | `pnpm exec nimbus-docs add <feature-slug>`. Pipe the printed brief to your agent. |
| Check it builds | `pnpm exec nimbus-docs check` — build-free preflight (env + structure + authoring + types). `--json` for an agent loop, `--fix` to repair what's safe. |
| Custom page route | Add a file under `src/pages/`. |
| Custom OG style | Edit `src/pages/og/_og-card-config.ts`. |
| OG CJK font | Chinese titles need the committed Noto Sans SC subset (`public/fonts/NotoSansSC-Bold.og-subset.otf`). After editing Chinese page copy, run `pnpm og:font` from the repo root to regenerate it. |
| Check for updates | `pnpm exec nimbus-docs outdated` — starter files behind their tag + registry components behind. |
| Upgrade Nimbus | Update the package, then run `pnpm exec nimbus-docs migrate --dry-run --diff`. Review every change and required manual step before applying. |
| Upgrade a starter file | `pnpm exec nimbus-docs diff <file>` to review, `diff --apply <file>` to pull a clean upstream change. |
| Upgrade a registry component | `pnpm exec nimbus-docs add <slug> --overwrite`, then review with `git diff`. |

Extend Sätteri using `markdown.mdastPlugins` for Markdown AST transformations or `markdown.hastPlugins` for HTML AST transformations.
If the site replaces Sätteri with another processor, set `admonitions: false` and keep that processor's existing callout implementation.

List installable items: `pnpm exec nimbus-docs list`.

## Upgrading Nimbus

Keep `nimbus.json` committed. Its `lastReviewedNimbusVersion` is the baseline Nimbus uses to select the versioned reviews crossed by a package upgrade; state-detected migrations come from the current project files. It is not a package pin and should not be edited by hand.

1. Update `@cloudflare/nimbus-docs` with the project's package manager.
2. Preview the complete plan with `pnpm exec nimbus-docs migrate --dry-run --diff`. If no baseline exists yet, add `--from <previous-version>`.
3. Review every versioned entry and resolve each blocked/manual item.
4. Apply safe edits only with explicit consent: `pnpm exec nimbus-docs migrate --yes`. Review the resulting diff, then rerun the preview.
5. When no migration remains, run `pnpm exec nimbus-docs migrate --yes` again to record the completed review in `nimbus.json`.
6. Run the project's typecheck and production build, then run `pnpm exec nimbus-docs check` again for post-build coverage.

Except for task-printing mode (`--print`), `migrate` exits nonzero while work or review remains; that is a pending-upgrade signal, not necessarily a command failure. Never skip versions by changing `nimbus.json` directly.

## Audit this site

Start with `pnpm exec nimbus-docs check --json`. It runs the environment, structural, authoring, and type checks build-free — config validity, `site` placeholder, route collisions, MDX component resolution, the lint rules, and a `tsc` type-check — and returns three top-level signals plus per-scope detail:

- **`status`** (`passed` | `failed` | `partial`) and **`readiness`** (`buildable` | `blocked` | `unknown`) are the primary signals. `status` is the whole-run verdict; `readiness` answers "does env + structure say it builds?". `ok` (=== zero errors) is kept for back-compat only.
- **`findings[{scope,code,severity,file,line,message,fixable,fix}]`** are problems we evaluated. Apply each `fix` (or `check --fix`).
- **`scopes[].notes[{code,reason,requiresBuild?,requiresInput?}]`** are checks we *couldn't* evaluate yet (e.g. types before a build). A note is never a finding and never carries a `fix` — you resolve it by making the missing thing exist (usually a build), not by `--fix`. `summary.notes` counts them.

Loop terminates on `status !== "failed" && summary.fixable === 0` — a `partial` run with nothing left to fix is a **stop** (optionally build, then re-check), not a `--fix` retry. Exit is `1` only when `status` is `"failed"`. For full coverage (types + link-checking) run a build first, then `check` again.

Then walk the categories below for what `check` doesn't cover yet — route-file existence, registry hygiene, the AI surface, post-build search, and Cloudflare config. Emit findings as:

```
- [error|warn|info] FILE:LINE — what + why + fix.
```

End with `Summary: N errors, N warnings.`

- **Config** — `astro.config.ts` calls `nimbus(defineNimbusConfig({ ... }))`; `site` is set; `editPattern` (if set) contains `{path}`; `output:` matches the deploy target.
- **Content** — `content.config.ts` registers `docsCollection()` (and `partialsCollection()` if used); every `.mdx` is inside a registered collection; frontmatter validates.
- **Sidebar** — every sidebar ref resolves to a content entry; no orphans; no slug collisions.
- **MDX** — every PascalCase component in `*.mdx` is registered; every `<Render file=...>` resolves; code-fence languages are valid.
- **Routes** — `llms.txt.ts`, `robots.txt.ts`, `[...slug].md.ts`, the compatibility `[...slug]/index.md.ts`, `og.png.ts`, and `og/[...slug].ts` all exist.
- **Registry hygiene** — every `src/components/ui/<slug>/` is either MDX-registered or imported in `src/`; transitive deps (`lib/cn.ts`, etc.) exist.
- **AI surface** — `<AgentDirective />` renders in `BaseLayout.astro`; doc `<head>` has `<link rel="alternate" type="text/markdown" ...>`.
- **Search** — `data-pagefind-body` is on the docs main wrapper; after `pnpm build`, `dist/pagefind/` exists with ≥1 indexed page.
- **Cloudflare** (if applicable) — `wrangler.jsonc` has `name`, `compatibility_date`, `assets.directory = "./dist"`, `not_found_handling`.

## Don't

- Hand-add components under `src/components/ui/` that exists in the nimbus-docs registry — use `nimbus-docs add` so deps resolve.
- Import `.mdx` files directly — use `<Render file="..." />`.
- Remove `<AgentDirective />` unless asked.
- Edit `src/components.ts` to bypass registration — if a component is used in `.mdx`, register it.

## Project home

[nimbus-docs.com](https://nimbus-docs.com)
