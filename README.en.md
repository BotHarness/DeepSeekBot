<div align="center">
  <a href="https://deepseekbot.app/en/"><img src="docs/assets/readme/deepseekbot-og-en-v2.png" width="800" alt="DeepSeekBot: the open-source Grok Bot alternative. Built on DeepSeek Harness, works with DSH plugins, Lark, Slack, Discord and WeChat, MIT" /></a>

# DeepSeekBot

[中文](README.md) ｜ **English**

[![npm](https://img.shields.io/npm/v/deepseekbot?color=CB3837&logo=npm)](https://www.npmjs.com/package/deepseekbot)
[![Website](https://img.shields.io/badge/website-deepseekbot.app-3D5AFE)](https://deepseekbot.app/en/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/aEB2Ayhu7B)
[![QQ group: 1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/DeepSeekBot?style=flat)](https://github.com/BotHarness/DeepSeekBot)

<a href="https://www.producthunt.com/products/deepseekbot?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-deepseekbot" target="_blank" rel="noopener noreferrer"><img alt="DeepSeekBot - Open-source Grok Bot alternative built on DeepSeek Harness | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1276820&amp;theme=light&amp;t=1791733459461"></a>

**DeepSeekBot (DSB): the open-source Grok Bot alternative. A crew of bots, each with its own identity, persona and memory, working together.**

[Website](https://deepseekbot.app/en/) · [Video](#video) · [Install](#install) · [Features](#features) · [Releases](#releases) · [vs. DS Bot](#deepseek-bot-projects) · [Community](#community) · [Docs](https://deepseekbot.app/en/docs/overview/)

</div>

<a id="video"></a>

## Video

DeepSeekBot in three minutes: a crew of bots with their own identity, persona and memory, working together in a small town. Click the poster to play.

<p align="center">
  <a href="https://media.botharness.ai/pv/botharness-town-v19-1080p-lite-en.mp4"><img src="docs/assets/readme/v2/en/promo-video-v16.jpg" width="800" alt="DeepSeekBot promo video (3 minutes): click to play" /></a>
</p>

DeepSeekBot (**DSB** for short) is BotHarness’s MIT-licensed, open-source Grok Bot alternative, running as a plugin in [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Create Bots for research, writing or coding and work with them like colleagues: chat one to one, bring them into a group, hand them tasks. They remember you, do things on schedule, and answer you under their own identity in Slack, Discord, Lark / Feishu, QQ and WeChat.

Bots use the model providers and quota you set up in DSH, and the machine running DSH has to stay online for Bots to keep working in the background. DSB is a different project from the similarly named DS Bot (npm `ds-bot`); see [how they differ](#deepseek-bot-projects).

<a id="install"></a>

## Install

In the DeepSeek Harness desktop app, go to **Plugins → Add plugin**, enter `deepseekbot@1.3.1`, install and enable it, and **Bot mode** appears in the sidebar. No DSH yet? [Get the desktop app](https://www.deepseek.com/en/harness/).

For command-line install, version notes and troubleshooting, see the [installation guide](https://deepseekbot.app/en/docs/installation/).

<a id="features"></a>

## What you can do with it

| You want                              | How DeepSeekBot helps                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A small AI team of your own**       | Create a researcher, a designer, an engineer. Each Bot has a name, a persona and a pixel avatar, and stays the same Bot across conversations.                                                                   |
| **Bots that remember you**            | Bots keep your preferences and project context and pick up where they left off. You can read and correct their memory, and sync it to other computers.                                                          |
| **Several Bots on one job**           | Bring Bots into a group chat and @ whoever you need. Hand a bigger task to one Bot to work on separately; it reports back and asks when it needs your call.                                                     |
| **Bots in the chat apps you use**     | Connect Bots to Slack, Discord, Lark / Feishu, QQ and WeChat. @ them in a group or message them directly, and they reply in place under their own identity; in WeChat DMs they can also send and receive files. |
| **Things done on time**               | Say “send me a log summary every morning at 9” and the Bot sets up the schedule itself, or set one to run every few minutes, hours or days.                                                                     |
| **Help on your computer and browser** | Once you allow it, a Bot can open web pages, click, type and take screenshots, or work on a shared desktop. You watch it live and can pause it any time.                                                        |
| **Ready-made Bots in one click**      | Browse and install Bots other people share in the [Bot Marketplace](https://deepseekbot.app/en/market), share your own, or send a Bot to a friend as a zip.                                                     |
| **Know what each update brings**      | After an update, Bot mode shows what is new; check for and install updates from Settings in one click.                                                                                                          |

<a id="pixel-avatars"></a>

### Pixel avatars

<img src="docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="Six pixel PersonaBot avatars" />

Every Bot gets a pixel avatar made from its name, and while it works the avatar morphs into the tool it is using. Want to make one? Type a name in the [Avatar Studio](https://deepseekbot.app/en/avatar) on our website and download it in high resolution.

<a id="screenshots"></a>

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/hero.jpg"><img src="docs/assets/readme/v2/en/hero.jpg" alt="Bot mode: a roster of five pixel-avatar Bots on the left, a DM with Mira in the middle, and Mira's memory evolution Git graph on the right" /></a><br /><b>Bot roster and DMs</b>: each Bot has its own pixel avatar; its memory history is on the right.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/group.jpg"><img src="docs/assets/readme/v2/en/group.jpg" alt="Observatory studio Group: Mira, Theo and Nova reply under their own identities, with the member list on the right" /></a><br /><b>Group chats</b>: @ three Bots and each replies; Nova reads the first two before answering.</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/schedules.jpg"><img src="docs/assets/readme/v2/en/schedules.jpg" alt="Nova creates a schedule after a request to read the logs every day at 9; the sidebar lists sessions and schedules as cards" /></a><br /><b>Schedules</b>: one sentence and the Bot sets up the task.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/marketplace.jpg"><img src="docs/assets/readme/v2/en/marketplace.jpg" alt="Bot Marketplace: filter by topic and search; each Bot shows its pixel avatar, role, stars and an Install button" /></a><br /><b>Bot Marketplace</b>: find Bots by topic or keyword and install one as a new colleague (sample data).</td>
  </tr>
</table>

_Screenshots from an isolated local DSH; the conversations are a fictional observatory-exhibition example._

<a id="git-memory"></a>

## Memory you can see

Each Bot's memory is a plain Git repository. In the sidebar you can read what it remembers and see which lines changed and when, and edit anything that is wrong. Push it to GitHub to use the same Bot on several computers. See the [memory evolution guide](https://deepseekbot.app/en/docs/channel-sidebar/memory-evolution/).

<a id="releases"></a>

## Release highlights

Full history on the [website changelog](https://deepseekbot.app/en/changelog/).

| Version                                                                                                       | What's new                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[1.3.1](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.3.1)** (2026-10-14)                       | Installing `deepseekbot` from the Plugins page takes one step again, with no build approval; needs DSH 0.2.0-rc.2. The `deepseekbot` CLI can configure a Host, drive a Bot's Browser and Computer, and manage IM apps; the Browser panel updates live.                                                                                                                                 |
| **[1.3.0](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.3.0)** (2026-10-14)                       | One design system across Bot mode, with Channel settings in a dialog; the Orchestrator tidies its own inbox and tasks; Bots use your secrets for CLI tools and **MCP** servers with your approval, and set up MCP from one sentence; **export** multi-selected messages; Bot colors, more pixel species and hand-drawn parts; restore memory to any version. Needs DSH 0.2.0 or later. |
| **[1.2.1](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.2.1)** (2026-10-12)                       | Fixes installs failing on some DSH versions; group avatars show a grid of member avatars; audio and file attachments play and download in place.                                                                                                                                                                                                                                       |
| **[1.2.0](https://github.com/BotHarness/DeepSeekBot/blob/v1.2.0/CHANGELOG.md#120---2026-10-08)** (2026-10-08) | Pixel **Window Companions** you can pin on your desktop; bind one app to message Bots in Lark, Slack, Discord and WeChat; **import and export** Bots as zip files; Bot profiles with a banner and bio.                                                                                                                                                                                 |
| **1.1.0** (2026-10-06)                                                                                        | **Schedules**; every conversation carries the Bot's persona and core memory; **one-click update** in Settings; WeChat voice-to-text and images.                                                                                                                                                                                                                                        |
| **1.0.1** (2026-10-05)                                                                                        | First stable release: PersonaBots with their own identity, Git memory, group chats, delegated tasks, pixel avatars, IM connections and the first **Bot Marketplace**.                                                                                                                                                                                                                  |

<a id="deepseek-bot-projects"></a>

## DeepSeekBot (DSB) and DS Bot (ds-bot): two projects, different focus

The names are close, but these are two independent open-source projects. Both run on DeepSeek Harness (DSH), and neither is an official DeepSeek product.

- **DeepSeekBot (DSB)**, this repository, by BotHarness, makes each Bot a long-lived colleague that **works beyond the DSH window**: Git memory you can review, the Bot's own Lark / Slack / Discord / WeChat identity, schedules, delegated Assignments and a Bot Marketplace.
- **DS Bot**, [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) (npm `ds-bot`, also written DeepSeek Bot in its README), **turns DSH itself into a bot chat app**: a main Bot, Chief, sets up your team through conversation, a group admin answers first to keep token use down, and a Usage page shows tokens by time, Bot and model.

|              | DeepSeekBot (DSB)                                                                                  | DS Bot (ds-bot)                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Repository   | [BotHarness/DeepSeekBot](https://github.com/BotHarness/DeepSeekBot)                                | [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)                       |
| Package      | npm [`deepseekbot`](https://www.npmjs.com/package/deepseekbot)                                     | npm [`ds-bot`](https://www.npmjs.com/package/ds-bot)                                  |
| License      | MIT                                                                                                | Apache-2.0                                                                            |
| Memory       | One Git working tree per Bot: files, commits and diffs; push to GitHub to share it across machines | Markdown memory reviewed after each turn; personal and team levels                    |
| Several Bots | @ whoever you need in a Group; Assignments delegate separate tasks with their own reports          | A main Bot manages the team; a group admin answers by default and calls in other Bots |
| Beyond DSH   | Bots join Lark / Feishu, Slack, Discord and WeChat under their own identity                        | GitHub connector                                                                      |
| Also         | Schedules, Bot Marketplace, Bot import and export, pixel avatars                                   | Schedules, Usage page                                                                 |

**Which one?** If you want Bots to work in your IM under their own identity, or to review and sync memory with Git, try DeepSeekBot. If you want a main Bot to walk you through building a team inside DSH and keep an eye on token use, try DS Bot. Both are open source, so read both codebases: [DeepSeekBot](https://github.com/BotHarness/DeepSeekBot) · [DS Bot](https://github.com/Fei2411/DeepSeek-Bot). For a longer comparison, see [the article on our website](https://deepseekbot.app/en/blog/deepseekbot-vs-ds-bot/).

## FAQ

### Which DeepSeek Bot project is this?

This is **DeepSeekBot (DSB) by BotHarness**: npm package [`deepseekbot`](https://www.npmjs.com/package/deepseekbot), website [deepseekbot.app](https://deepseekbot.app/en/). DS Bot uses `ds-bot` and is a separate project, not a short name or an older version of this one. See [how the two differ](#deepseek-bot-projects).

### Does DeepSeekBot require DeepSeek models?

No. It uses the providers configured in DSH; availability depends on API support, model settings and credentials. Memory and chat history stay on your host, while calls to a remote model send relevant context to the provider you chose.

<a id="docs"></a>

## For developers

To run from source or contribute, you need Node ≥22 and pnpm.

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git BotHarness
cd BotHarness
pnpm install && pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

More in the [local instance guide](docs/client-bridge.md) · [contributing guide](CONTRIBUTING.md) · [architecture](docs/architecture/botharness-architecture.md) · [decisions](docs/adr/) · [agent guidelines](AGENTS.md) · [Release Ledger](CHANGELOG.md) · [DSH docs](https://deepseek-harness.github.io/deepseek-harness/).

For real IM tests, the [shared QA App wizard](docs/agents/im-test-apps.md) configures independent Lark, Slack and Discord QA1/QA2/QA3 slots. For example, run `node scripts/dev-im-test-apps.mjs setup discord` to enter the Token privately; confirm the current exclusive window before each receiver start.

<a id="community"></a>

## Community

Questions, ideas and the Bots you build are all welcome.

- **Discord:** [join the DeepSeekBot server](https://discord.gg/aEB2Ayhu7B)
- **QQ group:** search **1125565676** in QQ
- **Help, ideas and examples:** [GitHub Discussions](https://github.com/BotHarness/DeepSeekBot/discussions) · [Welcome](https://github.com/BotHarness/DeepSeekBot/discussions/1397)
- **Reproducible bugs and scoped work:** [GitHub Issues](https://github.com/BotHarness/DeepSeekBot/issues/new/choose)
- **Help maintain the project:** [Contributor guide](CONTRIBUTING.md) · [Your first contribution](https://github.com/BotHarness/DeepSeekBot/discussions/1398); documentation, testing and answers count too.

## Inspiration and acknowledgements

- [Grok Bot](https://x.ai/bot): persistent Bots that people can message and delegate work to like teammates.
- [Rakazo](https://github.com/elie222/rakazo): persistent AI teammates, conversations, and memory.
- [DS Bot](https://github.com/Fei2411/DeepSeek-Bot): another Bot plugin for DSH with a different focus, worth a read.
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin): Memory Git graph rails, commit lists, and diff presentation.
- [Coopanion](https://github.com/Pal-AI-Lab/Coopanion): the Window Companion's single speech bubble, sentence pacing, walking direction, and bubble style.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the upstream plugin host.
- [dsh-im](https://github.com/xmanrui/dsh-im), [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link), and [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge): IM integration foundations and reliability/routing references.

## License

MIT — see [LICENSE](LICENSE). Third-party works distributed inside the Client Bundle are listed in [THIRD_PARTY_NOTICES.md](packages/client/THIRD_PARTY_NOTICES.md).

## Star History

Live chart for **BotHarness/DeepSeekBot**, using [Star History's official embed](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme).

<a href="https://www.star-history.com/?repos=BotHarness%2FDeepSeekBot&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;legend=top-left" />
    <img alt="BotHarness/DeepSeekBot GitHub Star History by date" src="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;legend=top-left" />
  </picture>
</a>
