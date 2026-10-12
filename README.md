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

[官网](https://deepseekbot.app) · [宣传片](#video) · [安装](#install) · [能力](#features) · [截图](#screenshots) · [版本亮点](#releases) · [Bot 市场](#marketplace) · [社区](#community) · [与 DS Bot 的区别](#deepseek-bot-projects) · [文档](https://botharness.ai)

</div>

DeepSeekBot（简称 **DSB**，是 DeepSeekBot 的缩写，才不是“大啥比”，哼）是 BotHarness 开发的 MIT 开源 GrokBot 平替，作为 `deepseekbot` 插件安装到 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness)：Bot 名册、私聊与 Group、看得见的 Git Memory、任务委派，以及 Bot 自己的 IM 身份。创建负责研究、设计或实现的 **PersonaBots**，分别私聊，或把它们带进 Group 协作；每个 Bot 保留自己的文件与历史，跨对话、Session 和 Workspace 延续。

- **GrokBot 的开源平替**，MIT 开源
- **基于 DeepSeek Harness**，你在 DSH 里接入的任何模型 provider 都能用
- **兼容其他 DSH 插件**，可以和它们装在同一个 Profile
- **连接飞书 / Lark、Slack、Discord 和微信**，Bot 用自己的身份发言
- **定时任务与 Bot 市场**：让 Bot 按时做事，一键安装或分享别人做好的 Bot

