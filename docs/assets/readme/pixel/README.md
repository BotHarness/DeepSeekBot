# README artwork

The artwork uses the approved DeepSeekBot website palette and pixel-town composition.
The README keeps product descriptions, headings, installation, release highlights and community
links as Markdown/HTML text. Images decorate that text; they are not its only copy.

## Rebuild

```sh
node scripts/render-readme-art.mjs
```

Node built-ins only; no website checkout, network, font installation or image service is needed.
`scripts/readme-art.mjs` is the source for the SVG composition, palettes and labels. The committed
SVGs support GitHub's light/dark `<picture>` sources and scale to the available width.

Source geometry in `source/`:

- `glyphs.json`: unmodified glyph outlines and advances extracted with fontkit 2.0.4 from
  `@fontsource/fusion-pixel-12px-proportional-sc` 5.3.0, using
  `files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2`. The file includes the Chinese
  characters used in these labels. ASCII is included for changing counts, timestamps and versions.
  See `Fusion-Pixel-OFL.txt`. To add a missing character, extract its `glyphForCodePoint()` path via
  `glyph.path.toSVG()` and `glyph.advanceWidth` using the same font, retaining `unitsPerEm`.
- `avatars.json`: SVGs from `pixelAvatarSvg(AVATAR_PRESETS[index])`, indices 2, 9, 7, 10 and 4,
  in `@botharness/pixel-avatar` 0.10.2 ([BotPixel](https://github.com/BotHarness/BotPixel)).
  See `BotPixel-MIT.txt`.

## Repository status

```sh
# Fetch the full default-branch history first. GH_TOKEN is optional for local reads.
node scripts/readme-status.mjs collect output/readme-status
# Maintainer/Actions only; GH_TOKEN needs contents:write for this repository.
node scripts/readme-status.mjs publish output/readme-status
```

The collector obtains repository totals, issue/PR search counts, latest stable release, and
all commits reachable from `origin/<default branch>` in a shared 30-day UTC window. It rejects
shallow history, incomplete API search results and invalid data. Search totals work above the
1,000-item result retrieval limit because no item pagination is needed. PR counts describe the
current closed state and `closed_at`, so reopening a PR can change the count. GitHub search is
eventually consistent; commit dates are committer dates, including merges and bots.

The workflow runs at minute 17 every six hours (UTC), or manually, and on relevant main pushes.
PRs collect/render with read permission only. A separate publishing job on main writes the seven
allowlisted generated files to the orphan `readme-status` branch, preserving its prior commits.
It refuses other destinations or unexpected branch contents, and updates the branch ref without
force. API failures or concurrent writes leave the last successfully published snapshot intact.
README prose, installation and release highlights are never rewritten by this task.

The card timestamp, the branch's bilingual Markdown table and `stats.json` provide the same
snapshot. GitHub's schedule and image cache can delay updates; the timestamp makes staleness
visible. Disable the workflow to stop updates. Reverting this PR restores the previous README;
the status branch can remain without affecting the product.
