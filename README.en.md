<div align="center">
  <a href="https://deepseekbot.botharness.ai/en/"><img src="docs/assets/readme/deepseekbot-og-en-v2.png" width="800" alt="DeepSeekBot: the open-source Grok Bot alternative. Built on DeepSeek Harness, works with DSH plugins, Lark, Slack, Discord and WeChat, MIT" /></a>

# DeepSeekBot

[中文](README.md) ｜ **English**

[![npm](https://img.shields.io/npm/v/deepseekbot?color=CB3837&logo=npm)](https://www.npmjs.com/package/deepseekbot)
[![Website](https://img.shields.io/badge/website-deepseekbot.botharness.ai-3D5AFE)](https://deepseekbot.botharness.ai/en/)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/aEB2Ayhu7B)
[![QQ group: 1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/BotHarness?style=flat)](https://github.com/BotHarness/BotHarness)

**The open-source Grok Bot alternative. A crew of bots, each with its own identity, persona and memory, working together.**

[Website](https://deepseekbot.botharness.ai/en/) · [Video](#video) · [Install](#install) · [Features](#features) · [Screenshots](#screenshots) · [Releases](#releases) · [Bot Marketplace](#marketplace) · [Community](#community) · [Docs](https://botharness.ai)

</div>

DeepSeekBot installs into [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) as one npm package: a Bot roster, DMs and Groups, Git Memory you can see, delegation, and IM identities of the Bots' own. Create **PersonaBots** for research, design or engineering; talk to them one to one or bring them into a Group. Each Bot keeps its own files and history across conversations, Sessions and Workspaces.

- **Open-source Grok Bot alternative**, MIT licensed
- **Built on DeepSeek Harness**: any model provider you connect in DSH works
- **Works with other DSH plugins** in the same Profile
- **Lark / Feishu, Slack, Discord and WeChat**: Bots speak under their own identity
- **Schedules and a Bot Marketplace**: Bots that do things on time, and Bots you can install or share in one click

This repository is **BotHarness**, the plugin layer that gives DSH agents a persistent identity; DeepSeekBot is its first product.

<a id="video"></a>

## Video

DeepSeekBot in three minutes: a crew of bots with their own identity, persona and memory, working together in a small town. Click the poster to play.

<p align="center">
  <a href="https://media.botharness.ai/pv/botharness-town-v19-1080p-lite-en.mp4"><img src="docs/assets/readme/v2/en/promo-video-v16.jpg" width="800" alt="DeepSeekBot promo video (3 minutes): click to play" /></a>
</p>

<a id="install"></a>

## Install

**Desktop:** open the DeepSeek Harness desktop app, go to **Plugins → Add plugin**, enter `deepseekbot` as the package name or address, keep the official npm registry, and click **Install**. When it shows Installed, click **Enable now** (restart the current Profile if DSH asks). **Bot mode** appears in the sidebar. No DSH yet? [Get the desktop app](https://www.deepseek.com/en/harness/).

**Developers (CLI):** needs Node 22 or later; supports the DSH 0.2 line from `0.2.0-rc.1`.

```bash
npm i -g @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add deepseekbot
dsh web
```

Open **Bot mode**, create a PersonaBot, DM it, then start a Group and invite members. To use Lark, Slack, Discord or WeChat, connect the app in **Settings → IM bots**, then bind the app in the Bot's Profile. Once a Lark app is bound, DMs and @mentions to it go straight to the Bot's Inbox. Accounts start disconnected; you turn each one on. To try it without touching your current setup, use a new Profile name. See [DSH docs: package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish).

<a id="features"></a>

## Every Bot is a colleague

| Feature                      | What you get                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Lasting identity**         | Each PersonaBot keeps its own name, role, Soul (SOUL.md) and pixel avatar across chats, Sessions and Workspaces.                                             |
| **Git Memory you can see**   | A Bot's memory is a plain Git working tree. Browse files, branches, commits and diffs in the sidebar, or push it to GitHub to share it across machines.      |
| **Groups**                   | Messages keep each Bot's identity, and you @ whoever you need. Each member picks every message, digest, mentions only or silent.                             |
| **Schedules**                | Have a Bot do something every few minutes, every hour or every day. Add one in the sidebar or just ask the Bot; once you lock it, the Bot can only read it.  |
| **Bot Marketplace**          | Install a Bot someone shared on the [Bot Marketplace](https://market.botharness.ai) in one click, or publish your own Bot to GitHub.                         |
| **Assignments**              | Grant a Workspace and a Bot can delegate independent Assignments, each with its own Session and report; the sidebar counts what needs your answer.           |
| **Their own IM identity**    | Bind a Bot to its own identity in Lark / Feishu, Slack, Discord and WeChat; it replies in the original thread when mentioned. WeChat DMs carry files too.    |
| **Update notes**             | After an install or update, Bot mode shows what changed; Bot settings show your version, check npm for a newer one, and install it and restart in one click. |
| **Computer and Browser use** | Drive a shared desktop (needs Docker) or a managed browser while you watch live and can pause it. Included by default.                                       |

<a id="screenshots"></a>

## Screenshots

<table>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/hero.jpg"><img src="docs/assets/readme/v2/en/hero.jpg" alt="Bot mode: a roster of five pixel-avatar Bots on the left, a DM with Mira in the middle, and Mira's Memory evolution Git graph on the right" /></a><br /><b>Roster and DMs</b>: every Bot has its own pixel avatar; on the right, its Memory evolution.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/group.jpg"><img src="docs/assets/readme/v2/en/group.jpg" alt="Observatory Studio Group: Mira, Theo and Nova reply under their own identities, with the member list on the right" /></a><br /><b>Groups</b>: @ three Bots and each replies; Nova reads the first two before answering.</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/memory-diff.jpg"><img src="docs/assets/readme/v2/en/memory-diff.jpg" alt="Clicking a commit in Mira's memory shows a line diff of plans/spring-exhibit.md" /></a><br /><b>Memory evolution</b>: click a commit to see exactly which lines of its memory a Bot changed.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/schedules.jpg"><img src="docs/assets/readme/v2/en/schedules.jpg" alt="After a request to read logs every morning at 9, Nova created a schedule itself; the sidebar lists Sessions and Schedules as cards" /></a><br /><b>Schedules</b>: one sentence and the Bot creates the schedule; cards show who made it and whether it's locked.</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/schedule-editor.jpg"><img src="docs/assets/readme/v2/en/schedule-editor.jpg" alt="Edit schedule: name, what the Bot should do, daily at 09:00, time zone, a lock switch and recent firings" /></a><br /><b>Edit a schedule</b>: run every N minutes, hours or daily, lock it against the Bot, and see the last 20 firings.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/marketplace.jpg"><img src="docs/assets/readme/v2/en/marketplace.jpg" alt="Bot Marketplace: topic filters and search, each listed Bot with a pixel avatar, role, stars and an Install button" /></a><br /><b>Bot Marketplace</b>: find Bots by topic or keyword; Install adds a new PersonaBot (sample listings shown).</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/en/release-notes-v2.jpg"><img src="docs/assets/readme/v2/en/release-notes-v2.jpg" alt="What's new in DeepSeekBot 1.0.2, listing Added, Fixed and Docs changes" /></a><br /><b>What's new</b>: after the first install and every update, Bot mode tells you what changed.</td>
    <td width="50%"><a href="docs/assets/readme/v2/en/settings.jpg"><img src="docs/assets/readme/v2/en/settings.jpg" alt="Bot settings: Bot icon, interface motion, list sorting, developer mode, and the DeepSeekBot version row with Changelog and Check for updates" /></a><br /><b>Bot settings</b>: see your version, check for updates, open the website changelog.</td>
  </tr>
</table>

_Captured in an isolated local DSH; click any image for the 2880 × 1800 original. Conversations are scripted, a fictional observatory exhibit; the Bot Marketplace shows sample listings._

<a id="git-memory"></a>

## Git Memory you can inspect

A PersonaBot's Memory is an ordinary Git working tree. Notes, persona, code and other files live on disk, and uncommitted files are part of current memory. The Bot explores and updates its memory through file, search, Shell and Git capabilities; you can use your own editor and Git tools too.

- **Memory files**: a directory tree and file reader; menus open or reveal the real file on the Host, or download its full current content.
- **Memory evolution**: branches, commit history and current changes. Click a commit to see its diff or inspect uncommitted edits; choose plain memory terms or Git terms.
- **Recovery checkpoints**: save context for explicit recovery while keeping Git authorship and history. You can also create a Bot from an existing Git repository and reuse its files and history.

Push the memory to GitHub or any Git remote to share the same memory across machines and DSH instances. [Memory design](docs/architecture/botharness-architecture.md) · [Recovery decision](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)

<a id="groups"></a>

## Bring your bots into a Group

Let the researcher keep the evidence, the designer move the experience forward, and the engineer check the details. Group messages keep each Bot's own identity; @ a Bot when you need it. In the Group sidebar, open **Members → Invite member** to search for or pick a PersonaBot. Bots join automatically by default and the invitation doesn't wake the model; you can let the Bot decide instead in Bot settings.

Choose how each member is notified: every message, a digest, direct mentions only, or silent. A Bot can adjust its own Group attention or leave the Group. DMs, Bot-to-Bot conversations, the Bot Inbox and the Human Inbox keep conversations and to-dos in reach. When work needs a project, grant a Workspace and let the Bot delegate independent **Assignments**, each with its own Session and report.

<a id="schedules"></a>

## Schedules: Bots that do things on time

Tell a Bot "every morning at 9, read the logs and send me a summary" and it creates the schedule itself. You can also click **+** under **Schedules** in the DM sidebar.

- **Three rhythms**: every few minutes, every few hours, or daily at a set time (with a time zone).
- **Wakes the Bot**: each firing lands in the Bot Inbox and wakes the Bot; that Inbox item opens the schedule it came from.
- **Clear ownership**: sidebar cards show whether you or the Bot created a schedule. Once locked, the Bot can read it but not change or delete it; up to 20 can be enabled per Bot.
- **History**: the editor lists the last 20 firings, each linked to the Session that handled it.

[Design decision](docs/adr/0133-bot-schedules-wake-the-orchestrator-through-the-bot-inbox.md)

<a id="marketplace"></a>

## Bot Marketplace: share and install Bots

The [Bot Marketplace](https://market.botharness.ai) lists Bots shared as public GitHub repositories. In Bot mode, click **+ → Bot Marketplace** next to Messages and browse by topic or keyword. Install first shows the source repository and its latest commit and reminds you it's third-party content; confirm and its Memory repository is cloned into a new PersonaBot. You can also paste a repository URL to list it right away.

To share your own Bot, check its Memory for anything private, then follow the [Share a Bot guide](docs/share-bot.md) to have the Bot publish itself to GitHub and add the `botharness-bot` topic. DeepSeekBot keeps `.botharness/bot.json` (name, tags, bio, avatar) up to date in every Bot's Memory, so the Marketplace shows the same Bot you see in your sidebar. To hand a Bot over without publishing it, export a zip from the Bot profile instead; see [Export and import a Bot](docs/bot-zip.md).

<a id="updates"></a>

## Updates and changelog

After the first install, and the first time you open Bot mode after each update, DeepSeekBot shows what changed in this version (or in every version since the one you last saw). **Settings → Bot settings → DeepSeekBot version** shows your version; **Check for updates** asks npm and, when there's something newer, lists what's new and installs it and restarts DSH in one click; see [Update DeepSeekBot](docs/update-deepseekbot.md). The full record is on the [website changelog](https://deepseekbot.botharness.ai/en/changelog/) and in [CHANGELOG.md](CHANGELOG.md).

<a id="computer-and-browser-use"></a>

## Computer use and Browser use

> Both Bundles ship with the `deepseekbot` npm package; a new Bot still needs its Access explicitly enabled before it can use them.

| Capability       | What is delivered                                                                                                                                                                             | Setup and boundary                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Computer use** | Observe and act on a shared desktop through Cua Driver, with a VNC view and Computer Audit.                                                                                                   | Ships with `deepseekbot` by default; the current implementation runs a container desktop and requires Docker. Turn on Computer Access for each Bot; with Auto-allow off, the first action of a Session asks for authorization.                           |
| **Browser use**  | Open and observe pages; click, type, press keys, scroll, wait, take screenshots, upload files, and manage multiple tabs. The sidebar shows the Bot's page and lets a Human pause its actions. | Ships with `deepseekbot` by default; runs a managed Bot Browser on the Host. Enable Browser Access per Bot; with Auto-allow off, authorize its Session. Named browser profiles can keep separate login data; Bots assigned to the same profile share it. |

![Existing DSH QA screenshot showing a named Bot Browser profile, a live page preview, and the Pause Bot control](docs/assets/pr/611-browser-profile-names/ui-completed.jpg)

_Reused from the [Browser profile verification](https://github.com/BotHarness/BotHarness/pull/615): the Bot has read a local test page, and the preview and Human controls remain available._

Each Bundle's DSH Profile setting `autoAllowActions` defaults to off. Enabling it skips that Bundle's per-Session approval; per-Bot Access must still be enabled.

Browser tab ownership controls which page a Bot operates; tabs in a shared browser profile are not a security isolation boundary. Computer and Browser Access are independent. Both Bundles are present after install, but neither gives a new Bot access until enabled. [Runtime design](docs/architecture/botharness-architecture.md) · [Computer contracts](docs/architecture/computer-runtime-contracts.md)

<a id="im-identities"></a>

## Bots with their own IM identities

Bind a PersonaBot to its own platform bot account, and external messages go out under that Bot's authorized identity. **Lark / Feishu, Slack, Discord and WeChat** are supported. The IM Provider that ships with DeepSeekBot (maintained from [dsh-im](https://github.com/xmanrui/dsh-im)) owns transport, credentials and connection lifecycle.

- @mention a Bot in a group or thread and the message reaches that PersonaBot's Inbox; it replies in the original thread.
- Only groups and channels you authorize reach a Bot's Inbox; outbound sends need an explicit grant and leave a send record.
- Choose per Bot how it takes messages: mentions only, count- or time-based digests of ordinary messages, or an immediate wake.
- In a WeChat DM, a Bot can take files you send and return its results in the same DM; source builds also preview images and reply with images.

Connection guides: [Lark / Feishu](docs/lark-connection.md) · [Slack](docs/slack-connection.md) · [WeChat](docs/wechat-connection.md).

<a id="pixel-avatars"></a>

## Pixel avatars: type a name, get a face

<img src="docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="Six pixel-art PersonaBot avatars" />

Every Bot's default avatar is generated from its name: the same name gives the same face everywhere. While a Bot works, its avatar turns into the tool it is using, pixel by pixel (read, shell, search, needs approval and more). Try a name on the [website](https://deepseekbot.botharness.ai/en/#avatar) and download an HD avatar. Avatars come from the open-source [BotPixel](https://github.com/BotHarness/BotPixel) (`@botharness/pixel-avatar` and `@botharness/pixel-morph`); every avatar in the [screenshots](#screenshots) above comes from it.

<a id="releases"></a>

## Release highlights

The core of each version; every entry is in [CHANGELOG.md](CHANGELOG.md) and on the [website changelog](https://deepseekbot.botharness.ai/en/changelog/).

| Version                     | Highlights                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next** (unreleased)       | WeChat original **voice** can be prepared for playback; Discord external-platform defaults can be saved on their own and are inherited by Profile settings.                                                                                                                                                                                                                                                                                                                                          |
| **1.1.0** (2026-10-06)      | Bot **Schedules** (create them in the sidebar, or let a Bot create, change or delete any you haven't locked); every Session starts with the Bot's **Soul and Core Memory** (`SOUL.md` + `MEMORY.md`, see the [guide](docs/soul-and-core-memory.md)); **one-click update and restart** in Bot settings; one **card design** across the Channel sidebar; WeChat **voice transcripts** and **images**; each Bot's Memory keeps `.botharness/bot.json`; **anonymous usage statistics** you can turn off. |
| **1.0.2** (2026-10-06)      | **What's new** after an install or update, and an **npm update check** in Bot settings; the [Share a Bot](docs/share-bot.md) guide; context reads keep precise `source-conflict` refusals.                                                                                                                                                                                                                                                                                                           |
| **1.0.1** (2026-10-05)      | First **stable** npm release: PersonaBots with their own identity, Git Memory, Groups, Assignments, pixel avatars, Lark / Feishu, Slack, Discord and WeChat identities (with files in WeChat DMs), and the first **Bot Marketplace**. 1.0.0 was not released as a product.                                                                                                                                                                                                                           |
| Development (to 2026-09-20) | The groundwork before the first release: PersonaBot identity and file Memory, the Bot mode channel shell and roster, creating a Bot from a Git repository, opening Memory files on the Host, and the bilingual docs site.                                                                                                                                                                                                                                                                            |

<a id="dsh"></a>

## Built on DeepSeek Harness

DeepSeekBot runs on DSH's own session management and harness, so any LLM provider you connect in DSH works for your Bots, and it installs alongside other DSH plugins. Some plugins may not be compatible yet; if you hit one, please open an [issue](https://github.com/BotHarness/BotHarness/issues) or a PR.

The [bilingual Release Ledger](CHANGELOG.md) records what each release changes; [Issues](https://github.com/BotHarness/BotHarness/issues) and [Projects](https://github.com/BotHarness/BotHarness/projects) track ongoing work.

<a id="try-it"></a>

## Try it from source

Use **Node ≥22** (the repository pins Node 24.21.0) and **pnpm 12.4.2**. Provide a usable model credential before expecting Bot replies. Docker is needed only for the container Computer.

```bash
git clone https://github.com/BotHarness/BotHarness.git
cd BotHarness
pnpm install
pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

Choose a fresh `--home` directory for an isolated DSH Profile. The helper uses the worktree's pinned CLI, links the local Bundles (Computer and Browser ship inside the `deepseekbot` umbrella), verifies the authenticated API, and prints the local login URL. Open it, select **Bot mode**, create your PersonaBots, send a DM, then create a Group and invite members. Open **Memory files** or **Memory evolution** from a Bot's DM sidebar.

The helper can inject a machine-local DeepSeek key or use the isolated Profile's credentials; keep secrets outside the repository. For model setup, optional IM installation, and the Client/Host development loop, use [the local-instance guide](docs/client-bridge.md#7-本地开发环路dsh-020-rc1).

Configure reusable independent Lark test Apps once with `node scripts/dev-im-test-apps.mjs setup`; every worktree, branch and session reads the same machine-local credentials. Coordinate an exclusive receiver window before each test; see the [shared test App guide](docs/agents/im-test-apps.md).

<a id="docs"></a>

## Documentation and development

- [DeepSeekBot website](https://deepseekbot.botharness.ai/en/) · [Documentation site](https://botharness.ai) · [Intro slides](https://botharness.ai/slides/s/botharness-intro)
- [Product language](CONTEXT.md) · [Living architecture and data flow](docs/architecture/botharness-architecture.md) · [Architecture decisions](docs/adr/)
- [Contributor instructions](AGENTS.md) · [Release Ledger](CHANGELOG.md) · [DSH official documentation](https://deepseek-harness.github.io/deepseek-harness/)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
pnpm dev:client    # automatic Client builds for the isolated local DSH Profile
pnpm docs:dev      # documentation at http://localhost:4321
```

For the stable local docs domain, use `pnpm dev` → `https://docs.botharness.localhost` (first run may request trust for its local CA). The no-sudo alternative is `PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev`. Documentation pages are generated from repository sources; edit those sources. Slides live in `apps/presentations`; use `pnpm slides:dev` to iterate.

```text
packages/core         PersonaBot identity, memory, Messaging, Inbox, Assignments
packages/client       @botharness/ui: Bot roster and in-harness interaction
packages/computer     optional shared container Computer
packages/browser      optional managed Bot Browser
packages/deepseekbot   DeepSeekBot Bundle
apps/docs             documentation site
apps/presentations    introduction and other slides
```

<a id="community"></a>

## Community

Questions, ideas and the Bots you build are all welcome.

- **Discord:** [join the DeepSeekBot server](https://discord.gg/aEB2Ayhu7B)
- **QQ group:** search **1125565676** in QQ
- **Bugs and feature requests:** [GitHub Issues](https://github.com/BotHarness/BotHarness/issues)

## Inspiration and acknowledgements

- [Grok Bot](https://x.ai/bot): persistent Bots that people can message and delegate work to like teammates.
- [Rakazo](https://github.com/elie222/rakazo): persistent AI teammates, conversations, and memory.
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin): Memory Git graph rails, commit lists, and diff presentation.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the upstream plugin host.
- [dsh-im](https://github.com/xmanrui/dsh-im), [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link), and [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge): IM integration foundations and reliability/routing references.

## License

MIT — see [LICENSE](LICENSE). Third-party works distributed inside the Client Bundle are listed in [THIRD_PARTY_NOTICES.md](packages/client/THIRD_PARTY_NOTICES.md).

## Star History

Live chart for **BotHarness/BotHarness**, using [Star History's official embed](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme).

<a href="https://www.star-history.com/?repos=BotHarness%2FBotHarness&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
    <img alt="BotHarness/BotHarness GitHub Star History by date" src="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
  </picture>
</a>
