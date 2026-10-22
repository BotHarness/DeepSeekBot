# 交接 1：整合与合并顺序

仓库 https://github.com/BotHarness/DeepSeekBot ，main 截至 `8f4e650d`（https://github.com/BotHarness/DeepSeekBot/pull/2550）。目标：把下面的「闸门」清空，然后在一个最新 main 上做验收（交接 4）和打包（交接 2、3）。

## 闸门：验收前必须处理

按顺序：

1. **https://github.com/BotHarness/DeepSeekBot/pull/2433 1.5.0 发版文档**（分支 `claude/project-thread-yj9o4d`，CI 绿）。
   - 先 rebase 到 main。`f878c43bb` 之后又落了约 15 个 `changes/*.md` 片段：跑 `pnpm changelog:fold`，把新条目整理进 `CHANGELOG.md` 和 `CHANGELOG.zh.md` 的 1.5.0 段（中英文顺序和链接一致），删除片段，跑 `pnpm changelog:check` 和 prettier，`git push --force-with-lease`。
   - Vain 合并。
2. **https://github.com/BotHarness/DeepSeekBot/pull/2546 （草稿，issue https://github.com/BotHarness/DeepSeekBot/issues/2541 ）**：Connect 拒绝在手机上输入密钥，并下线手机端完整客户端（WebView）。完成转正式或明确放弃。
3. **https://github.com/BotHarness/DeepSeekBot/pull/2547 （草稿，issue https://github.com/BotHarness/DeepSeekBot/issues/2542 ）**：已配对设备流量用固定公钥的 Noise XK 加密。依赖 2546 之后再合，避免冲突。是否赶 1.5.0 由 Vain 决定；不赶就移出闸门。
4. **还没有 PR 的 issue**
   - https://github.com/BotHarness/DeepSeekBot/issues/2519 滑动行操作（置顶 / 分组 / 静音；边缘滑动仍要打开抽屉）。Codex 在做。
   - https://github.com/BotHarness/DeepSeekBot/issues/2521 首条私聊回复空白 / 没滚到输入框上方。先在 main 上复现（loopback 或 Tailscale），复现不了就录屏关闭。

已处理：https://github.com/BotHarness/DeepSeekBot/pull/2533 已关闭，被已合并的 https://github.com/BotHarness/DeepSeekBot/pull/2538 取代。

Codex 负责：桌面端 Track 1–4，以及 https://github.com/BotHarness/DeepSeekBot/issues/2517 、https://github.com/BotHarness/DeepSeekBot/issues/2518 、https://github.com/BotHarness/DeepSeekBot/issues/2519 。接手时先看这几项状态，别重复做。

## 不在闸门里、但还开着的

- https://github.com/BotHarness/DeepSeekBot/issues/2498 配对后弹窗一直转圈（XS Max 上见过，强退重开可绕过）。
- https://github.com/BotHarness/DeepSeekBot/issues/2515 私聊空白直到重启 Host，无频道日志。
- https://github.com/BotHarness/DeepSeekBot/issues/2368 自动拒绝卡片：等 Vain 回复。
- https://github.com/BotHarness/DeepSeekBot/pull/2544 README 加 Open Source Alternatives 徽章（文档，可随时合）。
- Connect 子 issue：https://github.com/BotHarness/DeepSeekBot/issues/2520 、https://github.com/BotHarness/DeepSeekBot/issues/2522 、https://github.com/BotHarness/DeepSeekBot/issues/2523 、https://github.com/BotHarness/DeepSeekBot/issues/2524 、https://github.com/BotHarness/DeepSeekBot/issues/2526 、https://github.com/BotHarness/DeepSeekBot/issues/2098 。
- 官网隐私页草稿 https://github.com/BotHarness/deepseekbot-site/pull/128 ：1.5.0 发布后再合。
- [#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845) iOS 120 FPS 后续：https://github.com/BotHarness/DeepSeekBot/issues/2476 、https://github.com/BotHarness/DeepSeekBot/issues/2477 、https://github.com/BotHarness/DeepSeekBot/issues/2478 、https://github.com/BotHarness/DeepSeekBot/issues/2479 （要 ProMotion 手机）、https://github.com/BotHarness/DeepSeekBot/issues/2480 、https://github.com/BotHarness/DeepSeekBot/issues/2482 。可直接粘贴的任务说明见 [source/1845-paste-ready-handoffs.md](source/1845-paste-ready-handoffs.md)。不阻塞发版。
- 很老的草稿 PR（[#1942](https://github.com/BotHarness/DeepSeekBot/issues/1942) 等 Beta 相关、[#2176](https://github.com/BotHarness/DeepSeekBot/issues/2176)、[#2255](https://github.com/BotHarness/DeepSeekBot/issues/2255) 等）不在本轮范围，别顺手合。

## 闸门清空后

1. 拉最新 main，记下 commit SHA，后面所有包和验收都用这一个 SHA。
2. 每个平台只打一次包（交接 2、3），跑交接 4 的验收。
3. 验收中发现的问题：小修直接开 PR；大问题开 issue，标明是否阻塞发布。

## 桌面端 1.5.0 发版（npm）

现在 npm 上是 1.4.1，什么都还没打 tag。

1. [#2433](https://github.com/BotHarness/DeepSeekBot/issues/2433) 合并后，**Vain 明确同意**，在 main 的合并 commit 上打 `v1.5.0` 并推送。这会触发 `.github/workflows/npm-release.yml`（准备 → 在 DSH 0.2.0-rc.2 和 0.2.1-rc.2 上做全新 Profile 安装 → npm publish）。这是 `@botharness/cloudflared-<platform>` 包第一次发布。**发布不可撤销。**
2. 起草 GitHub Release：
   ```
   pnpm release:draft -- --artifact deepseekbot --version 1.5.0 --tag v1.5.0 --github-release-version 1.5.0 --installable-version 1.5.0 --comparison-url https://github.com/BotHarness/DeepSeekBot/compare/v1.4.1...v1.5.0
   ```
3. 后续 PR：`scripts/install-release.json` 改到 1.5.0，跑 `pnpm install:sync` 和 `pnpm install:check`。
4. 合并官网 https://github.com/BotHarness/deepseekbot-site/pull/128 。

手机 App 版本号独立，不跟 npm 走。详情：[source/v1.5.0-handoff.md](source/v1.5.0-handoff.md)。

## Connect 服务端（已上线，只需确认）

- 中继 `connect.botharness.ai` 已从 main `11174d7` 部署，D1 migration 0002 已执行，`WORKOS_API_KEY` 已设置。
- 待确认：Vain Mac 上共享的 Prod Host（tunnel `ha76sc42lh6tm`）是否已登出。跑 `deepseekbot connect-status`，并在 Cloudflare 里看还有没有 `dsb-` 开头的 tunnel。