本仓库维护 **DeepSeekBot** 产品及其 BotHarness 插件层。正式品牌连写为 DeepSeekBot，简称 DSB。它和名字很像的 DS Bot（npm `ds-bot`）是两个独立项目，区别见[下文](#deepseek-bot-projects)。模型调用使用你自己的服务商额度，持续后台任务需要运行 DSH 的宿主保持在线。

<a id="video"></a>

## 宣传片

3 分钟看懂 DeepSeekBot：一组有身份、人格和记忆的 bots，在小镇里一起做事。点击封面即可播放。

<p align="center">
  <a href="https://media.botharness.ai/pv/botharness-town-v19-1080p-lite-zh.mp4"><img src="docs/assets/readme/v2/zh/promo-video-v16.jpg" width="800" alt="DeepSeekBot 宣传片（3 分钟）：点击播放" /></a>
</p>

<a id="install"></a>

## 安装

**桌面端**：打开 DeepSeek Harness 桌面端，点「插件 → 添加插件」，在「包名或地址」里输入 `deepseekbot@1.2.1`，保持「npm 官方源」，点「安装」。显示「已安装」后点「立即启用」（提示重启时重启当前 Profile），侧栏会出现「Bot 模式」。还没装 DSH？先[下载桌面端](https://www.deepseek.com/en/harness/)。

请使用上面的完整版本号，不要改成裸包名或 `@latest`：pnpm 的新版本冷却策略可能选择较旧版本。若提示供应链审批，只确认经过验证的精确版本；不要全局关闭保护或跳过 DSH 兼容检查。安装后核对实际版本，截图或预览卡片不代表实际安装结果。详见[安装与恢复说明](docs/installation.zh.md)。

**当前稳定版：1.2.1。** 1.2.0 带来窗口伙伴、一键绑定应用和 Bot 导入导出；1.2.1 修复安装兼容限制，并改进群头像与附件卡片。详见[版本亮点](#releases)。

**开发者（命令行）**：需要 Node 22 以上。1.2.1 的最低 DSH 版本声明为 `>=0.1.7-0`（含预览版）；实包安装矩阵已检查 `0.1.7-alpha.1` 至 `0.2.1-alpha.2` 的已发布版本。声明不设未来版本上限，但不代表未来版本已经过运行验证。以下以 DSH `0.2.0-rc.1` 为例。

```bash
npm i -g @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add deepseekbot@1.2.1
dsh web
```

打开后进入 **Bot mode**，按首次引导创建 Bot、完成一次私聊，再建 Group 邀请成员。要接入飞书、Slack、Discord 或微信，到「设置 → IM bots」连接应用，再在 Bot 的 Channel 侧栏「外部身份」里点「绑定应用」。飞书、Slack 和 Discord 应用绑定后，私聊和 @ 它的消息直接进入 Bot 收件箱，并在原处回复；个人微信只接收扫码者的私聊，不接收其他联系人或群消息。安装后账号默认不连接，由你逐个开启。想先试试又不想动现有配置，可以换一个新的 Profile 名字。参见 [DSH 官方文档：打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。

<a id="features"></a>

## 每个 Bot 都是一位同事

| 能力                        | 说明                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **持久身份**                | 每个 PersonaBot 有自己的名字、岗位、Soul（SOUL.md）和像素头像，跨对话、Session 与 Workspace 延续。                         |
| **看得见的 Git Memory**     | Bot 的记忆是一个普通 Git 工作树。在侧栏浏览文件、分支、commit 历史与 diff，也能推到 GitHub，在多台机器之间共享同一份记忆。 |
| **Group 协作**              | 消息保留各自身份，需要谁就 @ 谁。每个成员可以选择每条提醒、摘要、仅提及或静默。                                            |
| **定时任务**                | 让 Bot 每隔几分钟、每小时或每天做一件事。你可以在侧栏新建，也可以直接让 Bot 自己建；锁定后 Bot 只能看、不能改。            |
| **Bot 市场**                | 从 [Bot 市场](https://market.botharness.ai) 一键安装别人分享的 Bot，或把自己的 Bot 发布到 GitHub 分享出去。                |
| **Assignments 委派**        | 授予 Workspace 后，Bot 可以委派独立的 Assignment，各自保留 Session 与报告；需要你回答或批准时，侧栏会显示待办数。          |
| **自己的 IM 身份**          | 在飞书 / Lark、Slack、Discord 和微信里绑定 Bot 自己的身份，被 @ 时在原话题里回复；微信私聊还能收发文件和图片。             |
| **更新提示**                | 安装或升级后显示这一版的更新内容；Bot 设置里能看到当前版本，检查 npm 上的新版本并一键安装、重启。                          |
| **Computer 与 Browser use** | 开发中组件：操作共享桌面或受管浏览器，可实时观看与暂停。正式 npm 1.2.0 不含这两个 Bundle。                                 |

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

## DeepSeek Bot 常见问题

### 这是哪个 DeepSeek Bot 项目？

这里是 **BotHarness 的 DeepSeekBot（DSB）**：安装包为 [`deepseekbot`](https://www.npmjs.com/package/deepseekbot)，官网为 [deepseekbot.app](https://deepseekbot.app)。DS Bot 使用 `ds-bot`，是另一个独立项目，不是本产品的简称或旧版本。两者的重心对比见[上文](#deepseek-bot-projects)。

### DeepSeekBot 只能使用 DeepSeek 模型吗？

不是。它使用 DSH 中配置的模型提供商；能否接入取决于接口支持、模型配置与凭据。Bot 的记忆和聊天记录保存在自己的宿主，调用远程模型时相关上下文仍会发给所选服务商。

<a id="screenshots"></a>

## 截图

<table>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/hero.jpg"><img src="docs/assets/readme/v2/zh/hero.jpg" alt="Bot 模式：左侧是五个像素头像的 Bot 名册，中间是与 Mira 的私聊，右侧是 Mira 的记忆演化 Git graph" /></a><br /><b>Bot 名册与私聊</b>：每个 Bot 有自己的像素头像；右侧是它的记忆演化。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/group.jpg"><img src="docs/assets/readme/v2/zh/group.jpg" alt="天文台工作室 Group：Mira、Theo 和 Nova 以各自身份回复，右侧是成员列表" /></a><br /><b>Group 协作</b>：@ 三个 Bot，它们各自回复，Nova 读完前两位再接话。</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/memory-diff.jpg"><img src="docs/assets/readme/v2/zh/memory-diff.jpg" alt="点击 Mira 记忆中的一个 commit，中间显示 plans/spring-exhibit.md 的逐行 diff" /></a><br /><b>记忆演化</b>：点一个 commit，就能看到 Bot 改了记忆里的哪几行。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/schedules.jpg"><img src="docs/assets/readme/v2/zh/schedules.jpg" alt="Nova 收到“每天 9 点读日志”的请求后自己创建了定时任务，右侧侧栏用卡片列出会话和定时任务" /></a><br /><b>定时任务</b>：一句话让 Bot 自己建任务；侧栏卡片标出是谁建的、是否锁定。</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/schedule-editor.jpg"><img src="docs/assets/readme/v2/zh/schedule-editor.jpg" alt="编辑定时任务：名称、要做的事、每天 09:00、时区、锁定开关和最近执行记录" /></a><br /><b>编辑定时任务</b>：按分钟、小时或每天执行，锁定后 Bot 不能改，还能看最近 20 次执行。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/marketplace.jpg"><img src="docs/assets/readme/v2/zh/marketplace.jpg" alt="Bot 市场：按话题筛选、搜索，列表中每个 Bot 都有像素头像、岗位、Star 数和安装按钮" /></a><br /><b>Bot 市场</b>：按话题和关键词找 Bot，点「安装」就多一个 PersonaBot（图中为示例数据）。</td>
  </tr>
  <tr>
    <td width="50%"><a href="docs/assets/readme/v2/zh/release-notes.jpg"><img src="docs/assets/readme/v2/zh/release-notes.jpg" alt="DeepSeekBot 1.0.2 更新内容弹窗，按新增、修复、文档列出变化" /></a><br /><b>更新内容</b>：首次安装和每次升级后，Bot 模式会告诉你这一版改了什么。</td>
    <td width="50%"><a href="docs/assets/readme/v2/zh/settings.jpg"><img src="docs/assets/readme/v2/zh/settings.jpg" alt="Bot 设置：Bot 图标、界面动效、排序、开发者模式，以及 DeepSeekBot 版本行的更新日志和检查更新按钮" /></a><br /><b>Bot 设置</b>：查看当前版本，检查更新，打开官网更新日志。</td>
  </tr>
</table>

_截图来自隔离的本地 DSH，点开可看 2880 × 1800 原图。对话由脚本生成，是虚构的天文台展览示例；Bot 市场中的条目为示例数据。_

<a id="git-memory"></a>

## 看得见的 Git Memory

PersonaBot 的 Memory 是一个普通 Git 工作树。笔记、人格、代码和其他文件留在磁盘上，尚未提交的文件也是当前记忆。Bot 可以通过文件、搜索、Shell 和 Git 能力探索与更新记忆；你也可以使用自己的编辑器和 Git 工具。

- **Memory files**：目录树与文件阅读器，菜单可以打开或定位 Host 上的真实文件，也能下载当前完整内容。
- **Memory evolution**：分支、commit 历史与当前改动。点击 commit 查看 diff，或检查尚未提交的修改；可选择易读的记忆术语或 Git 术语。
- **Recovery checkpoints**：为显式恢复保存上下文，保留 Git 作者与历史。也可以从已有 Git 仓库创建 Bot，复用其文件与历史。

把记忆推到 GitHub 等 Git 远端，就能在多台机器、多个 DSH 之间共享同一份记忆。[记忆设计](docs/architecture/botharness-architecture.md) · [恢复决策](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)

<a id="groups"></a>

## 把不同的 bots 带进 Group

让研究员记住依据，让设计师推进体验，让工程师检查细节。Group 中的消息保留每个 Bot 自己的身份；需要某个 Bot 参与时，直接 @ 它。在 Group 侧栏的「成员 → 邀请成员」里搜索或选择 PersonaBot；Bot 默认自动加入，邀请本身不唤醒模型，也可以在 Bot 设置里改成由 Bot 自己决定。

可为每个成员选择收件提醒方式：每条消息、摘要、仅直接提及，或静默收件。Bot 可以调整自己的 Group 提醒偏好，也可以离开 Group。私聊、Bot 间对话、Bot Inbox 与 Human Inbox 保留对话和待办入口。需要在项目中执行工作时，授予 Workspace，让 Bot 委派独立 **Assignments**，各自保留 Session 与报告。

<a id="schedules"></a>

## 定时任务：让 Bot 按时做事

对 Bot 说「每天早上 9 点读一下日志，给我发个摘要」，它会自己建一个定时任务。你也可以在私聊侧栏的「定时任务」里点 **+** 手动新建。

- **三种节奏**：每隔几分钟、每隔几小时，或每天固定时间（可选时区）。
- **按时唤醒**：每次执行都会进入 Bot 收件箱并唤醒 Bot；收件箱里的这一项能直接跳回对应的定时任务。
- **谁建的一目了然**：侧栏卡片标出是你建的还是 Bot 建的。锁定之后 Bot 只能看、不能改或删；每个 Bot 最多同时启用 20 个。
- **执行记录**：编辑窗口列出最近 20 次执行，并链接到处理它的会话。

[设计决策](docs/adr/0133-bot-schedules-wake-the-orchestrator-through-the-bot-inbox.md)

<a id="marketplace"></a>

## Bot 市场：分享和安装 Bot

[Bot 市场](https://market.botharness.ai) 收录公开 GitHub 仓库里分享的 Bot。在 Bot 模式的消息列表点 **+ → Bot 市场**，按话题或关键词浏览，点「安装」后会先显示来源仓库和最新提交，提醒这是第三方内容；确认后它的 Memory 仓库被克隆成你的一个新 PersonaBot。也可以把仓库地址贴进去，立即收录。

想分享自己的 Bot：先检查它的 Memory 里没有不该公开的内容，再按 [分享 Bot 教程](docs/share-bot.zh.md) 让 Bot 自己发布到 GitHub，加上 `botharness-bot` 话题即可上架。DeepSeekBot 会在每个 Bot 的 Memory 里自动维护 `.botharness/bot.json`（名称、标签、简介、头像），所以市场里显示的和你侧栏里的一致。不想公开的话，也可以在 Bot 资料页导出 zip 直接发给对方，见 [导出与导入 Bot](docs/bot-zip.zh.md)。

<a id="updates"></a>

## 更新与更新日志

首次安装后，以及每次升级后第一次打开 Bot 模式，DeepSeekBot 会弹出这一版（或你上次看过之后所有版本）的更新内容。**设置 → Bot 设置 → DeepSeekBot 版本** 显示当前版本，「检查更新」会查询 npm；有新版本时列出新内容，可以一键安装并重启 DSH，步骤见 [更新 DeepSeekBot](docs/update-deepseekbot.zh.md)。完整记录见 [官网更新日志](https://deepseekbot.app/changelog/) 和仓库里的 [CHANGELOG](CHANGELOG.zh.md)。

<a id="computer-and-browser-use"></a>

## Computer use 与 Browser use

> **版本范围（2026-10-11）**：下述为当前源码能力。正式 npm `deepseekbot@1.2.0` 仅默认提供 Core、Client 与 IM Provider，不含 Computer / Browser Bundle；默认打包这两项的变更仍在 [Unreleased](CHANGELOG.zh.md#unreleased)。源码运行与正式包安装请分别核对。

> 当前源码配置包含这两个 Bundle；新 Bot 仍需显式开启对应 Access 才能使用。

| 能力             | 当前已交付                                                                                                              | 启用条件与边界                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Computer use** | 通过 Cua Driver 观察、操作共享桌面，提供 VNC 观看与 Computer Audit。                                                    | 当前源码随 `deepseekbot` 提供；当前运行容器桌面，需要 Docker。按 Bot 打开 Computer Access，Auto-allow 关闭时，每个 Session 首次动作请求授权。                                                            |
| **Browser use**  | 打开与观察网页；点击、输入、按键、滚动、等待、截图、上传文件与管理多标签。侧栏展示 Bot 当前网页，Human 可以暂停其操作。 | 当前源码随 `deepseekbot` 提供；在 Host 上运行受管 Bot Browser。按 Bot 打开 Browser Access；Auto-allow 关闭时需授权 Session；命名 browser profile 可保留不同登录数据，分配到同一 profile 的 Bots 共享它。 |

![已有 DSH QA 截图：命名 Bot Browser profile、实时网页预览与 Pause Bot 控件](docs/assets/pr/611-browser-profile-names/ui-completed.jpg)

_复用 [Browser profile 验证](https://github.com/BotHarness/DeepSeekBot/pull/615) 截图：Bot 已读取本地测试页，预览与 Human 控件可用。_

每个 Bundle 的 DSH Profile 配置 `autoAllowActions` 默认关闭。开启后，该 Bundle 的操作跳过逐 Session 授权，但仍需按 Bot 开启对应 Access。

标签归属决定某个 Bot 操作哪一页；同一 browser profile 中的标签不是安全隔离边界。Computer 与 Browser Access 独立控制。当前源码配置包含两个 Bundle，新 Bot 仍需显式开启对应 Access；正式 npm 1.2.0 不默认包含它们。[运行时设计](docs/architecture/botharness-architecture.md) · [Computer 契约](docs/architecture/computer-runtime-contracts.md)

<a id="im-identities"></a>

## 让 Bot 以自己的 IM 身份发言

把 PersonaBot 绑定到自己的平台 Bot 账号，外部消息就以这个 Bot 获授权的身份发出。已支持 **飞书 / Lark、Slack、Discord 和微信**，连接由 DeepSeekBot 随包管理的 IM Provider（维护自 [dsh-im](https://github.com/xmanrui/dsh-im)）负责传输、凭据与连接生命周期。

- 在群聊或话题里 @Bot，消息进入该 PersonaBot 的 Inbox，由它在原话题回复。
- 只有你授权过的群和频道才会进入 Bot 的 Inbox；出站发送需要显式授权，并留有发送记录。
- 可以按 Bot 设置收件方式：只响应提及、按数量或时间汇总普通消息，或立即唤醒。
- 微信私聊里，Bot 能接收你发来的文件并在原私聊回传处理结果；源码版还支持图片预览和图片回复。

连接指南：[飞书 / Lark](docs/lark-connection.zh.md) · [Slack](docs/slack-connection.zh.md) · [微信](docs/wechat-connection.zh.md)。

<a id="pixel-avatars"></a>

## 像素头像：输入名字，得到一张脸

<img src="docs/assets/readme/pixel-avatars-crew.gif" width="660" alt="六个像素风 PersonaBot 头像" />

每个 Bot 的默认头像都由名字生成：同一个名字，在哪里都是同一张脸。Bot 工作时，头像会一颗像素一颗像素地变成它正在用的工具（读文件、终端、搜索、等你批准……）。到[官网](https://deepseekbot.app/#avatar)输入名字试试，还能下载高清头像。头像来自开源的 [BotPixel](https://github.com/BotHarness/BotPixel)（`@botharness/pixel-avatar` 与 `@botharness/pixel-morph`），上面[截图](#screenshots)里的所有头像都是它生成的。

<a id="releases"></a>

## 版本亮点

每个版本的核心变化，完整条目见 [CHANGELOG](CHANGELOG.zh.md) 和 [官网更新日志](https://deepseekbot.app/changelog/)。

| 版本                                                                                                              | 核心内容                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[1.2.1](https://github.com/BotHarness/DeepSeekBot/releases/tag/v1.2.1)**（2026-10-12）                          | 修复 **DSH 0.1.7 / 0.2 安装兼容限制**；无自定义头像的群显示最多四个成员头像，群消息区与侧栏头像一致；**音频与文件附件卡片**提供内联播放和直接下载。                                                                                                                                                                                                               |
| **[1.2.0](https://github.com/BotHarness/DeepSeekBot/blob/v1.2.0/CHANGELOG.zh.md#120---2026-10-08)**（2026-10-08） | 像素 **窗口伙伴**可置顶并播放 Bot 回复；飞书、Slack、Discord、微信 **绑定应用即收发**，Group 可连接外部会话；**Bot zip 导入导出**；Profile 横幅、标签和简介，设置移至 Channel 侧栏；市场展示 Profile 卡片；Bot 模式安装 Git；首次引导完成一次真实对话；微信原始语音可准备后播放。                                                                                 |
| **1.1.0**（2026-10-06）                                                                                           | Bot **定时任务**（侧栏新建，或让 Bot 自己建、改、删，锁定后 Bot 不能改）；每个 Session 都带上 Bot 的 **Soul 与核心记忆**（`SOUL.md` + `MEMORY.md`，见 [教程](docs/soul-and-core-memory.zh.md)）；Bot 设置里**一键更新并重启**；Channel 侧栏统一为**卡片样式**；微信支持**语音转写**和**图片**；Memory 自动维护 `.botharness/bot.json`；可关闭的**匿名使用统计**。 |
| **1.0.2**（2026-10-06）                                                                                           | 安装和升级后显示**更新内容**，Bot 设置里**检查 npm 新版本**；新增 [分享 Bot 教程](docs/share-bot.zh.md)；上下文读取保留准确的 `source-conflict` 拒绝。                                                                                                                                                                                                            |
| **1.0.1**（2026-10-05）                                                                                           | 首个 npm **正式版**：拥有各自身份的 PersonaBots、Git Memory、Group、Assignment、像素头像，飞书 / Lark、Slack、Discord 和微信身份（微信私聊可收发文件），以及首版 **Bot 市场**。1.0.0 未作为产品发布。                                                                                                                                                             |
| 开发历史（截至 2026-09-20）                                                                                       | 首个版本之前的基础：PersonaBot 身份与文件记忆、Bot 模式的频道外壳与名册、从 Git 仓库创建 Bot、在 Host 上打开记忆文件，以及双语文档站。                                                                                                                                                                                                                            |

<a id="dsh"></a>

## 站在 DeepSeek Harness 上

DeepSeekBot 直接用 DSH 自己的 Session 管理和 Harness：你在 DSH 里接入的任何 LLM 模型 provider，Bot 都能用；也可以和其他 DSH 插件装在一起。个别插件可能还不兼容，遇到了欢迎提 [Issue](https://github.com/BotHarness/DeepSeekBot/issues) 或 PR。

[双语 Release Ledger](CHANGELOG.zh.md) 记录每个版本的变化（摘要见[版本亮点](#releases)）；[Issues](https://github.com/BotHarness/DeepSeekBot/issues) 与 [Projects](https://github.com/BotHarness/DeepSeekBot/projects) 跟踪后续工作。

<a id="try-it"></a>

## 从源码开始使用

需要 **Node ≥22**（仓库固定 Node 24.21.0）和 **pnpm 12.4.2**。让 Bot 回复前，配置可用模型凭据；只有容器 Computer 需要 Docker。

```bash
git clone https://github.com/BotHarness/DeepSeekBot.git BotHarness
cd BotHarness
pnpm install
pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

选择一个全新的 `--home` 目录作为隔离 DSH Profile。helper 使用工作树固定的 CLI、链接本地 Bundles（Computer 与 Browser 随 `deepseekbot` umbrella 提供），验证已认证 API，并打印本地登录 URL。打开后进入 **Bot mode**，创建 Bot、发送私聊，再建 Group 邀请成员。在 Bot 私聊的侧栏打开 **Memory files** 或 **Memory evolution**。

helper 可注入机器本地的 DeepSeek key，也可使用隔离 Profile 的凭据；密钥始终留在仓库外。模型配置、可选 IM 安装和 Client/Host 开发循环见 [本地实例指南](docs/client-bridge.md#7-本地开发环路dsh-020-rc1)。

<a id="docs"></a>

## 文档与开发

- [DeepSeekBot 官网](https://deepseekbot.app) · [文档站](https://botharness.ai) · [介绍 Slides](https://botharness.ai/slides/s/botharness-intro)
- [产品术语](CONTEXT.zh.md) · [持续维护的架构与数据流](docs/architecture/botharness-architecture.md) · [架构决策](docs/adr/)
- [贡献指南](CONTRIBUTING.zh.md) · [Agent 开发规范](AGENTS.md) · [Release Ledger](CHANGELOG.md) · [DSH 官方文档](https://deepseek-harness.github.io/deepseek-harness/)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
pnpm dev:client    # 隔离本地 DSH Profile 的 Client 自动构建
pnpm docs:dev      # 文档预览：http://localhost:4321
```

独立 Lark 测试 App 可配置一次并跨 worktree、branch 和 session 复用：`node scripts/dev-im-test-apps.mjs setup`；Slack 使用独立 QA1／QA2／QA3 槽，运行 `node scripts/dev-im-test-apps.mjs setup slack`。凭据保存在同一机器本地共享文件中，`list slack` 只列出 Slack 配置元数据；每次测试前仍须协调独占接收窗口。见[共享测试 App 指南](docs/agents/im-test-apps.md)。

稳定的本地文档域名：`pnpm dev` → `https://docs.botharness.localhost`（首次可能请求信任本地 CA）；免 sudo 方式为 `PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev`。文档页从仓库源文件生成，请修改源文件。Slides 位于 `apps/presentations`，用 `pnpm slides:dev` 迭代。

```text
packages/core         PersonaBot 身份、记忆、Messaging、Inbox、Assignments
packages/client       @botharness/ui：Bot 名册与宿主内交互
packages/computer     可选共享容器 Computer
packages/browser      可选受管 Bot Browser
packages/deepseekbot   DeepSeekBot Bundle
apps/docs             文档站
apps/presentations    介绍与其他 Slides
```

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
