# 收尾交接（2026-10-22）

Claude 这边不再继续做最后的整合、真机验收和 iOS/Android 发布。下面四份文档各自独立，可以直接整份贴给新的 session。

| #   | 文档                                                                     | 内容                                    | 谁要动手                               |
| --- | ------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------- |
| 1   | [01-integration-merge-order.md](01-integration-merge-order.md)           | 还开着的 PR、合并顺序、1.5.0 桌面端发版 | 新 session + Vain 点合并 / 打 tag      |
| 2   | [02-ios-device-testflight.md](02-ios-device-testflight.md)               | iOS 真机测试 + TestFlight 发布          | 新 session（Mac）+ Vain 拿 XS Max      |
| 3   | [03-android-device-play.md](03-android-device-play.md)                   | Android 真机测试 + Google Play 发布     | 新 session（Windows）+ Vain 上传 AAB   |
| 4   | [04-final-acceptance-screenshots.md](04-final-acceptance-screenshots.md) | 合并后的整体验收 + 功能介绍截图         | 新 session + Vain 两台手机同时在场一次 |

顺序：1 → （2、3 并行）→ 4。4 的第 5 轮截图可以和 2 的 Simulator 部分一起跑。

**按机器分：** 两台机器并行时，直接把 [MAC.md](MAC.md) 贴给 Mac 上的 session（整合、npm、iOS、截图），把 [WINDOWS.md](WINDOWS.md) 贴给 Windows 上的 session（Android + Play）。两份都写了共享的部分和依赖顺序。

## 各线程交接状态（截至 2026-10-22 04:15Z）

所有 Claude 线程都确认 **没有未提交或未推送的代码**。

| 线程                                                                    | 分支 / PR                                                                                                                                                                                                                                                                   | 剩余                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 合并后整体验收                                                          | 无代码；计划见 [source/combined-acceptance-plan.md](source/combined-acceptance-plan.md)                                                                                                                                                                                     | 见文档 1、4                       |
| 桌面端 1.5.0 发版                                                       | `claude/project-thread-yj9o4d`，https://github.com/BotHarness/DeepSeekBot/pull/2433 （CI 绿，可合并）                                                                                                                                                                       | 见文档 1                          |
| iOS TestFlight 首个测试包                                               | 无代码；构建 8 已于 10-21 提交外部 Beta 审核                                                                                                                                                                                                                                | 见文档 2                          |
| Google Play 首个内部测试包                                              | 无代码；versionCode 8 AAB 已构建，等 Vain 上传                                                                                                                                                                                                                              | 见文档 3                          |
| Android M3 审查                                                         | 全部合并（https://github.com/BotHarness/DeepSeekBot/pull/2348 、https://github.com/BotHarness/DeepSeekBot/issues/2350 、https://github.com/BotHarness/DeepSeekBot/issues/2351 ）；证据截图分支 `claude/project-thread-m7tsnr-approvals`（不合并）                           | 见文档 3                          |
| 手机 App 首次使用                                                       | 全部合并（https://github.com/BotHarness/DeepSeekBot/pull/2402 、https://github.com/BotHarness/DeepSeekBot/issues/2407 、https://github.com/BotHarness/DeepSeekBot/issues/2512 ）                                                                                            | 真机检查，见文档 2、3             |
| iOS 模拟器测试排队                                                      | 只有截图分支：`claude/main-batch2-ios-shots`、`claude/main-batch-f878c43b-ios-shots`、`claude/connect-account-ios-shots`                                                                                                                                                    | 见文档 2、4                       |
| DeepSeekBot Connect                                                     | 全部合并（https://github.com/BotHarness/DeepSeekBot/pull/2504 、https://github.com/BotHarness/DeepSeekBot/issues/2509 等）；官网草稿 https://github.com/BotHarness/deepseekbot-site/pull/128                                                                                | 见文档 1、4                       |
| 私聊流式 [#1845](https://github.com/BotHarness/DeepSeekBot/issues/1845) | `claude/project-thread-0gk1bi` 已全部合并（https://github.com/BotHarness/DeepSeekBot/issues/2484 、https://github.com/BotHarness/DeepSeekBot/issues/2486 、https://github.com/BotHarness/DeepSeekBot/issues/2510 、https://github.com/BotHarness/DeepSeekBot/issues/2514 ） | 真机检查 + 120 FPS 后续，见文档 2 |
| 两台真机新设备推送与移除                                                | 只做 QA，无分支：https://github.com/BotHarness/DeepSeekBot/issues/2524#issuecomment-6319649111                                                                                                                                                                              | 见文档 4 第 4 轮                  |

`source/` 里是各线程原始的详细交接文件（同时在项目共享文件夹 `/mnt/project-files/` 里），四份文档引用到细节时指向它们。

## 共同规则（每份文档都适用）

- 仓库：https://github.com/BotHarness/DeepSeekBot 。先读根目录 `AGENTS.md`。
- 真机 / 模型测试一律用最新的 DeepSeek 模型，不用上一代。
- UI 改动前先 rebase 到最新 main；移动端遵循 `apps/mobile/DESIGN.md`；UI PR 带浅色和深色截图。
- 新 UI / Bot 工具功能要在同一改动里带 `deepseekbot` CLI 命令（`pnpm lint` 会检查）。
- 截图里遮掉状态栏、电脑名、用户路径、键盘联想；不要打印 token。
- 不可撤销的操作（打 tag 发 npm、商店提交/发布、删除账号）要 Vain 明确同意。
