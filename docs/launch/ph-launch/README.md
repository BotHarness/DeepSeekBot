# 发布素材总览

所有文案只写已经交付的能力（含 Discord、微信，以及通过 Git + GitHub 分享 Bot 记忆）。
官网已上线。文案里的官网和文档链接都换成了 go.botharness.ai 短链（Campaign `ph-launch`，每个平台 / 位置一个 slug，如 B 站 `bili`、X `x`、YouTube `yt`、置顶评论 `*-pin`、PH 首评 `ph-docs`、Discord `dc*`），跳转时带上 UTM（`utm_source` = 平台，`utm_medium` = video / post / comment，`utm_content` = slug），点击数在 https://go.botharness.ai/admin 和 PostHog 都能看；短链清单和一键创建脚本见 `short-links.sh`。PH 产品页的网站链接保持原样（PH 会自动加 `?ref=producthunt`）。GitHub 和 Discord 邀请链接不走短链（短链只能跳官网）。基础地址：中文 `https://deepseekbot.botharness.ai/`（B 站），英文 `https://deepseekbot.botharness.ai/en/`（X / YouTube / PH）。
社区入口：Discord `https://discord.gg/aEB2Ayhu7B` 只放 X / YouTube / PH；QQ 群 1125565676 只放 B 站。

## 文案

| 平台                 | 文件                | 内容                                                           |
| -------------------- | ------------------- | -------------------------------------------------------------- |
| Bilibili（中文）     | `bilibili.md`       | 11 个标题方案、简介、标签、分区、章节、置顶评论、动态          |
| X.com（英文）        | `x.md`              | 3 个主帖方案、链接回复、3 条可选跟帖、图片 alt                 |
| YouTube（英文）      | `youtube.md`        | 5 个标题、完整描述 + 章节、标签、设置、置顶评论                |
| Product Hunt（英文） | `producthunt.md`    | 名称、3 个 tagline、描述、话题、图集顺序、Maker 首评、常见回复 |
| Discord 服务器       | `discord-server.md` | 频道结构、角色、欢迎词和规则（中英）                           |

## 图片

图片都在本目录下，结构如下。

- `covers/`
  - `bilibili-cover-a-1146x717-v5.png` 1146×717（2 倍图）：像素天空 + 头像，「开源的 GrokBot 平替 / ChatGPT Dots 平替」（推荐）
  - `bilibili-cover-b-1146x717-v2.png` 1146×717（2 倍图）：真实 Group 界面，「群里 @ 一下，它就开工」
  - `bilibili-cover-c-1146x717-v2.png` 1146×717（2 倍图）：3D 小镇画面，「如果我是 AI，你会记得我吗？」
  - `youtube-thumb-a-v2.png` 1280×720，和 B 站封面 A v5 同版式（推荐）；旧版 `youtube-thumb-a.png` / `-b.png`
- `producthunt/`：图集顺序见 `producthunt.md`（1270×760，官网像素风的 `ph-mode-v1` / `ph-memory-v1` / `ph-chat-v1`，首图 `ph-1-hero-v2`）和 `ph-thumbnail.png`（240×240）
- `screens/`：真实产品截图原图（Group、飞书话题、Slack 话题、记忆文件、记忆演化、连接器），`en-` / `zh-` 分语言
- `stills/`：宣传片画面（标题卡、小镇、连接器、记忆、头像墙、3D 小镇俯瞰 `town-aerial.png`、片尾卡），1280×720，从宣传片源码逐帧渲染
- `images/`：X 配图 `x-mode-v1` / `x-memory-v1` / `x-chat-v1`（1600×900，官网像素风）；头像变形 GIF、头像墙、官网 OG 图、英文 Slack 卡片、吉祥物

## 发布前要确认的

1. B 站和 YouTube 都要声明 AI 生成内容（旁白和 BGM）。
2. 「ChatGPT Dots 平替」只放在 B 站标题和封面 A 上；英文平台按你的要求只用 Grok Bot。
