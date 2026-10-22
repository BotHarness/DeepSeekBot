# 交接 4：合并后整体验收 + 功能介绍截图

仓库 https://github.com/BotHarness/DeepSeekBot 。前提：交接 1 的闸门已清空。全程只用**一个** main SHA，每个平台只打一次包（交接 2、3）。

完整原始计划：[source/combined-acceptance-plan.md](source/combined-acceptance-plan.md)；设备设置（Simulator、XS Max、端口）：[source/pending-acceptance-checks.md](source/pending-acceptance-checks.md)。

## 已合并、只差真机验收的

https://github.com/BotHarness/DeepSeekBot/pull/2402 、https://github.com/BotHarness/DeepSeekBot/issues/2487 、https://github.com/BotHarness/DeepSeekBot/issues/2502 、https://github.com/BotHarness/DeepSeekBot/issues/2508 、https://github.com/BotHarness/DeepSeekBot/issues/2510 、https://github.com/BotHarness/DeepSeekBot/issues/2512 、https://github.com/BotHarness/DeepSeekBot/issues/2513 、https://github.com/BotHarness/DeepSeekBot/issues/2514 、https://github.com/BotHarness/DeepSeekBot/issues/2516 。闸门清空后还要加上 [#2519](https://github.com/BotHarness/DeepSeekBot/issues/2519)、[#2546](https://github.com/BotHarness/DeepSeekBot/issues/2546)、[#2547](https://github.com/BotHarness/DeepSeekBot/issues/2547) 的内容。

## 第 1 轮：iOS 27 Simulator（不需要 Vain 动手）

用 loopback Host。对应细节见交接 2 第二步。

