---
name: promo-pv
description: Make Tobs promo videos (PV), teasers and other motion marketing assets with the house look and Disney-style motion, rendered frame by frame from HTML to MP4 with BGM and sound cues. Use when asked for a promo video, launch trailer, feature teaser, animated social clip, or end-card/credits for Tobs (Team of Bots).
---

# Promo PV

A Tobs PV is a frame-driven HTML page: every scene is a function of time `t`, Playwright screenshots each frame at 30 fps, ffmpeg encodes it, and a mixer lays the BGM and UI sound cues under it. Nothing animates on its own, so every frame is deterministic and any second can be previewed instantly.

This skill holds the rules that a reviewer signed off on after four rounds of feedback on the launch PV, plus a working kit. Read the references before you storyboard:

- [references/style.md](references/style.md) — the visual system: palette, type, stickers, avatars, pixel cosmos, end card and credits.
- [references/motion.md](references/motion.md) — the Disney principles mapped to the kit's helpers, with the default numbers.
- [references/storyboard.md](references/storyboard.md) — the approved PV structure as a template, pacing rules, and every review note with what fixed it.
- [references/pipeline.md](references/pipeline.md) — setup, preview, render, mix, delivery, and the traps that cost a render.

## Workflow

1. **Storyboard first.** Write the beats as stills (one line of copy, one picture each) and get the requester's approval before animating. Put it on a page they can open; a storyboard is cheap to change, a render is not.
2. **Set up a workspace outside the repo** (renders are hundreds of MB):
   ```bash
   node .agents/skills/promo-pv/kit/setup.mjs ~/promo/<name>
   cd ~/promo/<name> && python3 -m http.server 8777 &
   ```
   Put the BGM at `assets/bgm.wav` (48 kHz) and run `python3 kit/beats.py assets/bgm.wav` to write `beats.js`. `scenes.js` starts as three reference scenes; replace them with your storyboard.
3. **Lay the timeline on the beat grid.** Every scene boundary is `T(bar)` (4 beats) or `TB(beat)`. Cut on downbeats; land the big moment (bento snapping into place, the final logo) on the drop.
4. **Build one scene at a time** with `S(name, a, b, build, { tin, tout, pre, post })`. `build(root)` lays out DOM/canvas once and returns `draw(t)`. Use only the kit's motion helpers; never CSS transitions or `animation`.
5. **Preview constantly.** `node kit/preview.cjs 12.5,13,14 out/pv && python3 kit/sheet.py out/pv out/sheet.jpg` and look at the sheet. Check every seam (last frame of a scene vs first of the next) and every hold.
6. **Render, mix, deliver.** `./kit/render-all.sh 3 out/<name>-v1.mp4 assets/bgm.wav` renders in parallel, mixes and muxes, and writes a `-small.mp4`. Deliver both; version every round (`v5.1`, `v5.2`…) and keep the previous one for comparison.

## Non-negotiables

- **Continuity before beat sync.** Every cut is motivated: zoom through, push, iris, expand from a card, or a camera move on one continuous canvas. Never a hard cut to an unrelated layout, never a black frame between scenes.
- **No dead holds.** A static hold is at most about 3 s and still moves (a bob, a slow push). If a section feels long, cut it or give the camera a job; reviewers notice holds before anything else.
- **Real product, real assets.** Show the real app (dark mode, zoomed in), real chat-app screenshots, Bot avatars from the product's pixel-avatar package, the real logo. Never invent UI that the product does not have.
- **Accurate claims.** Bots run on the user's own computer; people reach them from the phone app, the desktop app and group chats. Copy that implies otherwise gets flagged.
- **One look.** Light scenes are warm beige with flat colored cards; space scenes are pure black with square pixel stars and nyan-style rainbow trails. No realistic nebulae, no low-poly gradients, no glossy 3D.
- **Layering.** A progress bar or highlight drawn on a canvas sits above its track (`cv.style.zIndex = 2`). Check it in a still.
- **Credits are part of the brand.** End on the repo URL, live Star/Fork numbers, license and site as filled chips, then a playful credits roll where Bots have jobs.
- **Model names stay out of the repo.** Credit the production model in the video only, using the name the requester gives; never write a model identifier into this skill, a commit or a PR.
