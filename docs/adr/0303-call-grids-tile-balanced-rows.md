# ADR-0303: Call grids tile balanced rows of at most three

- Status: Accepted (T1)
- Date: 2026-11-07
- Issue: #3689 (spec #3688; amends ADR-0286 and ADR-0288)

## Context

ADR-0286 tiled a sentence's keyframes into a square 2x2, 3x3 or 4x4 grid. Three keyframes left a black cell in a 2x2, five left four black cells in a 3x3, and a 4x4 shrank each tile to 384 px, so small text on a shared screen was often unreadable on the Bot's side and on a phone.

## Decision

**Balanced rows.** One to nine keyframes go in ⌈n/3⌉ rows whose sizes differ by at most one, the longer rows first: 1, 2 and 3 in one row, 4 = 2+2, 5 = 3+2, 6 = 3+3, 7 = 3+2+2, 8 = 3+3+2, 9 = 3+3+3. A shorter row is centred on the widest one, so no cell is an empty placeholder. One keyframe keeps the single-image path at up to 1536 px; two tile at half that width; from three on every tile is as wide as one of three columns (512 px for a landscape grid at the 1536 px long edge). Cells are numbered 1 to n row by row from the top left, the same number `call_frame` and `deepseekbot call-frame` take.

**At most nine.** `MAX_GRID_FRAMES` drops from 16 to 9. Until the harvest slice of spec #3688 sends the overflow as its own records, a sentence with more than nine keyframes keeps the first and the eight biggest changes, and `grid-built` reports the rest as `dropped`. Silent frame records (ADR-0288) now hold nine keyframes, a 3+3+3 grid.

**Layout names the rows.** `layout` in `voiceCall.visual`, frame records and the `grid-built`, `grid-sent` and `frame-record` events is the tiles per row joined by `+` (`'1'`, `'3+2'`, `'3+3+2'`). Validators accept only the layout that matches the frame count; the old square names are refused. Migration 132 rewrites them in local databases by frame count and drops `voiceCall.visual` from sentences whose old grid had more than nine keyframes, keeping the message and its image.

## Consequences

Tiles never get smaller than a third of the long edge, so a 4x4 grid's 384 px tiles are gone. A busy sentence loses keyframes over nine until the harvest slice lands, and the loss is visible in `grid-built.dropped`. Old frame records of 16 keyframes have no valid layout; the migration leaves them as they are, so they read as messages this version cannot show. They exist only in development databases.
