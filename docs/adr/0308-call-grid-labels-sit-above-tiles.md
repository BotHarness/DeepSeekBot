# ADR-0308: Call grid labels sit in a strip above each tile

- Status: Accepted
- Date: 2026-11-09
- Issue: #3822 (spec #3490, hub #3491; amends the labels of ADR-0286 and the tile sizes of ADR-0303)

## Context

ADR-0286 labels each grid tile with its number and the seconds before the sentence ended, drawn as a black box with a bitmap font over the tile's top-left corner. On a 3-column grid the box is about 153×33 px of a 512×288 px tile. It hides what usually matters most in that corner: the first lines of a code screen, a window title, the start of a page heading. The Bot then needs a `call_frame` zoom to read text it could otherwise read from the grid.

## Decision

**A label strip per row.** `compose` reserves a black strip of `11 × scale` px (the label's own height; 33 px for 512 px tiles) above every tile row and draws each label inside it, aligned with its tile's left edge. Tiles are drawn below the strip, and no picture pixel is covered. Cell numbering, the balanced rows and the centred shorter row of ADR-0303 do not change.

**Still at most 1536 px.** Landscape tiles keep their width (512 px from three keyframes, 768 px for two), so the grid only grows taller: a 3+3+3 grid of 16:9 screens goes from 864 to 963 px. When the strips would push a grid past the 1536 px long edge, as with three rows of portrait screens, the tiles shrink to fit (275×490 px instead of 288×512 px, with a 22 px strip).

A single keyframe is still sent alone and unlabelled, and `call_frame` still returns the original keyframe.

## Consequences

The Bot sees the whole picture of every tile, and labels never sit on bright content. A landscape row grows about 11–13% taller, and a portrait grid of three rows gets about 5% narrower tiles. Grids saved before this change keep their overlaid labels.
