# 参与贡献 DeepSeekBot

[English](CONTRIBUTING.md) | 中文

感谢你一起维护！文档、翻译、答疑、复现、测试、案例和代码都算贡献。第一次参与，不需要先理解整个架构。

## 选择入口

| 想做什么                   | 去哪里                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 安装、配置或使用时卡住     | [Q&A / 使用求助](https://github.com/BotHarness/DeepSeekBot/discussions/categories/q-a)                     |
| 讨论新能力或工作流痛点     | [Ideas / 想法建议](https://github.com/BotHarness/DeepSeekBot/discussions/categories/ideas)                 |
| 分享 Bot、集成、教程或实验 | [Show and tell / 作品分享](https://github.com/BotHarness/DeepSeekBot/discussions/categories/show-and-tell) |
| 报告有明确复现的 bug       | [提交 Issue](https://github.com/BotHarness/DeepSeekBot/issues/new/choose)，不必先开 Discussion             |
| 找第一次贡献的任务         | [贡献讨论帖](https://github.com/BotHarness/DeepSeekBot/discussions/1398)                                   |

欢迎中文和英文。支持与评审是异步、尽力而为的，没有保证的响应时间。请遵守[社区行为规范](CODE_OF_CONDUCT.md)。

## 从小改进开始

1. 浏览 [good first issue](https://github.com/BotHarness/DeepSeekBot/labels/good%20first%20issue) 和 [help wanted](https://github.com/BotHarness/DeepSeekBot/labels/help%20wanted)，或在贡献帖说明兴趣。
2. 先看最新评论、认领记录和已有 PR。标签不代表无人认领；有人在做时先协调。
3. 留言说明想做的一小部分。大功能先讨论范围；小的文档纠错可以直接提 PR。
4. 提交范围清楚、能验证的小改进，维护者可以在 Review 中一起收敛范围。

`good first issue` 表示适合新人，`help wanted` 表示希望外部帮忙。`ready-for-agent` / `ready-for-human` 表示执行准备状态，不表示难度或归属。

## 有用的 Issue

先搜索已有 Issue 和 Discussion。Bug 提供版本、环境、复现步骤、预期与实际、脱敏证据；不要求先定位源码，无法复现时说明限制。想法先讲场景、痛点和替代方案。工作明确后，把 Discussion、Issue 和 PR 互相链接，不在多处维护重复任务状态。

### 脱敏示例

以下内容仅为说明用占位示例，不代表实际观察到的 DeepSeekBot 缺陷：

```text
环境：[操作系统 / 应用版本 / 相关配置]
复现步骤：
1. [操作 1]
2. [操作 2]
预期结果：[预期结果]
实际结果：[实际观察到的结果]
脱敏证据：[如有，请提供已移除敏感信息的截图或日志片段]
```

请用可安全分享的信息替换占位内容。请从截图或日志中移除 API 密钥、令牌、登录 URL、个人信息及私人对话内容。报告可复现的缺陷前，无需先诊断源代码。

## 本地开发

工具链与检查命令以 [AGENTS.md](AGENTS.md#commands) 为准；从 [README 开发入口](README.md#docs) 和[隔离实例指南](docs/client-bridge.md#7-本地开发环路dsh-020-rc1) 开始。使用隔离 Profile，凭据留在本机，不操作其他贡献者正在运行的实例。

先跑相关检查，再按需要扩展。记录真实命令和结果，没跑或被阻塞的检查明确说明。避免无关重构和修改生成文件；涉及边界时再读[产品术语](CONTEXT.zh.md)和[架构](docs/architecture/botharness-architecture.md)。

### Expo / React Native App 贡献

修改手机端 UI 前，阅读[移动端开发指南](apps/mobile/AGENTS.md)和[系统字号与大字验收规范](apps/mobile/DESIGN.md#system-text-and-large-text-acceptance)。

- 通过共享组件遵循 iOS 语义动态字号与 Android 原生字体缩放。同时调整换行、行高、元信息、弹层和编辑空间；不要通过关闭缩放、缩小文字或全局限制字号掩盖布局问题。键盘展开时，核心内容和操作仍须可用。
- 对受影响流程，在两个平台分别检查默认、中等放大和最大系统字号，以及浅色、深色外观。使用真实系统设置，实际操作控件，验证切换字号后的草稿/查询保留和真实结果。记录准确档位/倍率及被阻塞、未运行的项目；一个平台通过不代表另一个平台通过。
- 原生 QA 先进入[共享设备队列](docs/agents/device-qa.md)。PR 附同条件、脱敏的原生前后截图，并确认可加载。源码测试、Web 预览、原生交互与 Human 验收分别记录。各类页面的交互矩阵和截图要求以该规范为准。

## PR 与评审

- 一个 PR 聚焦一件事，关联相关 Issue 和 Discussion。完成整个 Issue 才用 `Closes #...`，部分工作用 `Refs #...`。
- 说明为什么改、如何验证，按 PR 模板列真实检查与缺口。
- 可见 UI 或交互变化附脱敏、GitHub 可渲染的前后截图；无法捕获时说明具体阻塞与可运行的验收路径。见[视觉证据规范](docs/agents/pr-ui-visual-evidence.md)。
- 用户可见或独立有价值的公开文档变化遵循 [Release Ledger](docs/agents/changelog.md)，保持要求的中英对应。
- 欢迎 AI 辅助，提交者负责理解与验证。Coding agent 继续遵循现有[任务认领与交接规范](docs/agents/agent-work-trace.md)。
- 自动检查、真实运行、视觉证据和 Human QA 分开记录，不能相互替代。维护者负责评审和合并；提交 PR 不代表可以自动合并或部署。

## 持续参与与隐私

可以继续答疑、确认 bug、测试修复或评审文档，并告诉维护者愿意协助哪一部分。明确范围的维护职责需要协商，不会因参与自动授予合并、发布或生产访问权限。

不要公开密钥、登录链接、私人聊天、未脱敏日志或敏感漏洞细节。目前尚未公布私密举报渠道；请先只请求私下渠道，等待确认后再发送报告。此指南不启用 GitHub 私密漏洞报告，也不把公开帖子当作保密渠道。
