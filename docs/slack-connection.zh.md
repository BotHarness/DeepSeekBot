# 连接 Slack

将 PersonaBot 接入 Slack：配置应用、本机连接、把应用绑定到 Bot。绑定后，在应用所在的频道里 @ 它，消息会进入这个 Bot 的收件箱，Bot 在原 Slack 话题回复。不需要逐个授权频道。

## 先区分三个设置

| 设置        | 位置                                                 | 作用                                                                   |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| IM 应用连接 | 设置 → IM机器人 → Slack（总览：设置 → IM 应用）      | 让本机连接一个 Slack 应用机器人                                        |
| 外部身份    | Bot 私聊 → Channel sidebar → 外部身份 → **绑定应用** | 把应用绑定到这个 Bot，并管理它的会话：静音、规则、屏蔽、同步到 Channel |
| 外部连接器  | Bot 私聊 → Channel sidebar → 外部连接器              | 高级：修改 Channel 同步与保存的发送目标                                |

Bot 能在哪里发言由 Slack 决定：应用被邀请进了哪些频道、安装了哪些权限。绑定应用不会把外部消息镜像到本地 DM；一个应用只属于一个 Bot。

## 1. 准备环境

### 经审核的普通私聊配对（#1415）

#1415 源码候选在 **Bot 私聊 → Channel sidebar → IM 角色与配对** 中复用 Slack 私聊审核。启用 **Lark 聊天与 Slack 私聊请求必须经过配对**，创建普通角色，再让未知人员私聊已绑定应用。第一条消息只产生固定审核提示和不含旧指令的申请；在 **申请** 中选择已有角色并批准。固定通知要求重新提问，只有新的私聊进入模型。**人员** 显示当前角色并支持撤销；撤销后新消息必须重新审核才能启动模型。

限制按 Bot 生效，默认关闭。之前已为 Lark 启用的限制在此候选中也覆盖 Slack 私聊。配对限定当前 Bot／App／Binding 与经验证的 Workspace 人员，重启后保留，重新绑定不继承。Role／Group 行为文字是 prompt 策略，不是邮件、文件或 Shell 的强制权限。Slack 群配对和原生管理控件仍独立推进；此预览中的 `/pair` 不创建 Slack 管理授权。

隔离源码候选已完成真实 Slack 申请 → Web 选择 Role 并批准 → 通知重问 → 新问题原 App 回复 → 撤销 → 重启检查，来源事件、Admission 和 Outbox 与实际回复一致；Human 已接受这轮交互。下方既有 Provider 收发／反应截图只证明各自原有范围。使用独立 App，并明确协调独占接收窗口；若依赖新限制，回退旧代码前应停用对应 Slack Binding。详见 [ADR-0174](adr/0174-slack-dm-chat-pairing-reuses-current-binding-authority.md)。

![未知人员的真实 Slack 私聊收到固定等待审核提示](/guides/slack/16-dm-pending-notice.png)

_第一条私聊只创建审核申请，不执行其中的指令。_

![真实 Web 申请页显示 Slack 申请人，并已选中普通 Role](/guides/slack/15-dm-role-review.png)

_在 Bot 私聊侧栏打开 **IM 角色与配对 → 申请**，必要时刷新，核对申请人与接收 App，再选择已有 Role。**批准此角色** 只发送固定重新提问通知，不执行第一条指令。_

![真实 Slack 配对人员具有普通 Role，管理能力为空](/guides/slack/18-dm-approved-person.png)

_当前配对人员显示在 **人员** 页。普通聊天资格不会自动授予管理权限；本次测试 Role 没有管理能力。_

![真实批准通知之后的新 Slack 问题获得回复](/guides/slack/17-dm-fresh-answer.png)

_只有新问题执行：原私聊返回 9797、当前 Role 和空管理能力，回复与隔离 Host 的来源事件、已处理 Admission 和已接受 Outbox 一致。三个只读目录也已核对：有效配对人员、已知外部会话、本会话观察过的配对人员；最后一个不是完整或当前成员名单。_

![真实撤销及重启后的 Slack 问题只收到申请提示](/guides/slack/19-dm-revoke-restart.png)

