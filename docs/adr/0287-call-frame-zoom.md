# ADR-0287: A Bot zooms into a call grid cell with call_frame

- Status: Accepted (VC4)
- Date: 2026-11-04
- Issue: #3493 (spec #3490, hub #3491; builds on ADR-0286)

## Context

A grid tile is at most 768 px wide in a 2x2 and 384 px in a 4x4, so small text on a shared screen can be unreadable in the grid that reaches the Bot. The Host already holds each keyframe as the client sent it while it waits for the end of the sentence.

## Decision

**Originals stay in memory for the call.** When a grid is sent, the call owner keeps the original keyframes of its tiles, keyed by the Human message that carries the grid, in tile order. At most 64 originals are kept per Host; the oldest grids are released first. Ending the call releases that call's originals. The owner writes none of them to disk; a cell the Bot zooms into is stored like any other image the model has looked at.

**`call_frame` returns one original.** The Bot tool takes `message_id` and `cell` (the number printed on the tile; a single-frame view is cell 1) and an optional `channel_id`. The runtime checks that the Bot can read the Channel and that the message carries a grid, and the owner checks that the grid belongs to a call with this Bot. The original comes back as an image for the model. A grid whose originals are gone returns `released: true` with a note to answer from the grid, not an error. A cell outside the grid is refused with the valid range. The editable `voice-call-visual-hint` tells the Bot to use it when a tile is too small to read.

**CLI parity.** `deepseekbot call-frame <message-id> <cell> [--out /abs.jpg]` sends a `zoom` command on `/api/voice/call` and prints the same fields as the tool (`released`, `cell`, `cells`, `source`, `width`, `height`, `bytes`), writing the JPEG to `--out` when given. Each zoom records a `frame-zoomed` event (message, cell, time) on a running call.

## Consequences

Zooming costs one more model step and up to 512 KB of image input, so the Bot uses it only when needed. Keeping 64 originals costs at most about 32 MB of Host memory. Saved grids follow attachment retention while originals never outlive the call; VC5 (#3494) adds the switch that stops saving grids.
