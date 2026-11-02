# Storyboard template and review lessons

## The approved launch PV (3:03, BGM ≈ 123 bpm, bar ≈ 1.95 s)

| Time | Scene | What happens |
| --- | --- | --- |
| 0:00 | Intro | Dark screen, "你的 AI 正在更新 / 请不要关机", a nyan rainbow fills the bar, floods the screen. |
| 0:09 | Cover | Key art fades in already zooming, headline glows, out to full frame (2.5 s). |
| 0:12 | The problem | Three agent apps flip quickly, then the camera drops to the question 对管理不同 App 的 Session 会话感到厌烦了吗？ |
| 0:17 | The answer | Typed 隆重介绍 / 一款基于 Bot 人机交互的产品 → "Tobs" drops letter by letter → spreads into Team of Bots → logo lands on top. Centered, nothing else. |
| 0:25 | Bento | The whole board assembles; the camera focuses each feature on a bar; back out on the drop (0:40). |
| 0:44 | Chapters | One per pillar: a title card, then the real app (panel morphs in from full screen, narrator Bot bubble, cursor clicks). Models (slot-machine reel landing on the default model), Bot market (pick three Bots into the team, then a mini waterfall board), integrations (domino lines to every chat app), access from anywhere (fast cuts: phone, desktop app, QQ group screenshot, brand cards, hub), harness. |
| 2:13 | A day | Real channel list fills from 08:30 to 23:40 beside the bento; ends on the beat at 2:21. |
| 2:21 | Cosmos | Black pixel space: about 50 Bots and old sessions fly into the logo; the bar goes 0 → 100%. |
| 2:30 | Done | 更新完成, rainbow confetti, then the end card with repo and live numbers. |
| 2:40 | Credits | Roll with Bot jobs, final slate, fade out. |

## Pacing rules learned in review

1. Cover images and title cards: about 2.5 s, fade in already moving. Never let a still sit.
2. If an idea needs three examples, cut between them quickly (about 1 beat each), then move the camera to the takeaway line.
3. A long hold after content finishes reads as "stuck"; end the scene on the next beat after the last element lands (≤ 3 s).
4. A sequence of similar items (comets, waterfall tiles, platforms) goes "一个跟着一个": overlapping, accelerating, never one-wait-one.
5. Cut a segment rather than stretch it; give its time to the strongest visual (for example, the bento focus tour).
6. Fast cuts with more shots beat one slow shot when showing breadth (platforms, devices).

## Review notes and what fixed them

| Note | Fix |
| --- | --- |
| Rainbow bar hidden under the black track line | Canvas above the track (`zIndex = 2`); check bars in stills. |
| Cover shows too long | 2.5 s, fade in while already zooming. |
| Problem section too long | Three panels in quick succession, then the camera drops to the question. |
| Comets not tied to the avatars | Each avatar *is* the flyer, flying at the lens with its own trail. |
| Model list static | Slot-machine reel with speed blur, landing with a pulse on the default model. |
| Waterfall too long | Pick three Bots into the team quickly; show the market as a miniature scrolling board. |
| Integrations pause between apps | All lines and tiles fall in like dominoes at once. |
| "Same team on computer, server, group chat" misleads | Bots run on your computer; you reach them from phone, desktop app and chats. Show all of them in fast cuts. |
| Ending holds too long, comets too slow | Half the time; flyers from multiple 3D directions with depth of field, one after another. |
| Credits wanted | Repo, stars, forks, license, site; fun crew list with Bots. |
| Answer the opening question | Typed 隆重介绍 line, Tobs → Team of Bots, centered logo layout. |
| Comet/cosmos color off-brand, too realistic | Pixel rainbow trails; later, pure black starfield with pixel stars (low-poly backgrounds were rejected). |
| Bento too scattered, not enough motion | Board first, then focus each feature; no avatars on cards. |
| Ending cosmos should start on the beat and feel "filled" | Cut in exactly on the beat; 3× more flyers plus sessions; bar advances per arrival. |
| Chips with borders, text off-centre | Filled chips, inner flex box. |

## Sound

- Continuity first, beat sync second. Once the picture is approved, accent low-frequency hits (`KICKS`) and the high sax line (`SAX`) from `beats.js`.
- UI cues come from `cue()`: `whoosh` on scene changes (pre-rolled 0.25 s), `swish` on fast moves, `pop` on landings, `tick` on typing and small items, `click` on cursor presses.
