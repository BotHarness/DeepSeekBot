# 将 Bot 接入 QQ 群

使用**通过腾讯官方平台授权的 QQ Bot 应用**。这条路径把 PersonaBot 接到已经加入 QQ 群的应用。先用一个应用、一个 Bot 和专用测试群验证。

这是 [#1152](https://github.com/BotHarness/BotHarness/issues/1152) 的开发切片，需要 `scripts/dev-im-provider.mjs` 选择的已取得资格的 Provider；任意 dsh-im 安装版本不一定提供所需 checked 契约。公开发布与其余 [QQ 能力](https://github.com/BotHarness/BotHarness/issues/1149) 各自记录交付状态。

## 接入并绑定应用

1. 在 [QQ 机器人官方平台](https://bot.q.qq.com/open) 创建应用，遵循平台当前的应用资格和入群要求，把应用加入测试群。
2. 确认 PersonaBot 能使用选定模型回复本机私聊。
3. 复用已有应用时，打开 **设置 → IM 机器人 → QQ → 手动设置（Manual setup）**，暂停录制后将 AppID 和 AppSecret 直接填入原生表单。**扫码（Scan QR code）** 会创建并连接新的 Bot，仅在需要新应用时使用。凭据保留在原生 Credentials Service。开发者已有原生授权时，可用 [QQ QA 复用脚本](agents/qq-test-clients.md)，无需再次输入 Secret。
4. 打开 Bot 私聊，在 **Channel sidebar → 外部身份 → 绑定应用** 选择 QQ 应用并绑定。就绪状态表示群提及可以进入这个 Bot 的收件箱；无需保存发送目标或逐群授权。
5. 在 QQ 群里 @ 应用发送简短文字问题。检查 **Bot 收件箱**、打开来源，并在原 QQ 群核对答复。

一个应用属于一个 Bot。Bot 使用收到消息的应用身份回复。平台的可用范围和群成员设置决定谁能联系该应用。

## 管理已接收的群会话

首次收到提及后，打开应用的**编辑身份**会话列表。可信群定位属于经过认证的应用，显示名称或 QQ 群号不能替代这个定位。

- 点击**同步**，选择包含此 Bot 的群 Channel 并应用。后续符合条件的提及会显示在那里，同时进入既有 Bot Inbox；答复仍通过收到消息的应用发回原 QQ 群。
- **停止同步**只停止后续 Channel 落点。默认 Inbox 路径保持启用时，会话改为仅进 Inbox。已接收的 Channel 历史仍可阅读，不会复制到另一个 Channel 或 Human–Bot 私聊。
- **静音**保持接收但不唤醒 Bot。**屏蔽**停止入站并撤销尚未发送的权限。**再次允许**从后续消息开始；屏蔽期间的旧事件即使再次投递，也不会补收。
- 暂停路径只改变该路径；暂停应用停止它的接收和待发送权限；归档让 Bot 保持未启用。重启保留持久选择。重新绑定同一个已认证应用保留屏蔽和静音偏好；已撤销的 Channel 授权需要重新选择。

展开**接收区间**查看暂停、屏蔽、等待允许和连接记录。**本地控制边界**来自本地操作，**本地观察时间**来自连接检查。异常重启后，**连续性未验证**范围覆盖上次观察到下次检查之间的时间。这些区间不能证明漏收数量。每个应用保留最近 128 条已结束区间和当前区间，不另存消息副本。

见 [#1153](https://github.com/BotHarness/BotHarness/issues/1153) 与 [ADR-0152](adr/0152-qq-reception-intervals-record-local-observations.md)。

## 两个 Bot 使用同一个 QQ 群

分别授权两个官方 QQ 应用，把它们加入专用 QQ 群，再各自绑定给所属 PersonaBot。**绑定应用**会显示已有所有者，拒绝把已占用的应用分配给另一个 Bot。

1. 把两个 PersonaBot 加入选定的本地群 Channel。
2. 在 QQ 中分别 @ 两个应用；打开各自所有者的会话列表，核对独立接收的群会话。
3. 分别点击会话的**同步**，选择同一个本地群 Channel。同一个真实 QQ 群的应用范围定位可能不同；名称、文字或相同定位都不会自动建立映射。
4. 再分别发送可区分的提及，核对各自 Inbox 与本应用的原群答复。Channel 作者标签包含接收应用名称；**来源详情**也显示接收应用 ID。这些字段说明归属，不赋予回复权限。

共享 Channel 阅读不会借出接收应用的身份或被动回复证明。Bot 没有自己已取得资格的会话时拒绝发送；存在多个符合条件的自身应用时明确拒绝歧义。屏蔽、解绑或归档一个所有者会阻止该所有者的效果，同时保留已接收的 Channel 历史和另一所有者的身份。不同应用的相似文字或相同消息 ID 仍是独立来源。

当前已取得资格的 QQ Provider 声明原生回复回执，未声明 `own-text-echo`。平台接受回执不等于观察到 Echo，也不应产生另一份来源或新 attention。跨应用原生事件保持独立，不能按文字匹配隐藏。真实资格与尚待核实的原生 Echo 边界见 [#1156](https://github.com/BotHarness/BotHarness/issues/1156)。

## 可选原生观测候选

维护版候选也保留原生提及的名称和 ID，复用现有用户名块；悬停可查看原生 ID。未知名称保留原始正文，提及展示不会建立 Bot 作者身份或跨 App 合并事件。QQ 语音播放与发出消息的附件共用音频卡片，支持键盘播放和进度调整。**准备播放**仍需明确操作，下载保存原始语音文件，而非转换后的 WAV。

`scripts/dev-im-provider.mjs` 选定的可选开发 Provider 使用经过审查的 SDK 1.0.4 构建补丁，在 WebSocket message 进入 decode／JSON parse 之前观测，并在既有连接状态中提供有界 phase 元数据和进程内首尾计数。它不记录 raw payload 或凭据，也不增加收件、发送或 Echo 权限。每个新原生窗口都须比较捕获 phase、首尾计数、限流及采集容量。此候选与默认托管产品 Provider 独立，尚未验收自身原生 Echo；见 [Provider #26](https://github.com/DoodleBears/dsh-im/pull/26) 及其[双语观测契约](https://github.com/DoodleBears/dsh-im/blob/1eee207c0c23fc98aa26e329f753c1de8b910aff/docs/qq-native-observation.md)。

[transport-J 验收](https://github.com/BotHarness/DeepSeekBot/issues/1156#issuecomment-6129948447) 使用产品 `7c9b3b6f`／Provider `43902c6`：受 guard 保护的 Profile 重启后，两个当前本地 DM 均获真实回复，Human 也确认两应用各自在 QQ 原群回了完整匹配标记。观察到的六条群帧在 SDK WebSocket、Gateway 和规范化回调三个边界全部对应，没有采集遗漏；同 App 原生自身回调与 Core Echo 事实均为零。该有界结果不证明 QQ 永不回推。[审查说明页](/evidence/issue-1156/qq-transport-observer.html) 解释维护补丁及其限制；剩余生命周期与最终版本证据继续由 #1156 跟踪。

## 群图片（开发候选）

[#1157](https://github.com/BotHarness/BotHarness/issues/1157) 候选沿用仅提及接收路径，增加 PNG、JPEG、GIF 和 WebP。发送一条带说明和图片的新 @ 消息；已同步会话通过共用预览在原 Channel 消息中展示图片。仅 Inbox 接收不要求 Channel 落点，打开预览也不会唤醒 Bot。

实际视觉理解要求当前调用 Session 的模型支持图片。Bot 可用 `bridge_attachment_save` 保存获授权的独立工作副本，通过原生 `read_image` 读图，再用 `channel_attachment_import` 导入选定结果，交由 `bot_send_message` 回复。下载或预览成功不代表模型理解；不支持图片的模型必须说明无法查看。

图片沿用 25 MiB 上限。QQ 私有下载地址和上传票据留在 Provider，公开来源仅保留安全元数据和附件关联。说明在前的展示保留附件数组顺序，不声称还原 QQ 原生图文穿插位置；引用及不支持的复合载荷仍排除。重启保留 canonical 来源元数据和已获取预览，但无法重建尚未获取的私有下载票据或已失效回复证明。

使用 `bot_send_message` 和可信 source_event_id 回复。图片使用一个导入附件和空正文；有用的文字说明可另发到同一来源。每条消息独立标识，结果未知时查询已有 Outbox，不作为新调用盲目重发。

图片结果使用接收应用在原群发送。上传与最终单次消息发送分开，上传后重新检查授权。原生消息回执记录 Provider 接受，unknown 不自动重发。真实 QQ／模型／Client 图片资格在 #1157 记录，不能由候选契约推定。

## 处理群文件（开发候选）

[#1158](https://github.com/BotHarness/DeepSeekBot/issues/1158) 候选单独协商普通文件能力，接收原生群 @ 消息直接携带的文件，或符合条件的显式文件引用。若 QQ 将文件单独发送，请回复该文件，在回复中选择 @Bot 并附处理要求。当前原生 type-103 引用须实际携带唯一文件块、引用索引一致，且群／消息／作者身份吻合；仅相邻不建立来源关联。引用附件归属当前 @ Source 及其回复权限，不重建历史消息。2026-10-08 已通过该文件引用路径的真实 QQ 验收。文件块中的标量 `message_type:103` 属于元数据；递归引用结构仍不支持。腾讯原生 `file` 分类映射为不透明的 `application/octet-stream` 元数据，不声称平台提供了 MIME。

已同步 Channel 使用现有文件卡片，提供“下载到此设备”。每次请求重新检查 Channel 成员、来源落点、接收身份和会话授权；按需获取到 canonical AttachmentStore，限制 25 MiB，并强制作为文件下载。Inbox-only 接收复用同一来源，无须 Channel 落点。

Bot 通过 `bridge_attachment_save` 将独立副本保存到当前允许写入的 Workspace Grant，处理副本，用 `channel_attachment_import` 导入选定结果，再通过 `bot_send_message` 回复。原始文件保持不变。文件回复传入一个导入附件和空正文；必要的解释仍回复同一来源，不改道本地 DM。

原生文件输出先以 `file_type=4` 上传但不发送，再核验当前授权，最后只向原群 POST 一次。原生回执表示 Provider 接受；unknown 不自动重试。原生音频／视频输出不属于此文件切片。

**已验收的测试应用：** 2026-10-08，在 DSH `0.2.0-rc.1` 上使用固定的维护版 Provider `6d24d1f`，一个已授权 QQ 应用接收了引用的 CSV，从原生下载域名获取文件，保存并实际读取独立工作副本，再以自己的身份向原群回传独立的 `total.csv`。Human 下载后确认表头为 `total_quantity`、下一行为 `5`，存储的原件保持不变。此证据限定于该应用和文件引用路径，不代表所有 QQ 应用、直接文件载荷或现代上游 Host 运行时均已通过；每个目标应用仍须验证权限，SDK 支持本身不能证明权限。私有票据仅驻留进程，重启不能重建。

## 理解文字路径

### 延迟结果与显式主动发送

#1154 源码候选为已授权的保存 QQ 群目标启用受检主动文字发送。当前 Provider 不提供 QQ 群发现，因此沿用保存目标的授权，收到一次提及不会产生主动发送权限。发送时仍检查当前应用身份、目标、会话屏蔽、最终授权和共享每小时限额。

任务超过 QQ 的五分钟回复窗口后，`bot_send_message` 将 `reply-window-expired` 记录为失败，并把结果保留在 Outbox。需要回传该任务结果时，Bot 可查询 `bridge_targets`，选择属于自己应用且对应原群的 `canPost` 目标，再以该明确授权的 grant_id 显式调用 `bot_send_message`。没有匹配目标或平台权限时，保留本地结果。回复或主动发送的结果不确定时，都不能另建发送；重启后检查同一请求不会重发。

保存目标的 Web 发送操作沿用相同受检发送与原生回执。Provider 接受和在 QQ 中看到结果是两个事实。真实延迟任务、拒绝分支和当前包验收仍记录在 [#1154](https://github.com/BotHarness/DeepSeekBot/issues/1154)；普通群观察与主动参与另归 [#1155](https://github.com/BotHarness/DeepSeekBot/issues/1155)。

**已验收的测试应用：**2026-10-14，QA2 应用在 `0df23253` 工作树 Host、DSH `0.2.0-rc.2` 和不可变 `.20` Provider 上，完成真实 QQ 请求的 Schedule，经过 400.542 秒回传结果。原回复以 `reply-window-expired` 保留；独立的同 App、已授权原群主动发送取得原生回执，Human 确认只收到一次正确结果。真实共享小时限额拒绝将另一结果保留在本地。恢复后，原两项测试 App 均恢复正常回复。这只验收当前来源／运行时路径，最终打包产品的原生执行与匹配视觉证据仍是独立门禁，见[验收记录](research/2026-10-14-qq-delayed-native-qualification.md)。

| 行为           | 当前契约                                       |
| -------------- | ---------------------------------------------- |
| 入站           | 可信 `GROUP_AT_MESSAGE_CREATE` 事件中的文字    |
| 目的地         | 同一应用范围内的原 QQ 群                       |
| 回复           | 关联原消息的原生文字答复                       |
| 回执           | QQ 返回的原生消息 ID，表示平台接收             |
| 暂停或解绑     | 停止新入站并阻止尚未发送的答复                 |
| 重复事件       | 复用 canonical Source Event 与 Inbox Admission |
| 发送结果不确定 | 保留 unknown，不自动重发                       |

[官方群发送契约](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) 规定被动答复有五分钟窗口，每条来源消息最多回复五次。Bot 不会把过期答复自动改成主动发送。平台回执不代表 Human 已收到或已读。

首片不接收 QQ 私聊、普通群消息、附件或复合／引用载荷。[普通群事件](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html) 还需要应用开启接收所有消息；显式开启该能力另有切片。图片、文件、语音接收和延迟主动报告依次跟进。

QQ 没有向这个 consumer 提供群历史接口或持久恢复游标，断线可能留下空缺。Host 重启后，已保存来源仍可查看，但进程内回复证明不可用，直到平台再次投递符合条件的原生事件。旧来源不能变成发送无关新消息的权限。

## 普通群文字候选

[#1155](https://github.com/BotHarness/DeepSeekBot/issues/1155) 开发候选从 Provider 的 QQ 独占受检消费者转交普通文字。收集仍默认只收 @。软件能力不证明应用具备全量权限：必须有一条真实、非 @ 的新原生群事件到达当前接收器，现有 Client 才能为这个会话开启**所有消息**。只收 @ 模式下的探测提供当前投递证明，其普通内容不会进入 canonical 收集或唤醒 Bot。

保存的收集偏好与当前接收器证据分别显示。显式开启后，符合条件的普通文字保留成员、群及消息归属，进入现有本地 Inbox／Channel 路径。Observation 与条数／时间聚合可以独立于直接提及唤醒 Bot，但不要求逐条回复。主动参与使用独立授权的同 App 主动发送路径。本片不包含普通媒体或 QQ 远程群历史。

切回只收 @ 会停止后续普通收集。屏蔽、停用或失去接收器沿用现有门禁；重连保存有效偏好，当前投递证据则需重新取得。屏蔽接收期间的旧事件不会证明重新允许会话后的资格，也不会补造缺失历史。此候选的真实 QQ 事件、Client 开启收集、理解及主动参与验收仍待完成。

## 应用未出现或无法回复

- 在 **设置 → IM 机器人 → QQ** 检查连接。接收器在线和应用身份验证都需要通过。
- 展开该应用的**诊断详情**，安全的 HTTP 状态、平台错误码和资格提示有助于区分凭据、权限和响应问题。不要分享凭据或授权二维码。
- 来源过期时，在 QQ 发送新的 @ 提及。发送结果不确定时，先到原群核对，再请求另一条消息。
- 检查 Bot、绑定和会话是否启用并允许。暂停、屏蔽和解绑会撤销尚未发送的权限。

[Provider 接入指南](dev/guides/im-provider-integration.md) 与 [ADR-0151](adr/0151-qq-group-replies-use-authenticated-apps-and-process-local-source-proof.md) 记录实现边界。

## 接收并播放群语音

本次 QQ 客户端不能在发送语音时同时 @：先发送一条语音，再引用这条原语音并真正选择 @Bot。语音里的请求已清楚时，引用说明文字可省略。受检契约也接受自身携带提及的原生语音载荷，但本次客户端尚未验收此路径。只有原生引用明确关联的语音归属当前请求，不根据消息相邻关系关联。

同步后的**群 Channel**和**来源详情**均区分 QQ 平台转写和转写不可用。Channel 在来源消息旁提供原音下载和**准备播放**；播放不会新增 Inbox 接收或唤醒 Bot。平台转写只能来自原生语音附件的 `asr_refer_text`，用户说明不会成为平台转写。现有 Orchestrator 可读取实际转写，通过接收应用在原群回复文字；QQ 未提供转写时不会自动配置语音识别服务。

原音仅在请求时按当前来源／应用／Grant 权限下载，上限 1 MiB。**准备播放**复用已有有界 SILK Worker 生成独立 WAV，不修改原音，也不识别语音内容；播放器不自动播放。支持有效 SILK，以及 AMR 包装后仍可验证的 SILK；真正 AMR 或其他编码明确不支持播放，原件仍可下载。此候选不获取原生可选平台 WAV 地址。

**已验收的测试应用：**2026-10-08，维护版 Provider `60be59a` 在 DSH `0.2.0-rc.1` 上接收明确引用的原生 QQ 语音及平台转写，进入一份 Source／Inbox／Channel；现有模型据语音内容，通过同一应用在原群回复，Human 确认收到 `24`。12,775 字节 SILK 原件在下载和播放后保持不变；实际 Client 通过键盘准备并播放独立的 6.4 秒 WAV 至结束，未自动播放。这只验收当前应用及引用语音的平台转写／SILK 路径，不代表所有应用、编码、直接载荷或现代上游 Host；缺少转写仍明确标记，已由回归覆盖。不包含语音输出或 TTS。

QQ App 已使用全量接收时，只有原生 `GROUP_MESSAGE_CREATE` 顶层 `mentions` 包含严格的 `is_you === true`，才仍视为直接请求。其他 App 的提及、仅引用中的提及、普通消息及机器人发送者不会进入 checked Human 收件。候选 Provider `018533fd` 在当前维护版 RC1 组成中恢复此输入路径；公共接口回归已通过，组合产品的新实机验收仍待完成。这不会开启普通消息采集，也不代表自身 Echo 已验收。
