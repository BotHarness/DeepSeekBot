# 手机首次回复回归检查

[English](mobile-first-reply.md)

本流程用于 [#2521](https://github.com/BotHarness/DeepSeekBot/issues/2521)：新 Bot 私信应始终可见，工作状态行位于用户消息下方；跟随底部时，回复应显示在输入框上方。浏览历史时，应保留用户的阅读位置。

## 确认基线

记录应用源码 SHA、原生安装包来源、Host SHA、设备与系统、明暗主题、系统字号和路由类别。先用模拟器的 loopback 或手机的 Tailscale HTTPS，地址和凭据只留在本地。Connect 请求成功或没有重连提示，都不能证明原生渲染正常。

main 已包含以下修复；诊断新回归前，应确认被测安装包包含它们：

| 症状                                   | 已有修复                                                                                                                                     | 仍需原生观察                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 短私信的工作状态行出现在用户消息上方   | [#2510](https://github.com/BotHarness/DeepSeekBot/pull/2510)，`72794500f1ed`：限制初始滚动偏移尚未更新时的浮层位移                           | 首次原生滚动事件前、键盘打开时的实际边界 |
| 首条消息后私信空白；短回复被输入框挡住 | [#2490](https://github.com/BotHarness/DeepSeekBot/pull/2490)，`3d09057811ae`：保留空列表可见状态，发送时显示列表，仅浏览历史时保持可见行位置 | 列表透明度、原生位置保持行为及输入框遮挡 |
| 打开历史后一路追到底部或自动加载旧消息 | [#2514](https://github.com/BotHarness/DeepSeekBot/pull/2514)，`50df2a3a9c81`：等待布局稳定，用户拖动后才允许加载旧消息                       | 原生分批布局和初始滚动行为               |

[#2484](https://github.com/BotHarness/DeepSeekBot/pull/2484) 回退了 [#2463](https://github.com/BotHarness/DeepSeekBot/pull/2463) 的 iOS 分块 Markdown。长回复中的 Markdown 短暂空白，与首次私信后整个列表隐藏是不同问题。[#2515](https://github.com/BotHarness/DeepSeekBot/issues/2515) 记录了长时间运行的 Host 下私信内容缺失；不要把未收到时间线误判为透明度问题。

## 源码回归检查

```sh
pnpm exec vitest run apps/mobile/test/conversation-streaming-rows.test.tsx apps/mobile/test/follow-latest-gestures.test.tsx apps/mobile/test/follow-latest.test.tsx --maxWorkers=2
```

组件测试挂载真实的 `ConversationScreen` 和 `useFollowLatest`，在时间线和原生列表边界注入数据，覆盖空私信 → 发送 → 用户消息 → 工作状态 → 流式回复 → 提交，并让工作状态晚于提交结束。另一用例从其他客户端收到首条消息，不触发本地发送或尺寸变化。断言检查消息顺序、列表可见性、独立的工作状态浮层、内容增长后的滚动请求，以及浏览历史后的保持与恢复。

短对话维持最小高度时，测试故意不发送内容尺寸事件；超出视口后才提供增长尺寸。hook 测试覆盖分批布局、拖动与惯性滚动归属及稳定过程；纯函数测试覆盖初始偏移未更新的状态。这些测试**不能**验证原生 Markdown、UI 线程的 Reanimated、键盘遮挡、传输链路或设备上的修复效果。

## 排队执行原生验收

遵循[共享设备 QA](device-qa.md)和 [Windows Android QA](android-device-qa.md)。提交准确 head 的请求，只有指定 runner 才能启动设备、构建、Metro 或 QA Host。先与[已有 iOS 复现负责人](https://github.com/BotHarness/DeepSeekBot/issues/2521#issuecomment-6319419311)协调，避免重复 Mac 检查；无法确认 runner 不代表原任务已放弃。

1. 在分配的隔离 Host 中创建无历史消息的中性测试 Bot，确认非 Connect 路由和可用模型。打开私信前开始录屏。
2. 聚焦 `composer-input`，输入带唯一标记的简短问题，点击 `composer-send`。记录用户消息在前、工作状态在下、短回复（如 `42`）在输入框上方。持续录到提交及恢复空闲；不得出现整页空白或需要重新打开。
3. 换一个新 Bot，要求足够长的回复。停留底部时，流式增长及最终回复尾部应可见。打开键盘，输入多行草稿，关闭并重新打开键盘，确认草稿保留、发送按钮可达。
4. 再次生成长回复时向上拖动浏览历史。增长和提交不能抢走阅读位置。主动回到底部或点击跳到最新消息后，后续增长应恢复跟随。
5. 将屏幕上的用户消息及回复与 Host 的规范 Channel 时间线对应。失败时，**先**保存录屏、无障碍快照、边界和脱敏诊断，再重开或重启。区分消息是否到达、列表是否隐藏、是否仅 Markdown 空白、用户是否离开跟随状态。只有路由对比或投递证据支持时，才扩大到传输调查。

完整验收要求 iOS 模拟器、实体 iPhone 和 Android 的录屏及明暗截图。受影响的聊天和输入框还需遵循[系统字号验收](../../apps/mobile/DESIGN.md#system-text-and-large-text-acceptance)：默认、中等放大、最大字号及实时缩放。基线与 head 的截图状态应一致；设备不可用、模型请求失败、原生依赖兼容性未确认要分别说明。

每个用例记录**通过／失败／阻塞／未运行**，附准确源码、batch、安装包身份、操作、可见结果、规范 Host 事实和脱敏证据链接。源码测试、原生验收和人工 QA 分别报告；测试通过不足以关闭 #2521。
