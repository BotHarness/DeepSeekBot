# ADR-0286: Video and screen-share calls send keyframe grids, not video

- Status: Accepted (Host path, VC1)
- Date: 2026-11-04
- Issue: #3492 (spec #3490, hub #3491; builds on ADR-0281)

> Amended by [ADR-0303](0303-call-grids-tile-balanced-rows.md): grids tile one to nine keyframes in balanced rows of at most three (`layout` such as `3+2`), not square 2x2, 3x3 or 4x4 grids.

## Context

The Human wants a Bot call to include their camera or their screen. Real-time video is heavy to carry and the model does not read video frame by frame, while separate images lose their order. The grilled design (spec #3490) sends, with each spoken sentence, one image tiled from the keyframes of that sentence, and keeps the work as simple and fast as possible: no new model dependency and no step that adds delay unless measurements show the simple path is not good enough.

## Decision

**No video track.** A call stays one Opus audio section. A client turns sharing on with `{kind: 'visual', source: 'camera' | 'screen' | 'off'}` and sends each keyframe as a base64 JPEG in `{kind: 'frame', source, jpeg, score, skipped}` on the existing `POST /api/voice/call` route, over the LAN Noise channel or the Tailscale device gateway. Keyframes are sparse (at most a few per second), so a command per keyframe is enough, and the phones' and the media helper's audio-only offers do not change. A keyframe is at most 512 KB; the command limit grows to 768 KB. One source is shared at a time; switching drops the pending keyframes.

**Keyframes are picked on the client.** `keyframes.ts` holds the picker every client and `call-simulate` share: the caller samples at 2 fps, shrinks each sample to a small grayscale thumbnail and compares it with the last keyframe. A change above the source's threshold is sent once the picture holds still (screen: 400 ms, so a scroll is not caught mid-motion) or after a maximum wait (a playing video). The first sample after a switch is always sent. Thresholds are starting values that VC8 (#3499) tunes against end-to-end cases.

**The Host tiles a grid per sentence.** When a keyframe arrives the call owner decodes it once and keeps a 768 px copy (`call-frames.ts`, sharp, at most 32 pending keyframes). When the VAD ends a sentence the owner takes that sentence's keyframes and composes the grid while speech recognition runs: one keyframe is sent alone at up to 1536 px; 2–4, 5–9 and 10–16 keyframes tile into 2x2, 3x3 and 4x4 at most 1536 px, oldest first from the top left with empty rows left out, each tile labelled with its number and the seconds before the sentence ended (a built-in bitmap font, so labels do not depend on Host fonts). More than 16 keyframes keep the first one and the 15 biggest changes. A sentence that is not sent (nothing heard, recognition or send failure) gives its keyframes to the next sentence.

**The grid is an ordinary attachment.** The owner uploads the JPEG to the attachment store and sends it with the Human's message; `voiceCall.visual` records `{source, frames, layout}`. A sentence without new keyframes carries no image and records `{source, sameAs}` naming the message whose grid is still current. The turn adds a call-view note that gives the `channel_read_image` arguments, and the editable `voice-call-visual-hint` prompt part explains how to read a grid. Grids therefore stay in the DM and the Bot can look back at earlier ones with `channel_read` and `channel_read_image`. Raw keyframes stay in memory and are dropped when the call ends.

**Measured, not guessed.** Events `visual`, `frame-received` (bytes, size, score, prepare time, skipped samples), `grid-built` (frames, dropped, layout, bytes, compose time), `grid-sent` (how long the message waited for the grid after recognition), `grid-unchanged` and `grid-failed` give each stage's cost. `deepseekbot call-simulate --video|--screen <video file or JPEG folder>` samples the file with ffmpeg, runs the same picker and sends the keyframes on the audio timeline, then reports the picker, upload and grid timings.

## Consequences

The Bot sees the grid with one `channel_read_image` call, which costs a model step; putting the image into the turn input directly is a later optimization if the measured delay matters. The Host gains `sharp` as a core dependency (already shipped by the Computer package). Saving grids follows ordinary attachment retention; the "don't save frames" switch and silent frame records follow in VC5 (#3494), and `call_frame` zoom on a tile in VC4 (#3493).
