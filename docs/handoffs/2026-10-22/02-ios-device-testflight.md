# 交接 2：iOS 真机测试 + TestFlight 发布

仓库 https://github.com/BotHarness/DeepSeekBot ，App 在 `apps/mobile`（Expo / React Native）。先读 `apps/mobile/AGENTS.md`、`apps/mobile/README.md` 的「TestFlight and Google Play test builds」一节、`apps/mobile/DESIGN.md`。

前提：交接 1 的闸门已清空，用同一个 main SHA。

## 现状

- App：**DeepSeekBot**，bundle id `app.deepseekbot.mobile`，EAS owner `deepseekbots-team`，App Store Connect app id `6823306258`（`apps/mobile/eas.json`）。
- TestFlight：外部测试组「Beta Users」+ 6 位测试者。**构建 8** 已在 2026-10-21 提交外部 Beta 审核；审核备注和「测试内容」已附安装指南 https://deepseekbot.app/en/docs/mobile-app/ （中文 https://deepseekbot.app/docs/mobile-app/ ）。审核结果未确认：先在 App Store Connect 看构建 8 的状态。
- 隐私问卷答案在 `apps/mobile/store/privacy/`，公开政策 https://deepseekbot.app/en/privacy/#mobile-app 。
- 设备：Vain 的 iPhone XS Max（iOS 18，dev 签名 Release 包），Mac 上 iOS 27 Simulator（"QA iOS 27 Fresh" 等）。Mac 路径 `/Users/doodlebear/Documents/code/BotHarness`。
- 已经 PASS（结果贴在各 PR）：https://github.com/BotHarness/DeepSeekBot/pull/2486 、https://github.com/BotHarness/DeepSeekBot/issues/2490 、https://github.com/BotHarness/DeepSeekBot/issues/2488 、https://github.com/BotHarness/DeepSeekBot/issues/2466 （XS Max）、https://github.com/BotHarness/DeepSeekBot/issues/2487 浅深色、锁屏推送、Connect 账号配对、https://github.com/BotHarness/DeepSeekBot/issues/2512 检查 1（中文）。截图分支：`claude/main-batch2-ios-shots`、`claude/main-batch-f878c43b-ios-shots`、`claude/connect-account-ios-shots`。

## 第一步：打包（每种各一次）

在 `apps/mobile` 下：

```
# 避免 EAS 上传 1GB+ 的 .git
export EAS_NO_VCS=1 EAS_PROJECT_ROOT=../..
npx eas-cli build:version:get -p ios -e store-test     # 和 App Store Connect 对一下构建号
npx eas-cli build --profile store-test --platform ios   # 先不 --auto-submit，等验收通过
```

另外打：

- iOS Simulator 的 store Release（Simulator 验收用，见交接 4 第 1、5 轮）；
- XS Max 的 dev 签名 Release（`pnpm --filter @botharness/mobile ios` 用 Xcode，Release 配置）。

## 第二步：真机检查（XS Max + Simulator）

用 loopback Host，除非写明用 Connect。每项浅色 + 深色截图，存 `.github/pr-screenshots/<issue>/`，结果贴回对应 PR / issue。

1. **首次使用 / 配对**（https://github.com/BotHarness/DeepSeekBot/pull/2402 、https://github.com/BotHarness/DeepSeekBot/pull/2512 ）
   - 全新安装：主页显示「No computer paired yet」，选择页自动打开；英文还没测（中文已过）。
   - 账号页登录并配对；Tailscale 页用二维码（只能真机，Simulator 没摄像头）、粘贴链接、`deepseekbot://pair?p=` 深链各配一次。
   - 关掉选择页后按钮能重新打开；抽屉里的配对入口打开同一个选择页且指南折叠；抽屉里账号电脑行（`/pair?account=ID`，https://github.com/BotHarness/DeepSeekBot/pull/2509 ）能配对。
   - 除非 `EXPO_PUBLIC_DEEPSEEKBOT_CLOUD=on`，云端 UI 都隐藏（store 包是 off）。
   - 代码：`apps/mobile/app/pair/{index,account,tailscale}.tsx`、`src/ui/shell/use-pairing.ts`。
2. **私聊滚动**（https://github.com/BotHarness/DeepSeekBot/pull/2510 、https://github.com/BotHarness/DeepSeekBot/pull/2514 ，需 main ≥ `50df2a3a`）——**录屏**
   - 新私聊、键盘弹起，先发短消息再发长消息：工作行一直在问题下面，从不空白，回复滚到输入框上方。都通过就关闭 https://github.com/BotHarness/DeepSeekBot/issues/2521 。
   - 冷启动打开 50+ 条消息的会话：直接落在最新，无可见滚动，顶部无转圈；往上滑才加载历史。
   - 工作行能随列表滚走。
3. **下拉刷新**（https://github.com/BotHarness/DeepSeekBot/pull/2516 ）：Chats 和 Activity。
4. **标题栏**（https://github.com/BotHarness/DeepSeekBot/pull/2487 / https://github.com/BotHarness/DeepSeekBot/pull/2502 、https://github.com/BotHarness/DeepSeekBot/pull/2513 ）
   - AX5 最大字号下 Chats 和 Activity（带筛选）不截断。
   - XS Max（iOS 18）：返回、标题 chip、电脑按钮的「岛」不透明，深色下 chip 文字可读，标题后面不透出消息文字。
5. **滑动操作**（https://github.com/BotHarness/DeepSeekBot/issues/2519 ，PR 合并后）：置顶、分组、静音；左边缘仍打开抽屉。
6. **两台手机新设备推送与移除**（https://github.com/BotHarness/DeepSeekBot/issues/2524 ）和删除账号：和 Android 一起做，见交接 4 第 4 轮。

已知问题：配对后弹窗可能一直转圈（https://github.com/BotHarness/DeepSeekBot/issues/2498 ），强退重开；重试会用掉配对链接。保留 XS Max 上名为「测试」的 QA Host 配对。

更细的 Simulator / XS Max 设置和端口：[source/pending-acceptance-checks.md](source/pending-acceptance-checks.md)。

## 第三步：发 TestFlight

1. 验收全过、闸门里的修复都在包里后，提交：
   ```
   npx eas-cli submit --profile store-test --platform ios --latest
   ```
   （或第一步直接加 `--auto-submit`。）
2. App Store Connect → TestFlight：给新构建填「测试内容」（沿用构建 8 的文字 + 安装指南链接），加到「Beta Users」组。
3. 外部测试新构建可能要再审核。**提交审核前让 Vain 确认。**
4. 审核通过后通知测试者；在 https://github.com/BotHarness/DeepSeekBot/issues 里记录构建号和 main SHA。

## 可选：[#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845) iOS 流式 120 FPS

不阻塞发版。现在边流式边滑每 75 秒有 32–48 次卡顿。后续 issue：https://github.com/BotHarness/DeepSeekBot/issues/2476 、https://github.com/BotHarness/DeepSeekBot/issues/2477 、https://github.com/BotHarness/DeepSeekBot/issues/2478 、https://github.com/BotHarness/DeepSeekBot/issues/2479 、https://github.com/BotHarness/DeepSeekBot/issues/2480 、https://github.com/BotHarness/DeepSeekBot/issues/2482 。任务说明可直接粘贴：[source/1845-paste-ready-handoffs.md](source/1845-paste-ready-handoffs.md)；测量脚本在 Mac 的 `/Users/doodlebear/Documents/code/DeepSeekBot-1845/.humanlayer/tasks/1845/xs/`。总结：[source/1845-handoff-final.md](source/1845-handoff-final.md)。
