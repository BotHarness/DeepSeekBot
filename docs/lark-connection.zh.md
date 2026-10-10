# 连接 Lark / 飞书

先按 [图文安装教程](/zh/docs/installation) 安装插件，确认本地 Bot DM 正常后，再继续本页。

三步把一个 PersonaBot 接入 Lark：连接应用机器人、把它绑定到 Bot、发一条测试消息。绑定后，私聊这个应用、或在它所在的群里 @ 它，消息都会进入这个 Bot 的收件箱，Bot 在原会话回复。不需要保存投递目标，也不需要逐个授权会话。

本页以 **Lark 国际版、应用机器人、测试群** 为起点。飞书用户使用同样的配置顺序，但要选择飞书平台、使用飞书开放平台创建的应用。

## 先分清三个设置

| 设置        | 在哪里                                               | 决定什么                                                               |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| IM 应用连接 | 设置 → IM机器人 → 飞书（总览：设置 → IM 应用）       | 本机连接哪个 Lark / 飞书应用机器人                                     |
| 外部身份    | Bot 私聊 → Channel sidebar → 外部身份 → **绑定应用** | 把应用绑定到这个 Bot，并管理它的会话：静音、规则、屏蔽、同步到 Channel |
| 外部连接器  | Bot 私聊 → Channel sidebar → 外部连接器              | 高级：修改 Channel 同步，或为不能直接发往会话的应用保存发送目标        |

Bot 能在哪里发言由平台决定：应用被拉进了哪些群、发布了哪些权限。一个应用只属于一个 Bot，绑定不会把它借给其他 Bot。

本页结合真实界面入口与已完成 Lark 连接的测试 Profile。已连接截图来自 #823 验证的产品产物（`0.0.0-test.823.6` / Provider `4.32.0-botharness.2`）；测试群为「BotHarness IM QA #78」。空表单截图用于说明填写位置，不代表已完成连接。App Secret 不出现在媒体中。右键（手机长按）截图，可查看原图。

## 1. 准备可用环境

你需要：

- 已加入 Lark / 飞书组织，并有创建、发布企业自建应用的权限，或能请组织管理员协助。
- 一个用于验证的群，以及一个能在该群发送消息的 Human 账号。
- 已运行的 BotHarness、可用模型和一个 PersonaBot。先在本地 DM 中确认 Bot 能正常回复。
- 包含已验证 IM Provider 的 BotHarness 产品。产品把 Core、Client 与 Provider 一起安装；**不用另外安装 Lark SDK、Human lark-cli 或任意版本的 dsh-im**。

**公开 npm 产品尚未发布。** 当前可复现路径是构建本地产品包；不要把下面的测试版本当成 npm 安装命令。已有 #823 验证产物的用户直接启动同一 Profile，然后进入下一节。

<details>
<summary>当前源码预览：构建已验证的单次安装产品</summary>

使用 Node ≥22 与 pnpm 12.4.2。在新的目录中固定已验证版本，不在正在运行的 checkout 上切换分支：

```bash
git clone https://github.com/BotHarness/BotHarness.git botharness-lark
cd botharness-lark
git checkout c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7
git clone https://github.com/DoodleBears/dsh-im.git /tmp/bh-lark-provider
git -C /tmp/bh-lark-provider checkout 48e7a35792af5222cd40cfe1ba2607ac55a59df2
npm ci --prefix /tmp/bh-lark-provider --ignore-scripts --no-audit --no-fund
pnpm install --frozen-lockfile
pnpm build
node scripts/product-artifacts.mjs \
  --provider-source /tmp/bh-lark-provider \
  --output /tmp/bh-lark-product \
  --version 0.0.0-test.lark-guide
node scripts/dev-instance.mjs \
  --home "$HOME/.local/share/botharness-lark" \
  --port 32620 --product-artifacts /tmp/bh-lark-product
```

</details>

