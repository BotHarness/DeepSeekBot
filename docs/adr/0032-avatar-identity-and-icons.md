---
Status: Superseded by ADR-0049
Date: 2026-09-19
---

# Default avatars are deterministic blobatars; missing glyphs are vendored, not cloned

A PersonaBot's default avatar is a static **blobatar** generated deterministically from the Host-owned PersonaBot ID — the string generator only this round, no motion or expressions. Channel rows follow the same identity: a DM Channel shows the bot's avatar; a group Channel shows a glyph. Custom avatars (presets, upload, crop) wait for a design pass in v1.1.

Where DSH's `ui-primitives` glyph catalog has no analogue — hash and group chat first, then users/move/sort/bot/image as needed — we vendor the needed **Lucide (ISC)** glyphs as first-party components: `{size, className}` props, `currentColor`, and an ISC attribution header. The hash glyph may be hand-drawn (four bars at the measured DSH geometry, ≈1.3px stroke at 16) if Lucide's stroke look is off. `packages/client/THIRD_PARTY_NOTICES.md` records blobatar (MIT), Lucide (ISC), and any later assets, and ships in the package `files`. This is the icon-gap exception to ADR-0028: our UI still uses DSH tokens and primitives only — no component library, no runtime icon dependency.

We deliberately do not copy the Grok Bot visual identity. `bloub` (the community SVG recreation of the x.ai avatar) is MIT for its code only — its README says the license "covers the code in this repository, not the design it imitates" — and it is Vue + Tailwind, so nothing is portable as-is; it is useful only as an approach reference (radial-profile morph, mask-hole eyes, pure `sample(t)` evaluation). The cited `x.ai/bot/guides/designing-grok-bot-with-grok-bot` was fact-checked: it is a workflow article about always-on design agents and contains no bot-identity or avatar design specification; the earlier citation was wrong and is corrected here. A licensing gap remains: the repo has no root `LICENSE` (MIT is only claimed on the docs landing), so a separate ticket adds it before any MIT code is copied.

## Considered Options

- **Custom avatar system now (presets/upload/crop)** — rejected: it needs design; the deterministic generator covers the roster today (v1.1 ticket).
- **Copy bloub or reproduce the Grok identity** — rejected: the license covers code only, and the design belongs to x.ai; provenance and license risk for no product gain.
- **Adopt an icon npm package (lucide-react, HugeIcons, …)** — rejected: a runtime icon dependency for a handful of glyphs; HugeIcons' 1.5/24 stroke also reads too thin at 16px (≈1.0px).
- **Hand-draw every missing glyph** — rejected: vendoring well-shaped ISC icons is less work and visually consistent; only the hash may need hand-drawing.
- **Solar's `hashtag-chat`** — rejected: CC BY 4.0 adds attribution and share-alike obligations where ISC suffices.

## Consequences

- blobatar stays a bundled dependency of `@botharness/client`; the client bundle contract remains react-family only.
- Glyphs live in a first-party module with per-file attribution headers; the bundle contract test is untouched.
- `THIRD_PARTY_NOTICES.md` ships in `files`; the root LICENSE ticket lands before any MIT code is copied.
- Motion and expressions (blobatar `motion.css` / `gaze.css`, 14 expression poses, hover/breathe/bob/blink/saccades/wrap/gaze) are deferred to a v1.1 ticket: stylesheet delivery conflicts with our bundle's CSS injection (`styles.ts`), unresolved, and Safari behavior is unverified.
- `GLOSSARY.md`'s Avatar entry is updated; `docs/research/2026-09-19-avatar-and-icon-references.md` holds the reference facts and license obligations.
