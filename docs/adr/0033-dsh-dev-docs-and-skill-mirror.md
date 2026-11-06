---
Status: Accepted; scope amended 2026-09-20
---

# DSH Dev Docs and the dsh-skill mirror

We publish the full-stack DSH plugin authoring guide — the `dsh-plugin-dev` skill — as **DSH Dev Docs**, a `/dsh` section of the BotHarness docs site, and distribute it through a standalone mirror repo, `BotHarness/dsh-skill`, so external developers install it with `npx skills add BotHarness/dsh-skill`. The monorepo stays canonical: `sync-docs` renders the section from the skill files, and a script machine-publishes the mirror (never hand-edited). Because the content is distilled from upstream research whose claims are pinned to one DSH revision and can be invalidated by upstream fixes, every published page and artifact carries a **Provenance** block — skill version, the DSH version and upstream SHA it was verified against, the verification date, and sources. The docs area is public; the underlying research (with its unverified and license-sensitive claims) stays in-repo.

## Considered Options

- **Subdomain `dsh.botharness.ai` instead of the `/dsh` subroute** — deferred: Nimbus builds canonical URLs and the sitemap from a single `site`, so a subdomain would need a second build or edge rewriting and would split SEO. The subdomain stays reserved as a later 301 if branding ever demands it.
- **Standalone repo as canonical instead of a mirror** — rejected for now: keeping the skill next to the research and our own plugin work means one PR updates skill + research + site; the standalone repo exists only for distribution and external issues. Promote it to canonical only if external contribution demand appears.
- **Publishing the research docs as-is** — rejected: the survey and installation research carry unverified, community-self-reported, and license-sensitive claims; only curated conclusions with sources ship, and the full research stays in the repo.
- **Automated upstream drift detection in v1** — deferred: provenance makes staleness visible, and re-verification is a manual step on DSH releases; a scheduled check can come later.
- **npm package distribution** — rejected: the `skills` CLI installs directly from GitHub, so npm would add a publishing step for no reach.

## Consequences

- Re-verifying `dsh-plugin-dev` is part of adopting a new DSH release; `verifiedAgainst` (DSH version + upstream SHA) is the pin, `verifiedAt` the date, `skillVersion` moves independently.
- The mirror repo is generated output: its README and provenance block come from the synced skill, edits happen only in this monorepo, and its issue template routes reports back here.
- `sync-docs` gains a skill-driven page source for the `dsh/` section; `/zh` gets a hand-written landing while skill-derived pages are marked `untranslated` until reviewed.
- Evidence: `docs/research/2026-09-19-dsh-plugin-authoring-{host,client}.md`, `docs/research/2026-09-19-dsh-community-plugins-survey.md`, `GLOSSARY.md` («Developer docs and distribution»).

## Update (2026-09-20) — stable-core scope

The publication and mirror architecture remains accepted, but the published artifact no longer presents a full-stack Host/Client/Slots guide. The installable `dsh-plugin-dev` skill and `/dsh` documentation now contain only the stable DSH/Cordis Context, concept maps, and architectural Decision Tree; version-sensitive API catalogs and community implementation surveys remain repository research. `dsh-plugin-dev` is the installed skill identity, while `BotHarness/dsh-skill` is its distribution repository.

These names describe documentation maintenance and distribution rather than BotHarness product objects, so they no longer appear in the BotHarness Product Context. Their current operational definitions live in the DSH docs landing page, repository instructions, and skill metadata.