启动器输出的登录 URL 只在本机打开，不放进截图或视频。下次使用同一个 `--home`，保留账号、授权和消息记录；同一个应用只由一个 Host 接收事件。完整打包背景见 [产品安装说明](https://github.com/BotHarness/BotHarness/blob/c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7/docs/product-im-installation.md)。

## 操作视频：连接、授权、确认消息

以下是**真实界面截图的分步剪辑**，不是连续录屏或模拟连接成功。可暂停、拖动进度或打开中英文字幕；首次播放才下载视频。

<video controls preload="none" playsInline poster="/guides/lark/06-connected.webp" style={{width: '100%', maxHeight: '640px'}}>
<source src="/guides/lark/lark-setup-walkthrough.mp4" type="video/mp4" />
  <track kind="captions" src="/guides/lark/lark-setup.zh.vtt" srcLang="zh" label="中文" default />
  <track kind="captions" src="/guides/lark/lark-setup.en.vtt" srcLang="en" label="English" />
</video>

[下载视频](/guides/lark/lark-setup-walkthrough.mp4) · [中文字幕](/guides/lark/lark-setup.zh.vtt) · [English captions](/guides/lark/lark-setup.en.vtt)

观看顺序：0:00 应用凭据与权限 → 0:32 本机连接 → 0:48 事件订阅与发布 → 1:12 投递目标 → 1:20 身份与群授权 → 1:36 消息来源。视频记录的是早期流程：绑定前先保存投递目标并授权群；现在绑定应用即可。下文保留可逐项执行的步骤。

## 2. 在开放平台准备应用机器人

Lark 打开 [Lark 开发者后台](https://open.larksuite.com/app)；飞书打开 [飞书开发者后台](https://open.feishu.cn/app)。账号、组织和应用必须属于同一个平台。

1. 创建**企业自建应用**，给它取一个容易认出的名字，例如「团队助手」。群里的自定义 Webhook 机器人只适合通知，不是本页的双向应用机器人。
2. 添加**机器人能力**，在「凭证与基础信息」找到 App ID 和 App Secret。
3. 为**应用身份**配置消息权限。Human 扫码登录的用户权限不能代替应用权限。
4. 在事件配置中使用**长连接**，订阅 `im.message.receive_v1`（接收消息事件）。如果后台要求先建立长连接，先完成下一节的本机连接，再回来保存订阅。
5. 创建并发布应用版本；按组织要求完成管理员审批和可用范围配置。把应用机器人加入测试群。

权限按用途开通：

- `im:message.group_at_msg:readonly`：接收群里 @机器人的消息；首次群收件验证需要。
- `im:message:send_as_bot`：以应用机器人身份发送、回复；首次回复验证需要。
- `im:message:readonly`：读取消息与消息资源；受保护的回复也需要此权限，发送前会重新读取原消息，核对发送者和会话。
- `im:message.group_msg`：获取群组中所有消息；普通消息收件、群历史与话题跟进需要。这是敏感权限，按需要开通。
- `im:resource`：上传图片、文件等资源；需要发送附件时开通。

权限是否可申请、是否需要审批，以你的组织后台为准。开通全群消息权限后，BotHarness 只接收 **规则** 允许普通消息的群里的普通消息；私聊和 @ 按绑定自动接收。接口细节可参考 [接收消息事件](https://open.larksuite.com/document/server-docs/im-v1/message/events/receive) 和 [获取历史消息](https://open.larksuite.com/document/server-docs/im-v1/message/get-2)。

接收事件和读取原消息是两项能力。若已收到消息、模型已生成答复，但原消息校验返回 `99991672`，请检查应用身份的 `im:message:readonly` 是否已开通并发布。仅有单聊／群 @ 事件权限和发送权限，不能证明受保护回复可用；不要关闭原消息校验来绕过权限。参见[获取消息详情](https://open.larksuite.com/document/server-docs/im-v1/message/get)。

### 对照真实后台配置

![新创建的引导测试应用，仅加入三项初始应用身份权限](/guides/lark/18-new-app-minimum-scopes.webp)

_这个新应用是在 Lark 后台实际创建的 #824 引导测试应用。三项权限的 Type 均为 Tenant token，状态为 Added。顶部仍显示 Pending release：加入权限不等于已生效。先建立本机连接、保存接收消息的事件订阅，再发布版本，之后才能验证群收件。此例没有开启全群消息权限。_

以下旧版参考截图来自已发布的测试应用，本轮只读核对配置。新应用仍需自己完成添加能力、申请权限、发布和管理员审批。不要照搬测试应用的全部权限或事件。

![真实后台的凭证入口，App Secret 保持隐藏](/guides/lark/09-credentials.webp)

_进入 Credentials & Basic Info 找到凭据；复制密钥到本机表单，不要点击展示密钥后截图。_

![已添加机器人能力的应用](/guides/lark/10-bot-capability.webp)

_在 Add Features 添加 Bot；添加后出现左侧 Bot 设置页。_

![筛选应用身份的消息权限](/guides/lark/11-message-permissions.webp)

_进入 Permissions & Scopes，搜索权限名，Type 选 Tenant token scopes。`im:message.group_msg` 是敏感权限，只有需要普通消息、群历史或话题跟进时才申请；图中的置顶、表情等权限不是本页要求。_

![以应用身份发送消息的权限](/guides/lark/12-send-permission.webp)

_搜索 `im:message:send_as_bot`，确认 Type 为 Tenant token、状态为 Added；还要发布变更才会生效。_

![真实事件配置使用长连接](/guides/lark/13-long-connection.webp)

_进入 Events & Callbacks → Event Configuration，Subscription mode 选择 persistent connection。连接由产品内的 Provider 建立，不用另开一个 SDK 接收进程。_

![已订阅接收消息事件](/guides/lark/14-message-event.webp)

_在 Events added 中核对 `im.message.receive_v1` 与 Tenant token。首次收件不需要图中的已读、表情、会议事件；本页不使用它们。_

![应用版本已经发布](/guides/lark/15-published.webp)

_进入 Version Management & Release 创建并发布版本，按组织要求完成审批；Released 和顶部已发布提示是本例的成功状态。_

## 3. 在本机连接应用

1. 打开左下角 **设置 → IM机器人 → 飞书**。
2. 打开 **手动接入**；应用平台选择 **Lark（国际版）**。飞书应用选择飞书，不能混用凭据。
3. 私下填入 App ID 和 App Secret，点击 **绑定并连接**。
4. 确认账号显示已连接；如果刚补了事件订阅或应用权限，回后台发布后再确认连接。

![IM机器人设置中的 Lark 手动接入表单，凭据为空](/guides/lark/01-provider.webp)

_图 1：Lark 应用选择国际版。密钥只输入本机设置，不粘贴到聊天、Git 或公开截图。界面的飞书扫码接入与 Lark CLI 的 Human 登录是不同流程；本页使用应用凭据接入。_

![实际测试应用显示「运行正常」；这是已连接状态，不是空配置示意](/guides/lark/06-connected.webp)

_图 1b：真实账号的绿色「运行正常」 只证明传输在线；把应用绑定到 PersonaBot、核对消息来源与回复是另外的检查。_

账号已可用于绑定。收消息和回复都不需要投递目标，它只用于[保存的发送目标](#高级保存的发送目标)。

## 4. 把应用绑定到 PersonaBot

在 **Bot 模式** 打开目标 Bot 私聊，使用右侧 **Channel sidebar**。

1. 在 **外部身份** 中点击 **+ 绑定应用**，在 **应用** 中选择已连接的应用并确认。一个 Bot 可以绑定多个应用，包括多个 Lark 应用；已绑定到其他 Bot 的应用不会出现在列表中。
2. 身份行显示 **已就绪**：私聊这个应用、或在它所在的群里 @ 它的消息，现在会进入这个 Bot 的收件箱。
3. 选择 **新会话** 的接收方式。**自动接收**（默认）在新的私聊或群第一条被接收的消息到达时加入它；**先问我** 会把它放在 **等待处理**，由你允许。每个应用每小时最多自动加入 20 个新会话、同时最多 500 个活跃会话，超出的会等你处理。

![已绑定的 Lark 应用及其会话列表：等待处理、活跃、已静音、已屏蔽](/guides/channel-sidebar/19c-app-conversations-zh.webp)

_每个被接收的私聊或群都会出现在应用的会话列表里。**静音** 保留会话，但不再因它唤醒 Bot；**规则** 设置群里接收哪些消息，例如没有 @ 的普通消息；**屏蔽** 会持久拒绝这个会话，直到点击 **再次允许**，屏蔽期间的消息不会补发。_

**绑定应用** 弹窗提供本官网教程的链接。在另一个标签页中阅读教程，完成应用创建、连接与绑定；侧栏不再另放一份配置引导。

## 5. 可选：把会话同步到本地频道

Lark 会话默认进入 Bot 收件箱。从应用新建同步的方式正在重新设计：之后会在 **外部连接器** 里选择任意已连接应用的会话（无论是否绑定了 Bot），作为上下文流入 Channel。

已有的同步继续有效，可在 **外部连接器** 中修改、暂停或移除。同步使用会话本身的权限，不会新增群访问权限，也不会把应用借给其他 Bot。一个频道可以接收多个来源，一个来源也可以进入多个频道。**同步决定收到什么；每个成员 Bot 的注意力 / 唤醒策略决定何时处理。** 外部消息会在气泡上方显示来源名称，点击可查看详情。普通本地回复不会自动广播到 Lark。

首次测试通过后再调整：

- 在 **设置 → Bot 设置** 管理全局默认；群的 **规则** 可以继承或覆盖它们。修改只影响以后到达的消息，不会导入过去的历史。
- 要接收没有 @ 的普通消息，先发布 `im:message.group_msg` 和事件订阅，在群里发一条不 @ 的消息并刷新。真实投递验证通过前，普通消息接收保持不可用。
- 要接收话题里没有 @ 的回复，需要显式跟进该话题。

## 6. 确认真的跑通

先做小测试：在测试群中 **@ 应用机器人**，发送「请在这里回复 LARK-OK」。不要同时测试多个 Bot。

1. 消息出现在 Bot 私聊右侧的 **Bot 收件箱**，来源群、原发送者和内容正确；这个群出现在应用会话列表的 **活跃** 中。
2. 来源详情显示外部消息 ID、事件 ID，以及存在时的话题信息。
3. Lark 原会话收到这个 Bot 自己的应用发出的 `LARK-OK`。话题测试应在同一话题回复。
4. 发一条不 @ 的普通消息，确认除非该群的 **规则** 允许普通消息，否则它不会进入这个 Bot。

**Lark 的绿色或灰色已读圆圈不能说明 Bot 是否收到消息。** 以本地收件箱的来源记录和真实回复为准。

![真实来源详情、原生消息 ID 与 事件 ID](/guides/lark/08-source.webp)

_在 Bot 私聊侧栏展开 Bot 收件箱 → 群；消息已处理时，再展开已处理 / 已忽略。点击消息打开详情，展开来源详情与消息详情。_

## 高级：保存的发送目标

Lark 可以直接列出并发往会话，所以 Lark 应用收消息、回复和主动发消息都不需要保存目标。保存的发送目标只作为后备，用于 Provider 无法列出或直接发往会话的应用：

1. 在已连接机器人的设置中打开 **投递目标 → 新建目标**，选择或填写会话，点击 **测试** 后 **保存目标**。
2. 在 Bot 私聊侧栏打开 **外部连接器 → 保存发送目标（高级）**，选择应用和已保存的目标并确认。

![真实已保存的群投递目标](/guides/lark/16-delivery-target.webp)

_截图为早期流程，当时绑定前必须先保存目标。_

## 7. 在 Lark 私聊申请管理员配对

本次预览需使用 [#1027](https://github.com/BotHarness/BotHarness/issues/1027) 的 `codex/1027-lark-pairing` 版本，构建后通过 `scripts/dev-instance.mjs --im-provider` 启动隔离 Profile。上面的旧 #823 固定版本不含配对功能；不要让生产 Host 与预览实例同时接收同一应用。

当前源码预览先交付 **配对**，为后续 IM 管理建立授权前提。在 Lark 中提交审批决定、回答原生正式提问会由后续功能交付；本页能力选项记录审核通过的人将来可以执行哪些操作。配对不会改变普通聊天的收件配置。

1. 连接并绑定目标 Bot 的 Lark 身份。私聊需要开通 `im:message.p2p_msg:readonly`、订阅 `im.message.receive_v1` 并发布应用版本；只有 `im:message:readonly` 不能开启私聊事件。保留 `im:message:send_as_bot` 用于发送申请回执。
2. 打开 **Bot 模式 → Bot 私聊 → Channel sidebar → 外部身份 → IM 管理员配对**，确认显示 **配对接收已就绪**。应用账号在线不等于配对接收就绪；同一应用只由一个 Host 接收。
3. 在应用机器人的 **私聊**里发送纯文本 `/pair`，不用输入 API Token 或复制用户 ID。申请人来自 Lark 提供的真实发送人；群里的命令不能授予管理权限。
4. 在已登录的 Web 页面点击 **刷新申请**，核对接收账号、申请人与申请编号。需要时展开缩略的申请人 ID 查看完整平台标识；平台未提供名字时，页面会明确说明，不编造姓名。
5. 在 10 分钟内明确勾选能力，点击 **批准所选能力**，或 **拒绝申请**。默认不勾选任何能力；第一个申请人也不会自动成为管理员。申请编号只用于定位申请，不能作为凭据兑换权限。
6. 点击 **撤销权限**可立即取消授权，重启不会恢复。之后再发 `/pair` 会产生需要重新审核的新申请。暂停身份或 Bot 时，已有授权暂不可用；Web 仍可撤销这项授权。

审核通过的授权在 Host 重启后保留，范围仅限 **当前 Bot**，不包含其他 Bot、审批人管理、VPS、DSH API 或工作区权限。10 分钟过期时间针对待审申请，已批准授权不受这个计时器影响。普通聊天接收与管理授权分别配置。

审核或刷新失败时，配对弹窗会在控件旁显示错误提示。请刷新并重新核对当前申请，再决定是否重试；错误不会授予权限。

### #1027：真实配对操作记录

_本节图片为旧版 Profile 布局；现在配对从右侧侧栏的「外部身份」打开。_

以下截图来自真实 Lark 私聊和源码预览的已登录 Web 操作，使用 DSH `0.2.0-rc.1` 与兼容的固定 Provider。在明确授权的短暂停机窗口中，本机隔离测试 Host 独占现有应用；验证后已恢复生产 Host 及两个 IM 连接。完整申请人 ID 保持折叠。

**刷新并核对申请。** 第一条真实申请没有默认勾选的能力，**批准所选能力**按钮禁用。接收账号已就绪；Lark 未提供申请人的显示名称，页面明确说明。

![真实 Lark 申请等待 Web 审核，默认没有能力](/guides/lark/pairing/after-pending-light.jpg)

**只选择需要授予的能力。** 本例只勾选 **回答正式提问**。Web 批准后显示 **已授权**、这项能力与 **撤销权限**按钮。能力选项记录授权范围；当前配对预览还没有交付从 IM 回答正式提问的交互控件。

![通过真实 Web 操作只授予回答能力](/guides/lark/pairing/after-approved-light.jpg)

[查看同一已授权记录的深色截图](/guides/lark/pairing/after-approved-dark.jpg)。

**重启同一 Host 核对持久化。** 真实冷启动后仍保留原授权记录，能力仍只有 `answer`，接收器自动恢复就绪；没有重新创建或批准申请。

![真实 Host 重启后保留原授权](/guides/lark/pairing/after-restart-approved-dark.jpg)

**再次申请前先撤销。** 点击 **撤销权限**后，真实记录变为 **已撤销**，能力清空，撤销按钮消失。

![通过已登录 Web 撤销真实授权](/guides/lark/pairing/after-revoked-dark.jpg)

**在同一个 Lark 私聊重新发送 `/pair`。** 新申请的编号不同，没有继承权限，批准按钮仍禁用；旧记录保持已撤销。需要再次授权时必须重新审核。本次演示没有批准新申请；这些配对命令在 Operational Database 中没有产生普通 IM Source Event 或 Inbox Admission。

![撤销后真实重新申请，没有继承权限](/guides/lark/pairing/after-repair-dark.jpg)

[查看恢复服务时的浅色截图](/guides/lark/pairing/after-repair-light.jpg)：自动测试窗口结束后，本机 Web 显示连接中断提示和最后观察到的申请状态；这张截图不能证明接收器仍在线。

**验证结束后拒绝新申请。** 恢复生产服务后，本机继续关闭接收器；在已登录 Web 点击 **拒绝申请**，新记录变为 **已拒绝**。旧授权保持撤销，所有测试记录的能力均为空，没有遗留已授权或待审记录。

![关闭本机接收后通过 Web 拒绝剩余测试申请](/guides/lark/pairing/after-rejected-dark.jpg)

**审核窗口过期时**，批准控件消失。下面这条较早的真实申请未获批准便过期；截图时为让生产 Host 独占接收同一应用，本机接收器有意离线。

![已登录 Web Profile 中的真实 Lark 过期配对申请](/guides/lark/pairing/after-expired-light.jpg)

[查看同一过期状态的深色截图](/guides/lark/pairing/after-expired-dark.jpg)。

看不到申请时，检查私聊权限、应用发布、事件订阅、身份和配对接收状态。重新连接身份会重试接收器配置。此处使用的固定 Provider 会由后台监督器自动重连，单次断开应用不能保持测试独占。真实 QA 应使用专用测试应用，或在明确授权的服务停机窗口中完成，随后恢复生产 Host；不要让两个 Host 争用同一应用。

### 配对刷新失败后的恢复

这组补充截图来自合并最新主分支代码后的源码预览，使用全新隔离 Profile，没有连接外部 IM 应用。只停止该本机 Host，制造真实连接失败：点击 **刷新申请** 后，错误显示在配对控件旁，当时的「频道连接器与授权」（现为「外部连接器」）仍保持折叠。重启同一本机 Host，再次刷新后错误消失。这验证 Web 失败与恢复，和上面的真实 Lark 申请演示分别留档。

![浅色界面中配对刷新错误显示在控件旁](/guides/lark/pairing/integrated-failed-refresh-light.jpg)

[查看深色失败截图](/guides/lark/pairing/integrated-failed-refresh-dark.jpg)。

![重启隔离 Host 后配对刷新恢复的浅色界面](/guides/lark/pairing/integrated-recovered-light.jpg)

[查看深色恢复截图](/guides/lark/pairing/integrated-recovered-dark.jpg)。

## 常见问题

| 现象                          | 优先检查                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 应用找不到、连接失败          | Lark / 飞书平台选项、组织、App ID / Secret、Host 是否运行                                                                         |
| 绑定应用时找不到应用          | 是否使用兼容的固定 Provider、账号是否在线；已绑定到其他 Bot 的应用不会列出（见 设置 → IM 应用）                                   |
| 群不在会话列表                | 应用是否在群里、第一条消息是否 @ 了它；会话是否在等待处理（先问我或每小时上限）或已被屏蔽                                         |
| @消息不进 Inbox               | 机器人是否在群；应用身份权限、`im.message.receive_v1` 长连接订阅、版本发布与管理员审批；身份是否启用、会话是否被静音或屏蔽        |
| 普通消息或话题无 @ 回复不进来 | `im:message.group_msg`、真实事件投递验证、群的接收条件；话题是否被显式跟进                                                        |
| 历史读取返回 230027           | 应用身份的群消息读取权限及发布是否生效；Human 登录权限不能代替它                                                                  |
| 能收到，但不会回复            | 模型是否可用、Inbox / 唤醒状态；该 Bot 的身份是否启用；已发布的 `im:message:send_as_bot` 和原消息校验所需的 `im:message:readonly` |
| 本地 DM 没有消息              | 会话默认只进入 Bot 收件箱；只有已有的同步（见 **外部连接器**）会显示到 Channel                                                    |

如果需要协助，提供平台、操作步骤、可公开的错误码和已经完成的检查。不要附 App Secret、访问令牌或群中无关的消息内容。

## #824：真实新应用操作记录

以下是新应用的真实压缩截图，不是模拟成功。应用通过真实后台发布为 1.0.0，只加入指定 QA 群；本机连接、目标测试和保存、PersonaBot 身份绑定与指定群授权都通过产品界面完成。首次实测产物为一次安装的 `0.0.0-test.824.6`，新增指定群选择后的最终复验为 `0.0.0-test.824.7`（Provider `4.32.0-botharness.2`），没有另装接收进程。上文旧 #823 图与视频保留为参考，不替代本次新应用实测。

![新应用已连接](/guides/lark/19-new-app-connected.webp)

_连接正常仅确认 Provider 在线，尚不代表 Inbox 已收件。_

![新应用事件订阅已保存](/guides/lark/20-new-app-events.webp)

_长连接验证失败时先建立本机连接，再保存 im.message.receive_v1。_

![新应用版本已发布](/guides/lark/21-new-app-released.webp)

_发布、审批和可用范围与本机连接是不同状态。_

![新应用目标已测试保存](/guides/lark/22-new-app-target.webp)

_测试消息到达指定群后，保存投递目标。_

![账号目标身份与授权已确认](/guides/lark/23-new-app-guide.webp)

_早期的五步引导；现在的引导只有三步（连接应用、绑定、验证）。步骤来自真实配置；点击引导不会推进完成状态。_

![原生话题中的提及和新应用自己的回复](/guides/lark/24-new-app-topic-reply.webp)

_无 @根消息未入库；两条指定 @消息进入该 Bot Inbox，LARK-SETUP-OK 在同一话题以新应用身份出现。截图裁掉无关会话；平台已读圆圈不是 canonical 收件证据。_

![真实引导中的来源关联收件与回复](/guides/lark/25-new-app-receipt.webp)

_原文 [BH-LARK-SETUP] 的 Source Event 末尾为 f708a3f1，对应 Inbox 已处理、关联回复为平台已接受。未观测到自身回传，引导要求 Human 到原话题核对。_

![临时连接与本机凭据已移除](/guides/lark/26-new-app-cleaned.webp)

_关闭重开和重启同一 Profile 后配置历史保留；重新加载后选择原账号核对。停用、撤销授权、解绑与移除账号使相应步骤重新待确认。验收后用原生移除接入停止接收并删除本机配置及凭据；外部应用保留，后台凭据重置仍由管理员操作。_

## 在管理私聊处理工具审批

#1375 候选版本可在「IM 角色与配对」编辑角色，显式选择批准一次／拒绝能力，或为已批准的普通人员分配另一个角色。管理能力为空表示可以聊天但没有管理权限。保存会检查当前 revision，若提示状态已变更，请刷新后重新检查。后续权限及目录查询显示当前状态，不改写模型历史。角色的行为文字本身不能批准工具。

普通角色的私聊审批目的地必须选择从私聊发起并已批准配对的人员，再到「Lark 审批通知」选中该人员；群内配对不会创建管理目的地。删除能力、撤销或重新分配角色会拒绝延迟决定。重新分配使旧路线失效后，请显式重新选择并保存当前目的地。既有 `/pair` 管理授权仍独立，也不会单独开启普通聊天资格。提问、保存规则、群目的地及配对码签发保留后续票。

此切片经受资格验证的 Provider 支持 Lark 私聊「允许一次／拒绝」卡片。群审批、原生提问表单、保存自动规则和释放原生等待由后续切片实现；dsh-im 已发布版本号本身不能证明卡片能力，能力不可用时不会回退放行。

1. 在应用的「事件与回调 → 回调配置」选择长连接，添加 `card.action.trigger` 并发布版本。保留原有读消息／发消息权限，增加 `im:chat:read` 以在发送前验证确为私聊。这些应用变更须经维护者授权。
2. 在 Bot 的 Lark 私聊发送 `/pair`；在 **外部身份 → IM 管理员配对** 中核对真实申请人和应用账号，明确授予「批准」及／或「拒绝」。配对不会建立普通私聊收件，也不授予 VPS／API 权限。
3. 在侧栏「外部身份 → Lark 审批通知」按姓名和接收账号选择管理私聊，点击「保存目的地」，再「发送测试卡片」。测试卡片没有审批按钮，不批准任何操作。
4. 后续原生工具审批会将完整操作发到该管理私聊，提供「允许一次／拒绝」。决定前核对操作；内容截断时到 Web 查看完整内容。点击后的提示仅说明操作已收到，正式决定和执行结果分开确认。
5. 在该弹窗中刷新通知，点击「查看原生会话与完整操作」检查原生结果。「已批准」不代表工具已执行。拒绝、撤权、过期、重复或身份不匹配的操作均不能批准新调用。

![管理私聊尚未配对时的真实隔离实例](/guides/lark/approvals/settings-empty-dark.jpg)

图中（旧版 Profile 布局）是实际运行的私聊通知入口，尚无配对目的地；它不是 Lark 真实投递或执行成功的证据。本切片的外部资格验证另见 issue 的留档及 Human QA。

「结果未知」时先检查私聊，不自动重发。确定未发送的失败最多尝试三次。卡片更新也可能未确认，正式结果以 Web 原生会话为准。撤销配对或更改目的地使旧按钮失效；Host 重启使旧审批卡片过期，不从通知记录恢复工具调用。当前切片仍会等待原生审批；后续 Inbox 续接切片负责不阻碍其他消息。

Computer／Browser 的首次授权覆盖原生会话，因此通知不提供审批按钮，须到 Web 审核，不能通过 IM 的「允许一次」授予。

![已审核的测试私聊收到原生工具审批通知](/guides/lark/approvals/route-sent-dark.jpg)

2026-10-07 较早的隔离测试中，真实 Lark 平台接受了测试卡片和原生工具审批卡片。这张历史截图记录的是**投递已接受、决定仍待处理**，不展示 IM 决定或工具执行。之后获准的原生 Windows 窗口核验了 BotHarness 源码 `8936777b` 与 checked Provider 源码 `1422b07f`：Human 在 Lark 点击「允许一次」，原生 Node 打印调用准确执行一次并成功；另一张卡片点击「拒绝」，返回原生拒绝错误，没有替代调用。Human 确认两张最终卡片分别显示「已执行」和「已拒绝」。先关闭路由、撤销 QA 配对、解绑身份并停止本机接收，再在十分钟上限内恢复生产。Human 随后确认生产 Lark 与 Discord 均可正常回复。准确源码的证据与恢复检查见 [#1029](https://github.com/BotHarness/BotHarness/issues/1029)；此核验不会修改已发布 Provider 的锁定版本或部署功能。

![真实恢复状态：自动通知已关闭，旧请求已失效](/guides/lark/approvals/recovery-dark.jpg)

[查看浅色恢复截图](/guides/lark/approvals/recovery-light.jpg)。测试授权撤销后，本机 Host 在禁用 IM Provider 的状态下重启：目的地为「关闭自动通知」，旧请求「已失效」，本机身份暂不可用。这张截图不证明生产连接状态；恢复后的生产 Discord／Lark 连接已另行核验。新测试不能使用旧卡片。

## 接收与回答反馈（候选）

[#1040](https://github.com/BotHarness/BotHarness/issues/1040) 候选在**原始入站消息**上增加可选反馈：Source Event 与 Inbox Admission 持久提交后尝试原生 `GLANCE`；只有该来源的明确回复获外部 Provider 接受后才尝试 `DONE`。Human 已选择这两个官方类型，授权复测已确认私聊原消息实际显示两者。表情不表示 Human 已读。

未提及 Bot 的普通群消息、待允许请求及被屏蔽会话没有 Admission 反馈。静音仍会静默接收，因此可能出现 `GLANCE`；明确回复获接受后可以出现 `DONE`。静默结束、等待澄清、委派完成、失败或结果未知的发送，以及无关主动输出均不表示已回答。

此功能需要可选 checked Provider 的 `reactionVersion: 1`／`reaction-write-checked` 能力；旧 Provider 仍可正常收发，反馈能力显示不可用。已验证 Provider pin 保持原样。[官方添加表情 API](https://open.larksuite.com/document/server-docs/im-v1/message-reaction/create) 要求表情写入权限或既有更广消息权限，并要求应用可访问来源会话。权限不足需维护者审查；候选不会自行扩大应用权限或订阅 reaction 事件。[官方表情类型](https://open.larksuite.com/document/server-docs/im-v1/message-reaction/emojis-introduce)可供核对。

反馈独立运行，限时四秒并限制并发。权限失败、来源删除或传输不可用不会阻塞 Inbox 接收、模型工作或回复。attempt 持久保留且不自动重试，包括重启／重连；后来启用权限也不会补发历史表情。已认证的 `messagingSnapshot` 管理 API 暴露 `reactionSupported` 和近期 `feedback` 状态：`attempted`、`accepted`、`unavailable`、`failed`、`unknown`。Web 的现有 Lark 身份编辑窗口显示反馈能力与最近五条来源的尝试状态；刷新外部身份可更新。中断的 `attempted` 或 `unknown` 不是成功。

准备、精确测试版本及恢复见[候选 QA 手册](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/agents/qa-lark-feedback.md)。首次窗口发现权限缺失后，Human 明确授权并添加 `im:message.reactions:write_only`。2026-10-09 有自动恢复保障的复测通过已登录的 Codex 内置浏览器完成：两条不同私聊各有对应回复，原消息显示 `GLANCE`／`DONE`；静默私聊仅有 `GLANCE`。后续新授权窗口确认真实群 @ 的接收／回复状态、静音 Admission 仅接收、Provider 重连保留反馈及合并后同状态 Web 明暗截图；网页 @ 列表失败时由 Human 使用可用客户端发送。生产已恢复，Human 确认 Lark／Discord 正常回复。再次新授权的窗口已验证同一 Profile 的真实 Host 重启后可接受新回复，身份与历史反馈保持不变。屏蔽私聊在窗口内发送，未出现回复或表情；官方日志在报告的分钟内有一条成功投递，但尚不能精确关联 marker。Human 随后提供了 `BH1040-R3-GROUP` 原消息截图，显示归属于 DeepSeekBot 的两个表情及对应回复，补齐群表情显示图证。屏蔽 marker 的精确关联、此前触发条件未明的 Web 故障及其他未执行项仍待验证。源码 PR 已合并；剩余用例仍是扩大资格范围和提升 Provider pin 的门槛，上方旧引导截图不是反馈证据。

## Channel 历史中的图片

在支持图片的 #1021 候选版本中，已授权的 Lark 图片或受支持的图文消息会显示在原 Channel 气泡内。上方的来源名称仍可打开来源详情。图片进入可见区域时加载；点击图片可放大，加载失败后可点击「重试」。文字和多张图片按原生顺序保留在一条消息中。

需要先把会话同步到 Channel。仅 Bot Inbox 的接收不会把图片放入 Channel。应用继续使用既有消息权限：群聊仅 @ 接收时，受支持的原生图文消息仍需真实 @Bot；此功能不会开启普通群消息权限。

暂停同步后，已取得的图片仍可查看，但该路径不再取得新图片。解绑身份或撤销来源授权后，该路径连缓存图片也不可访问；另一个独立有效的来源路径保持独立。刷新和重启保留已授权、已取得的图片；清除或缺失的原件不会重新下载。预览支持不超过 25 MiB 的 PNG、JPEG、GIF 和 WebP；超限或不支持的格式会明确提示。

Human 查看图片不会让 Bot 获得图片理解能力，也不改变其注意力、模型上下文或权限。本候选版本的真实平台验收和截图记录在 [#1021](https://github.com/BotHarness/BotHarness/issues/1021)，上方旧的新手引导证据不能代替本次验收。
