# Product Hunt launch (English)

Site: `https://deepseekbot.botharness.ai/en/`
GitHub: `https://github.com/BotHarness/BotHarness`
Docs: `https://deepseekbot.botharness.ai/en/docs/`
Discord: `https://discord.gg/aEB2Ayhu7B`

PH launches go live at 12:01 AM Pacific. Schedule it a few days ahead from the "Submit" flow so you can share the teaser link.

---

## Basics

- **Name** (40 chars): `DeepSeekBot`
- **Tagline** (60 chars max), pick one:
  1. `Open-source Grok Bot alternative based on DeepSeek Harness` (58; the 60-char limit leaves no room for "(DSH)", so the description spells it out)
  2. `Open-source AI teammates with memory you can open like Git` (58)
  3. `Bots with their own identity, memory and team chat seat` (55)
- Recommended: **1**.
- **Links**: website `https://deepseekbot.botharness.ai/en/` (keep it plain: PH adds `?ref=producthunt` itself), GitHub repo as a second link
- **Pricing**: Free (open source)
- **Topics** (up to 3): `Open Source`, `Artificial Intelligence`, `Developer Tools` (alternative to the last: `Productivity`)
- **Video**: upload the English film to YouTube first, then paste the YouTube link here. PH only accepts YouTube links for the video slot.
- **Thumbnail** (240×240): `producthunt/ph-thumbnail.png`. PH also accepts a GIF; `images/avatar-morph-turn.gif` would work if you crop it square.

## Description (500 chars max; this one is 492)

```
DeepSeekBot is the open-source Grok Bot alternative, based on DeepSeek Harness (DSH). Create PersonaBots with their own name, persona and memory, message them like teammates, and mention them in a Group to put several to work at once. Each bot can join Lark, Slack, Discord or WeChat as itself and reply in the original thread. Its memory is a Git repo you can open, rewind, or push to GitHub. It runs on DSH's own sessions and harness, so it works with any LLM provider DSH connects to. MIT.
```

## Gallery (1270×760, in this order)

1. `producthunt/ph-1-hero-v2.png`: the open-source Grok Bot alternative, based on DeepSeek Harness
2. `producthunt/ph-mode-v1.png`: sessions or bots, one switch (DSH native vs Bot mode)
3. `producthunt/ph-memory-v1.png`: memory is Git
4. `producthunt/ph-chat-v1.png`: Groups, DMs, Slack and Discord
5. `producthunt/ph-3-lark.png`: lives in your team chat (Lark)
6. `producthunt/ph-4-town.png`: a town of bots that remember you (film still)
7. Optional: `images/avatar-morph-crew.gif` (avatars morph into the tool they are using)

## Maker's first comment

```
Hi Product Hunt 👋

I'm Vain. DeepSeekBot is the open-source Grok Bot alternative, based on DeepSeek Harness (DSH): I wanted something like Grok Bot that I could run myself.

Working with Claude Code or Codex, I kept deciding which session each task belonged in. I wanted to talk to people instead: a researcher, a designer, an engineer, each with a name and a memory, who I can message directly or bring into a Group.

What ships today:
• PersonaBots with their own persona (PERSONA.md), avatar and memory, across chats, sessions and workspaces
• Groups: mention a bot and it picks up; several can work at once
• Their own IM identity in Lark / Feishu, Slack, Discord and WeChat, replying in the original thread
• Git Memory: browse files, branches, commits and diffs; go back when it remembers something wrong; push to GitHub to share one memory across machines
• Assignments: grant a workspace and a bot delegates independent tasks with their own reports
• Pixel avatars generated from each bot's name that morph into the tool it is using (the engine is its own MIT package, BotPixel)

It's built on DeepSeek Harness itself: bots run on DSH's own session management and harness, so you can use any LLM provider you connect in DSH, and it sits alongside your other DSH plugins. If another plugin doesn't play well with it, please open an Issue or a PR.

To try it, open DeepSeek Harness → Plugins → Add plugin, enter deepseekbot and click Install. Docs: https://go.botharness.ai/ph-docs

I'd love to hear which platform or workflow you'd want your bots in first.

GitHub: https://github.com/BotHarness/BotHarness
Discord: https://discord.gg/aEB2Ayhu7B
```

> The comment is written in your voice; edit the "I'm Vain" line and the story to match how you want to introduce yourself.

## Short replies to have ready

- **"How is this different from Grok Bot?"** It's open source (MIT), runs on DeepSeek Harness on your own machine, and each bot's memory is a Git repo you can read, rewind and share.
- **"Which models?"** Any LLM provider you connect in DeepSeek Harness. DeepSeekBot runs on DSH's own session management and harness, so it uses whatever model your DSH profile is set up with.
- **"Does it work with my other DSH plugins?"** It's designed to sit alongside them. Some combinations may not be compatible yet; please open an Issue or a PR on GitHub, or tell us on Discord: https://discord.gg/aEB2Ayhu7B
- **"Is it affiliated with DeepSeek?"** No, it's a community plugin for the DeepSeek Harness ecosystem.
- **"Can I self-host?"** Yes. It runs where DSH runs; IM accounts start disconnected and you connect each one yourself.
