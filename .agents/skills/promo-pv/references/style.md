# Visual system

## Canvas and type

- 1920×1080, 30 fps. Geist (sans and mono, variable weights 400–800) with Noto Sans CJK SC for Chinese. Load every weight before `buildAll` (the kit's `boot.js` does) or letter positions measured at build time will be wrong.
- Headlines 76–150 px, weight 800, letter-spacing −0.02 em. Kickers are GeistMono 22 px, +0.08 em, accent blue, uppercase.
- Copy is Chinese first, short, one idea per screen: `对管理不同 App 的 Session 会话感到厌烦了吗？`, `隆重介绍`, `从一个功能，到每一天`.

## Palette

| Role | Value |
| --- | --- |
| Light ground | `#ECEAE6` (warm beige) |
| Ink | `#0F1115`, secondary `#3A3D44`, muted `#5A5D63` |
| Accent blue | `#4176E6` (also the T / o / B of "Team of Bots") |
| Feature cards | blue `#4176E6`, green `#287454`, amber `#D99A2B`, purple `#7957C9`, black `#0F1115`, white |
| Rainbow (progress bar, trails, confetti) | `#FF3B3B #FF9A1F #FFE23B #3BD16F #2FA8FF #7A5CFF` |
| Space | pure `#000`, bar track `#1B2142`, label `#AEB6D6` |

## Recurring elements

- **Stickers:** everything placeable is a sticker: white 8 px border, radius 0.24 × size, soft drop shadow (`.stk`). Logo and avatars are always stickers.
- **Avatars:** `avatarSvg(name)` from the product's pixel-avatar package (bundled by `setup.mjs`). Named cast: 托布 (the logo), 架构师, 测试工程师, Mira, Nova, Theo, Luna, Juno, Ivy, Rin, Coco, Sol, Kai.
- **Rainbow progress bar:** the opening is "你的 AI 正在更新 / 请不要关机" with a nyan rainbow filling a dark track; it returns at the end as `SESSION → BOT` reaching 100% and "更新完成". The white head square stretches with speed.
- **Cursor:** white-outlined pointer, always moving on arcs, with a press squash on click.
- **Real app shots:** the desktop app in dark mode, zoomed so text is readable at 1080p; phone recordings in a phone frame; chat-app screenshots (QQ, 微信, 飞书, Slack, Discord) as cards.
- **Bento:** feature cards on a 4-column grid (x 100–1820, y 200–1040, gap 20), sizes varied (2×2 chat, 1×2 phone, 2×1 integrations, 1×1 others). No avatars on bento cards; every card is a feature with one tiny live demo (bubbles, commit dots, model name reel, clock 17:29 → 17:30, icon wave, banner pan).

## Pixel cosmos (space scenes)

- Black background, `pxStars` square stars that snap to a 3 px grid, twinkle, streak when the camera speeds up, and grow a plus-shaped sparkle when near.
- Flyers are avatar or session-chip stickers with a depth-of-field twin (`stickerCanvas`), flying on 3D Bézier paths from every direction (some start past the lens, some far behind the target) and trailing a six-band stepped rainbow (`nyan`).
- Session chips (grey pills like "新聊天 (3)", "方案 v4 最终版") fly into the logo alongside Bots: Session → Bot.
- Each arrival bumps the logo and advances the bar a step; arrivals start sparse and pile up.

## End card and credits

- Logo, wordmark "Tobs", "Team of Bots · 托布", typed `github.com/BotHarness/DeepSeekBot`, then filled chips (no borders, text centred both ways with an inner flex box): ★ Star count, Fork count, MIT 开源, tobs.app. Numbers count up. Fetch current numbers from GitHub on the day you render.
- Credits roll on the same starfield: production, music (generator and track title), producer, platform, pixel avatars; then a "Bot 剧组" section where each Bot has a joke job (测试工程师 逐帧找茬, Rin 彗星驾驶员, Kai 茶水 ☕, Luna 说晚安 🌙); then 特别感谢 每一位点过 Star 的你 ★; it eases to a stop on the final slate and fades to black over the last 1.2 s.
