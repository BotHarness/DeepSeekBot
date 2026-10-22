# 交接 3：Android 真机测试 + Google Play 发布

仓库 https://github.com/BotHarness/DeepSeekBot ，App 在 `apps/mobile`。先读 `apps/mobile/AGENTS.md`、`apps/mobile/README.md` 的「TestFlight and Google Play test builds」一节、`apps/mobile/DESIGN.md`。

前提：交接 1 的闸门已清空，用同一个 main SHA。Android 在 Vain 的 **Windows 机器**（`D:\code\project\BotHarness`）上做。

## 现状

- App：**DeepSeekBot**，package `app.deepseekbot.mobile`。开发包 `ai.botharness.deepseekbot.dev`。
- Play Console：**封闭测试**审核已过，versionCode 6 已发布。versionCode 7 被 APK 用掉了。
- **versionCode 8** 已构建（main `f667ed42`，含 M3 导航、Android 推送、电脑图标，包里带 Firebase 配置）：EAS 构建 https://expo.dev/accounts/deepseekbots-team/projects/deepseekbot/builds/02cbcad8-7fba-40a7-8904-954f024933a3 ，文件在 Windows「下载」里 `deepseekbot-store-test-vc8.aab`。**还没上传**（等 Vain 在 Play Console「封闭测试 → 创建新的发布版本」点上传）。
- versionCode 8 不含 https://github.com/BotHarness/DeepSeekBot/pull/2483 （自动生成 SVG 头像的 Bot 通知头像空白），下一版带上。
- 正式版要求：封闭测试满 **12 位测试者 / 14 天**。目前邮件名单约 15 人。建议加 Google 群组当名单（Vain 自己建群组，例如 `deepseekbot-testers@googlegroups.com`，设为任何人可加入；在封闭测试轨道 → 测试人员 → Google 群组里填上）。
- Android M3 审查的 PR 都已合并（https://github.com/BotHarness/DeepSeekBot/pull/2348 、https://github.com/BotHarness/DeepSeekBot/issues/2350 、https://github.com/BotHarness/DeepSeekBot/issues/2351 ）。证据截图在分支 `claude/project-thread-m7tsnr-approvals`（不合并）。手机现状：干净，装着 Dev Release（`e1caf4f9`）和 store 版。

## 选择：用 vc8 还是从最新 main 重打

vc8 是 10-21 的 main，不含之后合并的修复（[#2483](https://github.com/BotHarness/DeepSeekBot/issues/2483)、[#2510](https://github.com/BotHarness/DeepSeekBot/issues/2510)、[#2514](https://github.com/BotHarness/DeepSeekBot/issues/2514)、[#2516](https://github.com/BotHarness/DeepSeekBot/issues/2516)、[#2525](https://github.com/BotHarness/DeepSeekBot/issues/2525) 等）。**建议直接从最新 main 重打 versionCode 9**，验收也用这一个包；vc8 不必再上传。若 Vain 想先让测试者用上，可以先传 vc8。

## 第一步：打包

在 `apps/mobile` 下（Windows）：

```
set EAS_NO_VCS=1
set EAS_PROJECT_ROOT=../..
npx eas-cli build:version:get -p android -e store-test    # 和 Play Console 对 versionCode
npx eas-cli build --profile store-test --platform android  # AAB
npx eas-cli build --profile store-test-apk --platform android  # 侧载用 APK（可选）
```

- 推送需要 EAS 文件环境变量 `GOOGLE_SERVICES_JSON` 和每个 package 的 FCM V1 service account key（`npx eas-cli credentials`）。本地 store 包：`DEEPSEEKBOT_APP_VARIANT=store`，`GOOGLE_SERVICES_JSON=D:\code\project\BotHarness\.secrets\google-services.json`。
- APK 用上传密钥签名，Play 会重签，所以两个版本互相覆盖前要先卸载。
- **store 包里的推送凭据还没在真机上验证过**，第二步第 5 项要确认。

## 第二步：真机检查

每项浅色 + 深色截图，遮掉状态栏、电脑名、路径、键盘联想。结果贴回对应 PR / issue。

1. **首次使用 / 配对**（https://github.com/BotHarness/DeepSeekBot/pull/2402 、https://github.com/BotHarness/DeepSeekBot/pull/2512 ）：没有电脑的 store 包，选择页和 iOS 一致；账号页、Tailscale 页（二维码、粘贴链接、`deepseekbot://pair?p=` 深链）、关掉后重开、抽屉入口、抽屉账号电脑行（https://github.com/BotHarness/DeepSeekBot/pull/2509 ）。
2. **登录选择**（https://github.com/BotHarness/DeepSeekBot/pull/2525 ）：登出后从配对页登录，必须让你选登录方式，不能直接复用 Chrome 的 Google 会话。若包里没有 [#2525](https://github.com/BotHarness/DeepSeekBot/issues/2525)，先清掉 Chrome 里 `*.authkit.app` 和 workos.com 的站点数据（https://github.com/BotHarness/DeepSeekBot/issues/2520 ）。
3. **私聊**（https://github.com/BotHarness/DeepSeekBot/pull/2510 、https://github.com/BotHarness/DeepSeekBot/pull/2514 ）——录屏：新私聊键盘弹起时发短 / 长消息；冷启动 50+ 条会话落在最新。
4. **M3 加载指示**（https://github.com/BotHarness/DeepSeekBot/pull/2516 ）：每个电脑标签页和 Activity 的下拉刷新显示 M3 指示器；不影响竖向滚动、标签页滑动、折叠工具栏、收起键盘。
5. **推送冒烟**：后台时，私聊、群回复、审批、密钥输入都以会话样式出现在「requests」频道，带头像和操作；处理过的会消失，未读私聊保留。
6. **其他**：https://github.com/BotHarness/DeepSeekBot/issues/2518 强调色跟随所选 Host 颜色（All 保持默认）；https://github.com/BotHarness/DeepSeekBot/issues/2519 滑动操作（合并后）；https://github.com/BotHarness/DeepSeekBot/pull/2487 最大字号复查。
7. **两台手机推送与移除**（https://github.com/BotHarness/DeepSeekBot/issues/2524 ）：Android 是手机 A，见交接 4 第 4 轮。

完整清单、手机设置、「按设计接受」的项：[source/android-real-device-handoff.md](source/android-real-device-handoff.md)。

## 第三步：发布到 Play

1. 首次 AAB 必须在 Play Console 手动上传（之后 API / `eas submit` 才能用，还需要 EAS 里的 Google service account key）。Play Console → 测试 → 封闭测试 → 创建新的发布版本 → 上传 AAB。
2. 填版本说明（中英），发布到**封闭测试轨道**，不要新建轨道（会重置 14 天计时）。可能要再审核。
3. 之后的版本可用：`npx eas-cli submit --profile store-test --platform android --latest`（`eas.json` 里默认提交到 internal 轨道、draft，要在 Play Console 推到封闭测试）。
4. 首次发布前确认 App content → Data safety 已按 `apps/mobile/store/privacy/README.md` 填好。
5. **发布前让 Vain 确认。** 满 12 人 / 14 天后才能申请正式版。
