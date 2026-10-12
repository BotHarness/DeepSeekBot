# Channel sidebar

**Channel sidebar** 是 **Bot 模式**中的右侧栏。它跟随当前聊天：PersonaBot 私聊显示这个 Bot 的资源，本地群聊显示成员。聊天的配置在 **频道设置** 中。打开原生 DSH Session 后，你会进入另一套以会话为范围的界面。

本章使用 DSH **0.2.0-rc.1** 与公共包 **deepseekbot**。请先完成[安装](/zh/docs/installation)和 [API 与 Bot 模型配置](/zh/docs/model-setup)。

## 打开侧栏

1. 进入 **Bot 模式**，从左侧列表打开一个 Bot 私聊或本地群聊。
2. 右栏关闭时，点击右侧边缘的 **展开 Channel sidebar**。
3. 宽窗口中，点击侧栏顶部的标签页：**会话**（会话与 Bot 收件箱）、**记忆**（记忆文件与记忆演化），其他项目各占一个标签页；鼠标悬停图标可看到名称。窄窗口中侧栏以覆盖面板显示可折叠的项目，点击项目标题展开或收起。
4. 切换聊天后，查看对应 Bot 或群聊的资源。操作前先核对聊天顶部的名称。

![Bot 私聊右侧的 Channel sidebar](/guides/channel-sidebar/01-sidebar-overview-zh.webp)

## 按功能查看教程

| Bot 私聊中的项目                                             | 可以做什么                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [记忆文件](/zh/docs/channel-sidebar/memory-files)            | 浏览当前仓库文件树，在中间区域读取文件。                                      |
| [记忆演化](/zh/docs/channel-sidebar/memory-evolution)        | 查看未提交改动、Git 历史、分支与恢复检查点。                                  |
| [会话](/zh/docs/channel-sidebar/sessions)                    | 在 DSH 中打开这个 Bot 的 Orchestrator 与 Assignment Session。                 |
| [Bot 收件箱](/zh/docs/channel-sidebar/bot-inbox)             | 检查 Bot 收到的来源消息与任务报告。                                           |
| [工作区授权](/zh/docs/channel-sidebar/workspaces)            | 查看并明确授权这个 Bot 可以使用的 Host 文件夹。                               |
| [定时任务](/zh/docs/channel-sidebar/schedules)               | 按频率唤醒这个 Bot、立即运行某个任务，并锁定以防 Bot 修改。                   |
| [模型](/zh/docs/channel-sidebar/model)                       | 查看并修改这个 Bot 日常对话与新任务使用的模型。                               |
| [唤醒策略](/zh/docs/channel-sidebar/wake-policy) ¹           | 按来源设置这个 Bot 立即唤醒、汇总后唤醒或只记录。                             |
| [外部身份](/zh/docs/channel-sidebar/external-identities) ¹   | 绑定这个 Bot 在 Lark / 飞书、Slack、微信的发言身份；IM 管理员配对与审批通知。 |
| [外部连接器](/zh/docs/channel-sidebar/external-connectors) ¹ | 修改、暂停同步到 Channel 的会话；高级的保存发送目标。                         |

| 本地群聊中的项目                                             | 可以做什么                                        |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [成员与群管理](/zh/docs/channel-sidebar/groups) ¹            | 查看成员、邀请 Bot、处理入群申请和编辑群信息。    |
| [唤醒策略](/zh/docs/channel-sidebar/wake-policy) ¹           | 为每个成员 Bot 选择这个群里的普通消息如何唤醒它。 |
| [外部连接器](/zh/docs/channel-sidebar/external-connectors) ¹ | 接入、编辑和暂停同步进这个群的外部会话。          |

¹ 这是 **频道设置** 中的分区，不是侧栏项目。从聊天顶部的 **···** 菜单，或侧栏齿轮 **Channel sidebar 设置 → 频道设置…** 打开。群聊中「成员」仍在侧栏，「群管理」在频道设置中。

[显示与布局](/zh/docs/channel-sidebar/display)说明宽度、标签页、视图菜单、项目排序和各功能的显示选项；其他非 IM 参数见[设置指南](/zh/docs/settings)。

## 为什么看不到某个项目

Bot 专属项目不出现在群聊中；群管理不出现在 Bot 私聊中。Bot 收件箱在已有记录或正在加载、发生错误时显示。你也可能在 **+ 视图** 菜单中隐藏过某个标签页（或在窄窗口覆盖面板的 **编辑侧边栏** 中隐藏过某个项目）。唤醒策略、外部身份、外部连接器和群管理在频道设置中，不在侧栏。

可选插件可以增加其他项目。公共 npm 包不包含 Browser、Computer 包，所以没有对应入口是正常情况。安装并启用这些包后，分别按[分享浏览器标签页](/zh/docs/daily-browser)或 [Computer 导出与迁移](/zh/docs/computer-export)核对前提和操作。IM 应用连接另有独立的配置流程；连接后，由「外部身份」和「外部连接器」管理这个 Bot 如何使用它。