1. 全新安装（"QA iOS 27 Fresh"）：首次使用流程，中英文 × 浅深色。截图存 `.github/pr-screenshots/2512-pair/`。
2. 配对后：抽屉配对入口（指南折叠）、All 行和 Host 行能筛选列表、标题图标和颜色、账号行打开 `/pair/account?account=…`、iOS 边缘滑动打开抽屉（https://github.com/BotHarness/DeepSeekBot/issues/2518 ）。
3. 滑动操作（https://github.com/BotHarness/DeepSeekBot/issues/2519 ）。
4. AX5 标题栏（[#2487](https://github.com/BotHarness/DeepSeekBot/issues/2487) / [#2502](https://github.com/BotHarness/DeepSeekBot/issues/2502)）。
5. 新私聊录屏（[#2510](https://github.com/BotHarness/DeepSeekBot/issues/2510)、https://github.com/BotHarness/DeepSeekBot/issues/2521 ）——通过就关 [#2521](https://github.com/BotHarness/DeepSeekBot/issues/2521)。
6. 冷启动 50+ 条会话录屏（[#2514](https://github.com/BotHarness/DeepSeekBot/issues/2514)）。
7. Chats 和 Activity 下拉刷新（[#2516](https://github.com/BotHarness/DeepSeekBot/issues/2516)）。

## 第 2 轮：桌面 Web（Playwright，不需要 Vain）

两台 Host 的测试环境（如 `laptop`:47011 配对 `studio-mac`:47012），浅深色。

1. https://github.com/BotHarness/DeepSeekBot/pull/2508 Host 条、添加远程、改图标 / 移除。
2. 远程 Host Track 1–3、5（https://github.com/BotHarness/DeepSeekBot/pull/2538 ）：远程头像、活动圈和未读、Activity Center 里的「远程」项可直接审批 / 回答、完整消息渲染（图片、文件、审批 / 提问 / 密钥卡片）。
3. Track 4：页面打开时，远程需要注意的事项弹 Notification API 提醒。
4. https://github.com/BotHarness/DeepSeekBot/issues/2098 / https://github.com/BotHarness/DeepSeekBot/pull/2528 ：CLI 列设备、创建邀请、撤销；设备 UI 一致。
5. https://github.com/BotHarness/DeepSeekBot/issues/2526 / https://github.com/BotHarness/DeepSeekBot/pull/2529 ：隔离 Host 登录一次性账号再删除，`deepseekbot connect-status` 在规定时间内退出 Connected，`cloudflared` 进程消失。

## 第 3 轮：Android（Windows，一次做完）

见交接 3 第二步 1–6。

## 第 4 轮：两台真机一起（Vain 一次拿起两台手机）

1. **XS Max 标题栏**（https://github.com/BotHarness/DeepSeekBot/pull/2513 ）：岛不透明，深色可读，标题后不透字。
2. **新设备推送与移除**（https://github.com/BotHarness/DeepSeekBot/issues/2524 ，详细步骤 https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6319649111 ），在 Prod Connect 上：
   - Prod Host 用一次性 Apple 隐藏邮箱账号（`t4dp…@privaterelay.appleid.com`）登录，**在浏览器无痕窗口里**登录。
   - Android = 手机 A，XS Max = 手机 B。A 先通过账号配对，然后 B。
   - 一分钟内 A 收到「New device paired」，点 **Remove**；B 显示「Your computer refused this app」；Host 设置 → 设备里 B 显示已撤销。
   - XS Max 转圈（[#2498](https://github.com/BotHarness/DeepSeekBot/issues/2498)）就强退重开；保留「测试」QA 配对。包里没有 [#2525](https://github.com/BotHarness/DeepSeekBot/issues/2525) 就先清 Chrome 的 `*.authkit.app`、workos.com 站点数据。
   - 前提：store 包里的 EAS 推送凭据可用（还没验证过）。
   - 脱敏截图贴到 [#2524](https://github.com/BotHarness/DeepSeekBot/issues/2524)，通过后关闭。
3. **删除测试账号**（最后做，**需 Vain 同意**）：在手机里用 App 内「删除账号」删掉同一个一次性账号；Host 约 60 秒内退出 Connected，`cloudflared` 停止（[#2526](https://github.com/BotHarness/DeepSeekBot/issues/2526) / [#2529](https://github.com/BotHarness/DeepSeekBot/issues/2529)）。

## 第 5 轮：功能介绍截图（iOS 27 Simulator，端到端）

Vain 会把这些原始截图用 ChatGPT 生图做成功能介绍图。

**场景一：按三篇博客模拟群聊**（Bot 用最新 DeepSeek 模型，真实对话，不要手写假消息）

- Blue Archive 角色扮演（Soul 设定）：https://deepseekbot.app/blog/blue-archive-ai-roleplay-soul/
- 多 Bot 群体写作流程：https://deepseekbot.app/blog/ai-bot-group-writing-workflow/
- AI 陪伴记住偏好：https://deepseekbot.app/blog/ai-companion-preference-memory/

先读博客，按文中的 Bot 设定、群成员和对话走向建群，跑到有代表性的画面再截。

**场景二：日常功能，每项 1–2 张**

- 审批卡片、回答 Bot 的提问
- Activity 里等待你处理的事项
- 定时任务（详情页 + 一次运行）
- 远程 Host（抽屉视图 + 一个远程会话）
- Computer 和 Browser 查看器
- 记忆（Bot 记住了一个偏好）
- 通过账号或 Tailscale 配对
- 会话里的图片和文件

**规则**

- 不截 WebView 完整客户端（要下线），每张都是原生界面。
- Simulator 原始截图（`xcrun simctl io <udid> screenshot`），不加框不裁剪，浅色 + 深色各一张。
- 存到 Vain Mac 本地文件夹。开始前问 Vain 用哪个；可选 `/Users/doodlebear/Movies/BotHarness` 或 `/Users/doodlebear/Documents/code/BotHarness`。建议子目录 `feature-shots-<日期>/<场景>/<名称>-{light,dark}.png`。
- 遮掉真实电脑名、路径和个人信息（或用演示名称建环境）。

## 收尾

- 每项结果贴回对应 PR / issue；通过的 issue（[#2521](https://github.com/BotHarness/DeepSeekBot/issues/2521)、[#2524](https://github.com/BotHarness/DeepSeekBot/issues/2524)）关闭。
- 失败项：小修开 PR，重新打包只在修复全部合并后做一次，然后只复测受影响的项。
- 全部通过后进入交接 2、3 的「发布」步骤，以及交接 1 的 npm 1.5.0 发版。
