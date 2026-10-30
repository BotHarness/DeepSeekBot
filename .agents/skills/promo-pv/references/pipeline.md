# Pipeline

## Setup

`node .agents/skills/promo-pv/kit/setup.mjs <dir>` creates a workspace outside the repo:

- `index.html`: the stage.
- `scenes.js`: your timeline. It starts as three reference scenes.
- `beats.js`: the beat grid.
- `kit/`: the motion engine, pixel cosmos, renderer, previewer, mixer, beat tracker and SFX synth.
- `lib/pixel-avatar.js`: the product's avatar package, bundled as global `PX`.
- `assets/tobs-logo.png`, Geist fonts, and synthesized `sfx/*.wav`.

It needs the repo's `pnpm install` (for the avatar package and esbuild), Python with `numpy`, `soundfile` and `librosa`, ffmpeg, Playwright with Chromium, and network for `npm install geist`.

## Loop

1. Edit `scenes.js` and reload nothing: the previewer opens the page fresh every run.
2. Preview: `node kit/preview.cjs 3.5,4,4.5 out/pv` then `python3 kit/sheet.py out/pv out/sheet.jpg 4`. Sample every seam and every hold, and the middle of every fast move.
3. Render: `./kit/render-all.sh 3 out/name-v1.mp4 assets/bgm.wav`. It renders at about 2.4 fps per worker with SwiftShader WebGL (about 20 minutes for 3 minutes of video with 3 workers), concatenates, mixes and muxes. It also writes `-small.mp4` (CRF 26) for chat.
4. Spot-check the final file: `ffmpeg -ss <t> -i out/name-v1.mp4 -frames:v 1 x.jpg` at the seams.

## Traps

- **Canvas that only gets `clearRect`** can keep showing its last painted frame in screenshots. Hide it (`display: none`) when it has nothing to draw.
- **`fx()` resets `display`**, which kills `display: flex` on the element itself. Put the flex layout on an inner wrapper.
- **Fonts:** await every weight with `document.fonts.load` before measuring text in `build`.
- **iframes** (real app snapshots) need transitions disabled, and their images decoded before capture; `pending` covers `<img>` created through `el()`.
- **WebGL** needs `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; ask `canvasIn(root, true)` for a GL canvas so no 2D context grabs it first.
- **A zoom-in transition on a light scene** shows black edges; use `fade` there.
- **Parallel workers** each record their own cue file; the mixer merges `ev*.json`, so keep cue keys unique across scenes.
- **A waiter loop** that greps for `render.cjs` matches itself; use `pgrep -f "[n]ode kit/render"`.
- **Python http.server dies** with the shell that started it; start it with `nohup` and check it before previewing.
