<div align="center">
  <a href="https://deepseekbot.app"><img src="docs/assets/readme/deepseekbot-og-zh-v2.png" width="800" alt="DeepSeekBot：开源的 GrokBot 平替。基于 DeepSeek Harness，兼容其他 DSH 插件，连接飞书、Slack、Discord 和微信，MIT 开源" /></a>

# DeepSeekBot

**中文** ｜ [English](README.en.md)

[![npm](https://img.shields.io/npm/v/deepseekbot?color=CB3837&logo=npm)](https://www.npmjs.com/package/deepseekbot)
[![官网](https://img.shields.io/badge/官网-deepseekbot.app-3D5AFE)](https://deepseekbot.app)
[![MIT 许可](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-加入-5865F2?logo=discord&logoColor=white)](https://discord.gg/aEB2Ayhu7B)
[![QQ 群：1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/DeepSeekBot?style=flat)](https://github.com/BotHarness/DeepSeekBot)

<a href="https://www.producthunt.com/products/deepseekbot?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-deepseekbot" target="_blank" rel="noopener noreferrer"><img alt="DeepSeekBot - Open-source Grok Bot alternative built on DeepSeek Harness | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1276820&amp;theme=light&amp;t=1791733459461"></a>

**DeepSeekBot（DSB）：开源的 GrokBot 平替。一组有各自身份、人格和记忆的 bots，一起做事。**

[官网](https://deepseekbot.app) · [宣传片](#video) · [安装](#install) · [能力](#features) · [版本亮点](#releases) · [与 DS Bot 的区别](#deepseek-bot-projects) · [社区](#community) · [文档](https://deepseekbot.app/docs/overview/)

</div>

<a id="video"></a>

## 宣传片

3 分钟看懂 DeepSeekBot：一组有身份、人格和记忆的 bots，在小镇里一起做事。点击封面即可播放。

<p align="center">
  <a href="https://media.botharness.ai/pv/botharness-town-v19-1080p-lite-zh.mp4"><img src="docs/assets/readme/v2/zh/promo-video-v16.jpg" width="800" alt="DeepSeekBot 宣传片（3 分钟）：点击播放" /></a>
</p>

DeepSeekBot（简称 **DSB**，是 DeepSeekBot 的缩写，才不是“大啥比”，哼）是 BotHarness 开发的 MIT 开源 GrokBot 平替，作为插件运行在 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)里。你可以创建几个分别负责研究、写作或写代码的 Bot，像和同事一样私聊、拉群、派活；它们记得你，会按时做事，还能在 Slack、Discord、飞书 / Lark、QQ 和微信里以自己的身份回你消息。

模型用你在 DSH 里配置的服务商和额度；Bot 需要在后台持续工作时，运行 DSH 的电脑要保持在线。它和名字很像的 DS Bot（npm `ds-bot`）是两个独立项目，区别见[下文](#deepseek-bot-projects)。

<a id="install"></a>

## 安装

在 DeepSeek Harness 桌面端点「插件 → 添加插件」，输入 `deepseekbot@1.2.1`，安装并启用，侧栏就会出现「Bot 模式」。还没装 DSH？先[下载桌面端](https://www.deepseek.com/en/harness/)。

命令行安装、版本说明和常见问题见[官网安装指南](https://deepseekbot.app/docs/installation/)。

<a id="features"></a>

## 能用它做什么

| 你想要                     | DeepSeekBot 怎么帮你                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **一支自己的 AI 小团队**   | 创建研究员、设计师、工程师等 Bot，每个都有名字、人格和像素头像，换个对话也还是同一个它。                                    |
| **让 Bot 记住你**          | Bot 会记下你的偏好和项目背景，下次直接接着干；记忆随时能翻看、纠正，也能同步到别的电脑。                                    |
| **多个 Bot 一起干活**      | 把 Bot 拉进群聊，需要谁就 @ 谁；大一点的任务可以交给 Bot 单独去做，做完交回报告，需要你拍板时会提醒你。                     |
| **在常用的聊天软件里找它** | 把 Bot 接入 Slack、Discord、飞书 / Lark、QQ 和微信，在群里 @ 它或私聊，它就在原处用自己的身份回复；微信私聊里还能收发文件。 |
| **定时做事**               | 说一句「每天早上 9 点给我发日志摘要」，Bot 就自己建好定时任务；也可以手动设置每隔几分钟、几小时或每天执行。                 |
| **帮你操作电脑和浏览器**   | 授权后，Bot 可以打开网页、点击、输入、截图，或操作一台共享桌面；你能实时看着它做，随时暂停。                                |
| **一键装别人做好的 Bot**   | 在 [Bot 市场](https://deepseekbot.app/market)浏览、安装别人分享的 Bot，也能把自己的 Bot 分享出去，或打包成 zip 发给朋友。   |
| **知道每次更新了什么**     | 升级后会告诉你这一版新增了什么；在设置里就能检查并一键更新。                                                                |

<a id="pixel-avatars"></a>

### 像素头像

<img src="docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="六个像素风 PersonaBot 头像" />

每个 Bot 都有一张由名字生成的像素头像，工作时还会变成它正在用的工具。想自己捏一个？到[官网头像工坊](https://deepseekbot.app/avatar)输入名字试试，还能下载高清头像。

<a id="screenshots"></a>

## 截图

<table>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/hero.jpg"><img src="docs/assets/readme/v2/zh/hero.jpg" alt="Bot 模式：左侧是五个像素头像的 Bot 名册，中间是与 Mira 的私聊，右侧是 Mira 的记忆演化 Git graph" /></a><br /><b>Bot 名册与私聊</b>：每个 Bot 有自己的像素头像；右侧是它的记忆演化。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/group.jpg"><img src="docs/assets/readme/v2/zh/group.jpg" alt="天文台工作室 Group：Mira、Theo 和 Nova 以各自身份回复，右侧是成员列表" /></a><br /><b>群聊协作</b>：@ 三个 Bot，它们各自回复，Nova 读完前两位再接话。</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/schedules.jpg"><img src="docs/assets/readme/v2/zh/schedules.jpg" alt="Nova 收到“每天 9 点读日志”的请求后自己创建了定时任务，右侧侧栏用卡片列出会话和定时任务" /></a><br /><b>定时任务</b>：一句话让 Bot 自己建任务。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/marketplace.jpg"><img src="docs/assets/readme/v2/zh/marketplace.jpg" alt="Bot 市场：按话题筛选、搜索，列表中每个 Bot 都有像素头像、岗位、Star 数和安装按钮" /></a><br /><b>Bot 市场</b>：按话题和关键词找 Bot，点「安装」就多一位同事（图中为示例数据）。</td>
  </tr>
</table>

_截图来自隔离的本地 DSH，对话是虚构的天文台展览示例。_

<a id="git-memory"></a>

## 看得见的记忆

每个 Bot 的记忆就是一个普通的 Git 仓库。你可以在侧栏翻看它记了什么、哪天改了哪几行，觉得不对就直接改；推到 GitHub，就能在几台电脑之间共用同一个 Bot。详见[记忆演化指南](https://deepseekbot.app/docs/channel-sidebar/memory-evolution/)。

<a id="releases"></a>

## 版本亮点

完整记录见[官网更新日志](https://deepseekbot.app/changelog/)。

| 版本                                                                                                              | 新内容                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[1.2.1](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.2.1)**（2026-10-12）                          | 修复部分 DSH 版本装不上的问题；群头像显示成员头像拼图；音频和文件附件可以直接播放、下载。                                                        |
| **[1.2.0](https://github.com/BotHarness/DeepSeekBot/blob/v1.2.0/CHANGELOG.zh.md#120---2026-10-08)**（2026-10-08） | 可以置顶在桌面的像素**窗口伙伴**；绑定一个应用就能在飞书、Slack、Discord、微信里收发消息；Bot 可以**导入导出**成 zip；Bot 资料页加了横幅和简介。 |
| **1.1.0**（2026-10-06）                                                                                           | **定时任务**；每次对话都带上 Bot 的人格和核心记忆；设置里**一键更新**；微信支持语音转文字和图片。                                                |
| **1.0.1**（2026-10-05）                                                                                           | 首个正式版：有身份的 PersonaBots、Git 记忆、群聊、任务委派、像素头像、IM 接入和首版 **Bot 市场**。                                               |

<a id="deepseek-bot-projects"></a>

## DeepSeekBot（DSB）与 DS Bot（ds-bot）：两个项目，不同重心

名字很像，但这是两个独立的开源项目：都运行在 DeepSeek Harness（DSH）上，都不是 DeepSeek 公司官方产品。

- **DeepSeekBot（DSB）**，即本仓库，由 BotHarness 维护：让每个 Bot 成为一位能**走出 DSH 窗口**的长期同事。重心是可审阅的 Git 记忆、Bot 自己的飞书 / Slack / Discord / 微信身份、定时任务、任务委派和 Bot 市场。
- **DS Bot**，即 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)（npm `ds-bot`，项目 README 中也写作 DeepSeek Bot）：把 **DSH 本身变成一个 Bot 聊天应用**。重心是由主 Bot「Chief」通过对话带你建好团队、群管理员默认统筹回复以控制 token 消耗，以及按时间、Bot 和模型查看用量。

|             | DeepSeekBot（DSB）                                                         | DS Bot（ds-bot）                                                |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 仓库        | [BotHarness/DeepSeekBot](https://github.com/BotHarness/DeepSeekBot)        | [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) |
| 安装包      | npm [`deepseekbot`](https://www.npmjs.com/package/deepseekbot)             | npm [`ds-bot`](https://www.npmjs.com/package/ds-bot)            |
| 许可        | MIT                                                                        | Apache-2.0                                                      |
| 记忆        | 每个 Bot 一个 Git 工作树：文件、commit、diff，可推到 GitHub 在多台机器共享 | Markdown 记忆，每轮后自动审查；个人与团队两级                   |
| 多 Bot 协作 | Group 中需要谁就 @ 谁；Assignments 委派独立任务并保留报告                  | 主 Bot 管理团队；群管理员默认回复，再按需叫其他 Bot             |
| DSH 之外    | Bot 以自己的身份进入飞书 / Lark、Slack、Discord、微信                      | 提供 GitHub connector                                           |
| 其他        | 定时任务、Bot 市场、Bot 导入导出、像素头像                                 | 定时任务、Usage 用量页                                          |

**怎么选**：想让 Bot 在 IM 里以自己的身份工作、想用 Git 审阅和同步记忆，试试 DeepSeekBot；想在 DSH 里由主 Bot 一步步带着建团队、关注 token 用量，试试 DS Bot。两者都开源，欢迎都去读读源码：[DeepSeekBot](https://github.com/BotHarness/DeepSeekBot) · [DS Bot](https://github.com/Fei2411/DeepSeek-Bot)。更详细的对比见[官网文章](https://deepseekbot.app/blog/deepseekbot-vs-ds-bot/)。

## 常见问题

### 这是哪个 DeepSeek Bot 项目？

这里是 **BotHarness 的 DeepSeekBot（DSB）**：安装包为 [`deepseekbot`](https://www.npmjs.com/package/deepseekbot)，官网为 [deepseekbot.app](https://deepseekbot.app)。DS Bot 使用 `ds-bot`，是另一个独立项目，不是本产品的简称或旧版本，区别见[上文](#deepseek-bot-projects)。

### DeepSeekBot 只能使用 DeepSeek 模型吗？

不是。它使用 DSH 中配置的模型提供商；能否接入取决于接口支持、模型配置与凭据。Bot 的记忆和聊天记录保存在自己的宿主，调用远程模型时相关上下文仍会发给所选服务商。

<a id="docs"></a>

## 开发者

想从源码运行或参与开发：需要 Node ≥22 和 pnpm。

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git BotHarness
cd BotHarness
pnpm install && pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

更多见[本地实例指南](docs/client-bridge.md#7-本地开发环路dsh-020-rc1) · [贡献指南](CONTRIBUTING.zh.md) · [架构](docs/architecture/botharness-architecture.md) · [架构决策](docs/adr/) · [Agent 开发规范](AGENTS.md) · [Release Ledger](CHANGELOG.zh.md) · [DSH 官方文档](https://deepseek-harness.github.io/deepseek-harness/)。

<a id="community"></a>

## 社区

问题、想法，还有你做出来的 Bot，都欢迎带来。

- **Discord**：[加入 DeepSeekBot 服务器](https://discord.gg/aEB2Ayhu7B)
- **QQ 群**：在 QQ 中搜索群号 **1125565676**
- **使用求助、想法与作品分享**：[GitHub Discussions](https://github.com/BotHarness/DeepSeekBot/discussions) · [欢迎帖](https://github.com/BotHarness/DeepSeekBot/discussions/1397)
- **明确的 Bug 与实施任务**：[GitHub Issues](https://github.com/BotHarness/DeepSeekBot/issues/new/choose)
- **参与维护**：[贡献指南](CONTRIBUTING.zh.md) · [第一次贡献](https://github.com/BotHarness/DeepSeekBot/discussions/1398)，文档、测试和答疑也欢迎。

## 灵感与致谢

- [Grok Bot](https://x.ai/bot)：持久 Bot，以及像同事一样沟通和委派工作的产品灵感。
- [Rakazo](https://github.com/elie222/rakazo)：持久 AI 队友、对话与记忆体验参考。
- [DS Bot](https://github.com/Fei2411/DeepSeek-Bot)：同样运行在 DSH 上的另一个 Bot 插件，重心不同，值得一读。
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin)：Memory Git graph 分支线、提交列表与 diff 呈现参考。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：上游插件宿主。
- [dsh-im](https://github.com/xmanrui/dsh-im)、[dsh-lark-link](https://github.com/amlyczz/dsh-lark-link) 与 [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)：IM 接入基础与可靠性、路由参考。

## 许可

MIT，见 [LICENSE](LICENSE)。Client Bundle 中分发的第三方素材见 [THIRD_PARTY_NOTICES.md](packages/client/THIRD_PARTY_NOTICES.md)。

## Star History

**BotHarness/DeepSeekBot** 的实时 Star 历史，使用 [Star History 官方嵌入方式](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme)。

<a href="https://www.star-history.com/?repos=BotHarness%2FDeepSeekBot&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;legend=top-left" />
    <img alt="BotHarness/DeepSeekBot 按日期展示的 GitHub Star 增长历史" src="https://api.star-history.com/chart?repos=BotHarness/DeepSeekBot&amp;type=date&amp;legend=top-left" />
  </picture>
</a>
