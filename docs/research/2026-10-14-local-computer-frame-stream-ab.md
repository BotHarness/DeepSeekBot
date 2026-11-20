# Local Computer on the phone: screenshot stream against WebRTC

A/B test for [#1832](https://github.com/BotHarness/DeepSeekBot/issues/1832) and [#1833](https://github.com/BotHarness/DeepSeekBot/issues/1833). Decision: [ADR-0210](../decisions/computer.md#adr-0210).

## Method

A clock page (`node scripts/computer-frame-bench.mjs --write-clock`) draws `Date.now() mod 2^24` as 24 black and white cells after a red marker. The receiver decodes the cells from each frame and subtracts them from its own clock, which gives capture-to-receipt latency on one machine. The `static` scene shows fixed text; `?scene=busy` adds scrolling text and moving gradients.

- **Arm A, screenshot stream:** an isolated Host (`scripts/verify-app.mjs`) with the local target on Xvfb at 1440x900, measured with `node scripts/computer-frame-bench.mjs --name <instance> --scene <label>` for 20 s.
- **Arm B, WebRTC:** the Container Computer's Selkies stream at 1280x800 (AV1), received in Playwright Chromium with `requestVideoFrameCallback`, decoding the same clock from a canvas.

Both arms ran in the same Linux sandbox. Network transfer to a real phone is not included.

## Results

| Arm, scene                | fps | Latency p50 / p90    | Frame / bandwidth | CPU                              |
| ------------------------- | --- | -------------------- | ----------------- | -------------------------------- |
| Screenshot stream, static | 6.1 | 162–180 / 180–195 ms | 30 KB / 1.5 Mbps  | Host 3.6%, driver 4.5%           |
| Screenshot stream, busy   | 1.5 | 630–657 / 738 ms     | 1 MB / 12.6 Mbps  | Host 16%, driver 3.5%            |
| WebRTC, static            | 28  | 30 / 43 ms           | 2.4 Mbps          | container 39% idle, 64% in call  |
| WebRTC, busy              | 34  | 81 / 241 ms          | 14.6 Mbps         | container 54% idle, 155% in call |

## Reading

- A static screen changes rarely, so the stream mostly answers 204 and costs little. Capture itself takes about 140 ms per PNG.
- A busy screen makes every capture a new 1 MB PNG; encoding and base64 dominate, and fps falls to 1.5. WebRTC is more than 20 times faster there.
- On the 1440x900 Linux desktop, downscaling with `max_image_dimension` made PNGs larger on gradient content. The stream caps the long edge at 1600 px, which leaves that desktop at native size and only shrinks larger screens.
- The WebRTC CPU cost above is software AV1 in a container without a GPU. On a MacBook Air (Mac15,12, 8 cores, 2560x1664), a 15 s `ffmpeg` screen capture with hardware H.264 (`h264_videotoolbox`) ran at 28 fps full size at 6 Mbps for about 18% of one core, and at 30 fps scaled to 1280 wide at 3 Mbps for about 32% (the downscale ran on the CPU). A WebRTC stack adds packetizing, encryption and congestion control on top, so the screen was mostly static and this is a floor, not a full WebRTC measurement.
- macOS, before the 1600 px cap (MacBook Air, Retina 2940x1912, run from iTerm2 with Accessibility and Screen Recording, machine heavily loaded at 2–14% idle): static 1.1 fps, 3.3 MB per frame, 30 Mbps, Host 26% and driver 4% of one core; busy 1.4 fps, 3.3 MB, 39 Mbps, Host 31% and driver 6%. Latency was not readable because the clock window was not found in the frame. Full-size Retina PNGs are far too heavy for mobile data, which is why the stream now caps the long edge at 1600 px; the driver maps coordinates on the smaller capture back to the screen for actions in the same driver session.
- macOS, with the 1600 px cap (same Mac, even more loaded at 8–9% idle, clock readable in every frame): static 1.5 fps, 491 ms p50, 693 ms p90, 2.5 MB per frame, 31 Mbps, Host 29% and driver 20%; busy 0.9 fps, 787 ms p50, 1131 ms p90, 2.8 MB, 22 Mbps, Host 18% and driver 18%. The cap barely helps: scaling smooths text edges, and PNG compresses the smoothed image worse, so a 1600 px frame is still about 2 MB of PNG. On a 2940x1912 Linux desktop with a browser and terminal open, the same capped capture was 815 KB as PNG and 155 KB as JPEG at quality 70 (about 20 ms to encode with `sharp`), and the clock strip still decoded. Frames are therefore sent as JPEG at quality 70.
- Linux, JPEG at quality 70 (2940x1912 Xvfb, 4 cores, clock page and terminal open): static 1.2 fps, 826 ms p50, 206 KB per frame, 2.1 Mbps; busy 1.0 fps, 1041 ms p50, 207 KB, 1.6 Mbps. Bandwidth falls more than tenfold against PNG. The frame rate is now bound by the driver itself: one full-screen `get_desktop_state` at this size takes 850–920 ms with or without the cap, because the driver encodes the whole screen as PNG before returning it. Faster frames need a cheaper driver capture or the WebRTC helper (#1833).
- The clock page draws a second red marker after the bits, and the reader takes the cell width from the distance between the markers, so a scaled strip with fractional cells (17.4 px at 1600 px) reads correctly. Clock readings from runs before this change at 1600 px can be off by a few seconds in the low bits.