_通过 **人员 → 撤销授权** 取消普通聊天资格。下一条问题只创建申请，不执行；重启同一 Profile 后仍保留拦截。重新批准也须重新提问，不回放已拦截的消息。该源码候选证据不代表 npm 产品已发布，也不验证 Slack 群或原生管理控件。_

复用独立测试 App 时，在交互终端运行 `node scripts/dev-im-test-apps.mjs setup slack`。三步向导把独立 Slack QA1／QA2／QA3 保存到 Lark 已使用的本机私密共享配置，保留既有 Lark 数据且不启动接收器；`list slack` 只显示元数据。详见[共享 QA 配置指南](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/agents/im-test-apps.md#reusable-slack-qa-apps)。

你需要一个允许安装应用的 Slack 工作区、创建应用的权限（或管理员协助），以及一个公共测试频道。在 BotHarness 中创建 Bot，先确认它能回答本地 DM，再测试 Slack。

使用包含已验证 IM Provider 的 BotHarness 产品。不要额外安装任意版本的 dsh-im，也不要为同一应用启动第二个收件实例。

**本指南对应已验证的源码预览，不代表 npm 产品已经发布。** 实测产品为 `0.0.0-test.868`，Provider 为 `4.32.0-botharness.3`，DSH 为 `0.2.0-rc.1`。需要自行构建时，按[产品安装说明](https://github.com/BotHarness/BotHarness/blob/43ca0c58f88dafa212fc56b64c8665f33c1472a1/docs/product-im-installation.md)对应版本操作。启动器的登录链接只在本机使用；沿用同一个 Profile 保留设置。

截图来自真实界面与 DoodleBear 工作区的专用「BotHarness Slack QA」应用。空表单和已连接状态分别说明；运行时截图来自已验收的 #868 产品，共享频道截图来自 #845。图片不包含令牌，可以打开查看原尺寸。

## 2. 创建 Slack 应用

1. 在 BotHarness 打开 **设置 → IM机器人 → Slack → 开始接入**。
2. 点击 **复制 Manifest**，再点击 **打开 Slack 创建页**。在 [Your Apps](https://api.slack.com/apps) 选择 **Create New App → From a manifest**，选择工作区、粘贴配置，核对应用名称、权限与事件后创建。组织可能要求管理员批准。
3. 保留本机接入表单；安装应用后再填写两种令牌。

![本机 Slack 接入向导：复制 Manifest、创建链接与空白双 Token 字段](/guides/slack/01-onboarding.webp)

_空表单说明入口与凭据填写位置，不是连接成功的证明。_

![Slack 创建应用对话框中的 From a manifest 选项](/guides/slack/02-create.webp)

_选择 From a manifest。这张截图停在创建之前；请使用自己的工作区与应用名称。_

Manifest 是起始配置，不是凭据。连接前，按下面的说明核对后台设置。Slack 的 [Manifest 文档](https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/)介绍了配置的应用方式。

### Socket Mode 与 App Token

进入应用的 **Socket Mode** 页面并开启。BotHarness 通过向外建立的 WebSocket 接收事件，不需要公开 Request URL，也不需要 Incoming Webhook。

在 **Basic Information → App-Level Tokens** 生成带 **`connections:write`** 的 App Token。保管好 `xapp-…` 值，填写在本机的 **App Token** 字段，不是 Bot Token。参见 Slack 的 [Socket Mode 指南](https://docs.slack.dev/apis/events-api/using-socket-mode/)。

![真实 Slack 应用的 Enable Socket Mode 已开启](/guides/slack/03-socket.webp)

_这是现有 QA 应用的配置状态，页面不展示 App Token。_

### Bot 权限与事件

测试**普通私聊配对**前，先核对以下 **Bot Token Scopes（机器人令牌权限）**：

| Bot 权限     | 用途                                                     |
| ------------ | -------------------------------------------------------- |
| `im:history` | 接收已订阅的 `message.im` 私聊消息事件                   |
| `im:read`    | 用 `conversations.info` 核对原始私聊；仅能接收事件还不够 |
| `chat:write` | 发送审核提示、重新提问通知和回复                         |
| `users:read` | 解析已验证发送者的显示名                                 |

启用 **Socket Mode**，App-level Token 包含 `connections:write`。在 **Event Subscriptions → Subscribe to bot events** 添加 **`message.im`**；在 **App Home** 启用 **Messages Tab**，并允许用户从此标签页发送消息。这几项需要分别配置：Bot 权限不会自动添加事件订阅或开启输入框。Slack 官方说明见 [`message.im` 及其 `im:history` 要求](https://docs.slack.dev/reference/events/message.im/)和[读取私聊信息的 `im:read`](https://docs.slack.dev/reference/scopes/im.read/)。

新增 Bot 权限后，点击 **Reinstall to your workspace**，核对授权内容并完成重新安装；确认已安装的 Bot Token 获得新权限后再重试。#1415 的 QA 配置原有 `im:history`，但缺少 `im:read`；补充后重新安装，原始私聊核对才通过。两种 Token 都只在本机保存。Slack App 权限负责让集成收发消息；Bot 的 **IM 角色与配对** 设置另外决定谁可以与这个 PersonaBot 聊天。

下方频道和文件权限用于其他功能，并非普通私聊配对必须全部申请。

![重新安装后真实 QA App 的 Bot 权限，包含 chat:write、im:history 和 im:read](/guides/slack/13-dm-bot-scopes.png)

![真实私聊权限与 users:read；User Token 权限仍为空](/guides/slack/14-dm-scope-detail.png)

_以上裁剪截图展示 QA App 的实际配置，也包含其原有可选权限；配置截图不代表配对运行验收通过，未展示 OAuth Token。_

进入 **OAuth & Permissions → Bot Token Scopes**，按用途核对：

| Bot 权限                    | 用途                                            |
| --------------------------- | ----------------------------------------------- |
| `app_mentions:read`         | 接收频道里 @应用机器人 的消息                   |
| `chat:write`                | 以应用 Bot 身份发送与回复                       |
| `channels:read`             | 查看公共频道信息，供授权选择                    |
| `users:read`                | 将发送者 ID 关联到姓名                          |
| `channels:history`          | 读取已授权公共频道上下文；配合订阅接收普通文本  |
| `files:read`、`files:write` | 读取带 @ 的来源文件并回传处理后的附件；按需开通 |

截图是已经批准的 QA 应用，包含可选文件权限。只申请场景所需权限。增加权限后，需要安装或重新安装到工作区，已授予的令牌才能使用这些权限。

![Bot 提及与公共频道信息权限](/guides/slack/04-scopes.webp)

![其余 Bot 权限，包括文件与用户信息读取；未申请 Human 用户权限](/guides/slack/05-scopes-detail.webp)

_这里是 Bot 权限。Human 登录或 User Token 权限不能替代应用机器人的授权。_

在 **Event Subscriptions** 开启事件，将 **`app_mention`** 加到 **Subscribe to bot events**。需要普通公共频道文本或话题跟进时，再添加 **`message.channels`**，保存订阅。开启 Socket Mode 后不需要 Request URL。

![真实事件订阅包含 app_mention 与 message.channels](/guides/slack/06-events.webp)

_权限决定允许访问什么；事件订阅决定 Slack 实时推送什么。BotHarness 仍按已授权频道与收件策略筛选。参见官方 [app_mention](https://docs.slack.dev/reference/events/app_mention/) 与 [message.channels](https://docs.slack.dev/reference/events/message.channels/) 说明。_

## 3. 安装应用并在本机连接

1. 在 Slack 后台选择 **Install App → Install to Workspace**，或 **OAuth & Permissions → Install/Reinstall to 工作区**。核对权限并完成组织要求的管理员批准。
2. 在 **OAuth & Permissions** 获取 **Bot User OAuth Token**（`xoxb-…`）。这是 **Bot Token**，用于已安装机器人的 API 操作；与建立 Socket Mode 连接的 `xapp-…` App Token 不同。
3. 回到本机表单，分别填入对应字段，点击 **验证并连接**。凭据保存在本机凭据服务；不要贴到聊天、Memory 或 Git。
4. 确认 **设置 → IM机器人 → Slack** 显示应用在线。通过 Slack 频道的应用集成，或 `/invite @应用名`，把机器人加入公共测试频道。

![已验证产品中的 Slack 应用在线状态](/guides/slack/07-connected.webp)

_这是 #868 实际安装产品的连接结果，不是填满表单的模拟图。参见 Slack 的[安装说明](https://docs.slack.dev/authentication/installing-with-oauth/)。_

## 4. 把应用绑定到 PersonaBot

打开 PersonaBot 的私聊，在右侧 **Channel sidebar** 展开 **外部身份**，点击 **+ 绑定应用**，选择已连接的 Slack 应用并确认。身份行显示「已就绪」后，在应用所在的频道里 @ 它，消息会直接进入这个 Bot 的收件箱，Bot 在同一话题回复。详见[外部身份](/zh/docs/channel-sidebar/external-identities)。

![绑定身份对话框：选择已经认证的 IM 账号](/guides/slack/08-bind.webp)

_本节图片为旧版 Profile 布局；现在绑定位于右侧侧栏的「外部身份」。_

![真实 Slack 绑定身份：状态、启用开关、编辑与解绑](/guides/slack/09-identity.webp)

每个频道在第一条被接收的消息到达后出现在应用的会话列表里。**新会话** 决定它自动接收（默认），还是先放在 **等待处理** 由你允许。在会话行上用 **静音**、**规则**、**屏蔽** 让频道安静、调整接收或拒绝它；**再次允许** 解除屏蔽，但不会补发错过的消息。

## 5. 验证 @ 收件与原话题回复

在已授权 Slack 频道里，从提及选择器选中实际应用，发送：

> @你的应用 请通过 bridge_reply 在这个 Slack 话题只回复 SLACK-OK，不要发本地 DM。

打开 PersonaBot 侧边栏的 **Bot 收件箱**，或活动中心，找到新来源并打开详情。核对 Slack 频道、原始发送者、接收身份与正文。「已处理」表示 Bot 已处理此来源，还需要到 Slack 检查实际回复。

![真实已处理 Slack 来源：原始发送人、接收身份与关联报告](/guides/slack/10-source.webp)

_这是 #868 实测中，Human 对此前 Slack 报告的跟进消息。本地路径为 Inbox-only，因此不会创建本地 DM 消息。_

![真实 Slack 话题中的产品安装与重启验收回复](/guides/slack/11-native.webp)

_模型在原 Slack 话题回复了 BH868-PRODUCT-OK 与 BH868-RESTART-OK。验证自己的安装时，请使用自己的测试口令；这些截图是指定 QA 应用的证据。_

再发一条不带 @ 的普通消息。仅收 @、且未显式跟进话题时，这条消息不应进入该 Bot 的 Inbox。回复一次不会自动跟进此话题的全部消息。

## 6. 可选：把频道同步到本地频道

Slack 消息默认只进入 Bot 收件箱，不占用本地 DM 历史。新建同步的方式正在重新设计：之后会在 **外部连接器** 里选择任意已连接应用的会话，流入 Channel。已有的同步继续有效。共享频道中的每个成员 Bot 保持各自的 唤醒策略。

![真实共享频道外部连接器表单：复用已经授权的 Slack 群](/guides/slack/12-connector.webp)

_这张 #845 截图为早期的连接器表单。已有的同步可在 **外部连接器** 中修改、暂停或移除。_

暂停同步会停止新收件，保留配置与历史。移除同步不会删除旧消息。身份启停与同步启停分别管理。

### 普通消息、汇总与话题跟进

先从 @消息开始。要收普通文本，先开通 `channels:history` 与 `message.channels`、安装变更后的权限，再在频道发一条普通测试消息并刷新。BotHarness 需要观察到实际普通消息投递，才会提供全量收件或话题跟进。

在频道会话行打开 **规则**，只为需要的频道自定义 **全部消息**，选择数量／时间汇总（例如 5 条或 30 秒），或安全排队的逐条唤醒。共享频道中的每个 Bot，通过自己的 Attention 设置决定何时处理。收件、唤醒、是否回复分别判断。

Bot 可以显式跟进或退出一个原生 Slack 话题；Human 可在 **话题跟进** 查看、覆盖。跟进话题中的无 @ 回复可以进入，其他话题沿用各自规则。Bot 也可按需读取有界频道历史、附近上下文或话题，通过续页继续读取；这些历史不会被当作新消息灌入 Inbox。

**Bot 设置 → Slack 默认设置** 管理默认收件、汇总和身份启用行为。频道的 **规则** 可继承或显式覆盖。全局修改作用于仍继承的配置及后续事件，不会创建账号、接收新频道或重放旧历史。

Slack 可以直接发往频道，所以永远不需要保存发送目标。**外部连接器 → 保存发送目标（高级）** 只作为不支持直接发往会话的应用的后备。

## 7. 可选：收到与已回答反馈

[#1161](https://github.com/BotHarness/DeepSeekBot/issues/1161) 候选使用可选的 checked Provider 能力；仅安装现有 Provider pin 不会开启它。隔离候选已完成真实频道和 DM 检查，包含原生截图、同源 DM 状态变化录屏及对应权威事实。Human QA 与已发布 Provider 的资格验证仍待完成；成功示例不能推断其他平台或所有失败路径。

使用兼容 Provider，并经批准安装 **Bot** 的 `reactions:write` 权限后：

- **👀** 仅在 Inbox Admission 提交后出现，不以 Socket Mode 投递成功为准。
- **✅** 仅在该来源的真实回复被平台接受后出现；随后应用移除自己在该原消息上的 👀，不操作其他人的反应或话题根消息。清理结果不确定时两种反应可能并存，不会自动重试。
- 静音及仅上下文消息不产生反馈。静默结束、委派、等待、无关输出、失败或结果不确定的回复不产生 ✅。这是应用反应，不是 Human 已读回执。
- 缺少能力或反应失败不会阻塞收件、模型执行或回复；重连、重启及之后补充权限不会重放历史反馈尝试。

权限变更需先批准并重新安装应用；Human 登录 Slack 不会授予 Bot 此权限。DM 测试还需确认应用已安装的 IM 权限、`message.im` 订阅，并发送新消息到已绑定应用的私聊。每个测试应用只运行一个接收器，使用专用测试频道，同时核对原始 Human 消息上的真实反应和对应 Inbox／Outbox 事实。

## 排查问题

| 现象                   | 检查与处理                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 验证／连接失败         | 核对 `xoxb-…` 与 `xapp-…` 字段、App Token 的 `connections:write`、工作区安装与 Socket Mode；两种令牌应来自同一应用。 |
| 在线但没有来源         | 确认机器人已加入公共频道，订阅 `app_mention`，使用真正 @；核对应用已绑定到这个 Bot，频道没有在等待处理、静音或屏蔽。 |
| 无法选择全部消息       | 核对 `message.channels` 与已安装的 `channels:history`；发送新的普通文本后刷新，确认真实投递。                        |
| 上下文／文件读取被拒绝 | 检查已安装权限与当前成员资格；批准权限变更后重新安装。文件处理还需要授权 Workspace。                                 |
| 来源已处理却没有回复   | 查看来源／Outbox 状态与原生话题。Bot 可能选择不回复，或自身身份／授权已失效；结果不确定的发送不会盲目重试。          |
| 需要重连或重启         | 保留同一个 Profile，同一应用只运行一个收件实例；恢复后验证新消息。重连不自动补收缺失历史。                           |

本指南涵盖已验证的 **公共频道** @消息、普通文本、有界上下文、原生话题跟进、显式共享频道投递、带 @ 文件处理和显式报告，以及上方有界源码候选的普通私聊配对。私有频道、Slack 群配对／原生管理控件、无 @ 文件分享收件、编辑／删除同步、工作区全局搜索、断线历史补收与定时晨报服务不在本次资格验证范围。Slack 的已读标记不是 BotHarness 收件证据。平台边界与后续适配流程见 [IM 接入指南](/zh/dev/guides/im-provider-integration/)。
