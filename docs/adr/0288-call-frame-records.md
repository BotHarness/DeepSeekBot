# ADR-0288: Silent stretches become frame records, and frame saving can be turned off

- Status: Accepted (VC5)
- Date: 2026-11-04
- Issue: #3494 (spec #3490, hub #3491; builds on ADR-0286 and ADR-0287)

> Amended by [ADR-0303](0303-call-grids-tile-balanced-rows.md): a frame record holds nine keyframes in a 3+3+3 grid.

## Context

A grid is built only when the Human finishes a sentence, so a long silent stretch, such as watching a film together, would pile up keyframes that the next sentence must squeeze into one 4x4 grid. Some Humans also do not want what they share to stay in the DM.

## Decision

**Frame records.** While the Human is not speaking and saving is on, every 16 pending keyframes become one 4x4 grid that the call owner hands to `recordFrames`. The Host stores it as a system message with the grid as an attachment and a `voiceCallRecord` of state `frames` (source, frame count, layout, and `fromMs`/`toMs` from the call start). A system message does not start a Bot turn. The keyframes in a record leave the pending set, and their originals stay available to `call_frame` like any grid's. A `frame-record` event reports each one with its compose time.

**The next sentence lists them.** The Human's next call message records `voiceCall.visual.records`, the ids of the records since their last message (at most 50). The call-view note tells the Bot that they came first, oldest first, and that it can open them with `channel_read_image`. When no keyframe is left after the records, the sentence says `sameAs` the newest record.

**Don't save frames.** The `visual` command takes `save: false`. Then no records are made, the grid is not uploaded, and the message records `visual.unsaved: true`. The owner keeps the whole grid in memory with the tile originals, and `call_frame` cell 0 returns it during the call, so the Bot still sees what the Human shares while nothing reaches the DM. `call-simulate --no-save` drives the same switch.

**Clients.** Desktop and the phone show a frame record as a call notice ("Screen while you were silent · 0:12–0:40 · 16 keyframes") with a camera or screen icon.

## Consequences

An unsaved grid reaches the Bot through `call_frame` rather than as an inline image in the turn, which costs one tool step. An image the Bot reads with `call_frame` is stored as that tool result's image, like any image a model reads, and follows session retention; nothing is added to the DM. Records are ordinary attachments and follow attachment retention. A record carries no thumbnail in the notice yet; the Bot reads the image, and the Human sees the time range.
