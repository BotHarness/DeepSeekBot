# QQ 图片 checked 纵向路径调研（#1157）

调研日期：2026-10-08（Asia/Tokyo）。本文为源码与已安装包证据，不是 QQ 图片实机验收。任务只读核对实现及依赖，并保存本文；没有安装包、启动 Host、改变平台权限或发送消息。

## 版本边界

- 产品候选工作区 `C:/Users/admin/.codex/worktrees/1157-qq-images/BotHarness` 初始 HEAD 为 `3b2be95dd41671597539d068931003fed48ddba6`，分支 `codex/1157-qq-images`。
- Provider 检查对象只用 `D:/code/project/BotHarness/reference/dsh-im-1156-echo`，HEAD `71fa2a286bf1b70d814a296c43ca6bc8edab8352`；包 `@xmanrui/dsh-im@4.32.0`，QQ SDK 明确固定 `@tencent-connect/qqbot-nodejs@1.0.4`。本文的 SDK 事实来自此 Provider 的实际安装包 `node_modules/@tencent-connect/qqbot-nodejs/{package.json,src/**}`，不是最新版 README。[固定 Provider 清单](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/package.json)、[SDK 发布版](https://www.npmjs.com/package/@tencent-connect/qqbot-nodejs/v/1.0.4)。
- C: 新工作区初始尚无 `node_modules`。本次 DSH 实装证据来自 D: 根工作区的 pnpm 安装包，逐项核实 package.json 的版本为 `0.2.0-rc.1`，包括 CLI、`dsh-llm`、`dsh-tool-fs`、`dsh-attachment`、`dsh-llm-deepseek`。这证明这些 RC1 包提供相应代码，不证明新候选已经安装、组合这些 Plugin 或完成真实运行。
- `reference/deepseek-harness` 实际 HEAD 为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，根版本 `0.2.1-alpha.1`，比 RC1 更新；本文没有用其新源码替代 RC1 的 API 证据。

## 1. 官方 QQ SDK 1.0.4 入站事实与内容顺序

SDK 的 `src/protocol/gateway/event-dispatcher.ts:20–40` 声明每个 `InboundAttachment` 有 `content_type`、`url`，可选 `filename`、`height`、`width`、`size`；`voice_wav_url`、`asr_refer_text` 是另外的可选语音字段，不是图片字段。SDK `src/protocol/types.ts:227–279` 的 raw message 对象同样分开正文与附件。

同文件 `event-dispatcher.ts:236–265` 对 `GROUP_AT_MESSAGE_CREATE` 和 `GROUP_MESSAGE_CREATE` 直接映射 `author.member_openid`、`author.bot`、`group_openid`、`id`、`timestamp`、`content`、`attachments`，并转发 `raw`。SDK 保留附件数组顺序；它没有提供可证明正文与附件精确穿插位置的索引。不能把“正文在前、图片在后”宣称为 QQ 原生混排顺序。

`msgElements` 不应直接解释为本条消息的有序内容块：同文件 `:69–75` 的维护者说明专门指出引用消息时 `msg_elements[0]` 可能是被引用消息的正文与附件；`:134–143` 从其提取引用索引。首片最小范围可采用本消息顶层 `content + attachments`，保留已知附件顺序；引用或无法完整证明的混合结构应明确拒绝／降级，不把被引用图片冒充当前输入。

当前 Provider 的 checked QQ 实现 `src/channels/qq/external-consumer.mjs:43–47` 在任何 `attachments` 或 `msgElements` 存在时拒绝；`qq-controller.mjs:312–325` 只协商文本 Consumer。这是 #1157 要扩展的实际入口。[checked Consumer](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/qq/external-consumer.mjs)、[Controller](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/qq/qq-controller.mjs)。

腾讯当前事件文档入口：[群 @ 消息](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_at_message_create.html)。本轮浏览工具不能读取该站页面，未以不可见页面内容推断额外字段；以上字段已从固定官方 SDK 的实际源文件核对。

## 2. URL 与下载边界

既有 legacy `src/channels/qq/qq-bridge.mjs:211–250` 的 `qqInboundMessage` 已把原生图片包装成 lazy loader；原始 URL 仅在闭包里使用，`:83–90` 的 QQ host allowlist 为 `.myqcloud.com`、`.qpic.cn`、`.qq.com`、`.qq.com.cn`、`.tencentcos.com`、`.ugcimg.cn`。这是复用起点，不是 checked 下载完成声明。[QQ legacy 图片入口](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/qq/qq-bridge.mjs)。

其共用 `src/channels/shared/image-prompt.mjs:54–135` 的 `fetchImageBuffer` 约束 HTTPS、host allowlist、15 秒期限、取消、禁止重定向、声明和实际字节上限。默认 5 MiB 是 legacy 图片提示默认，checked canonical Source Attachment 应继续使用已有 25 MiB 应用上限，显式传入预算，不因 SDK 支持较大文件扩大产品预算。[下载实现](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/shared/image-prompt.mjs)。

建议 checked 路径：

1. canonical Source Event 仅留 opaque attachment id、原消息关联、名称、安全 MIME 和真实已提供的 size；URL、query ticket、Authorization 不进入 Source Event、模型、Client、错误详情或日志。
2. Provider 在原有有界 source map 保存 private URL ticket；下载前、异步返回后及交付 canonical AttachmentStore 前验证同一 source descriptor、账户 fingerprint、exclusive Consumer lease、Registration 与取消。采用既有微信私有文件 ticket 的边界，而非新增媒体存储。
3. 无 MIME／尺寸时用 unknown／缺失，检测下载字节的 PNG/JPEG/GIF/WebP magic，不能只依赖扩展名或 native MIME。legacy `isQqImageAttachment` 接受扩展名回退，checked 接纳须更严格。
4. 原群回复的 5 分钟窗口只约束发送，不应用它无条件禁止合法的历史 source image 读取。Provider restart／ticket 过期又无可用私有证明时明确 unavailable；不得伪造重读 QQ 原消息能力。SDK 当前 inspected group API 没有已验证的原消息重读实现；不要照搬 Lark 的 message.get 契约。
5. 已获取字节继续由 canonical AttachmentStore 拥有；预览、模型读取和发送分别经过当前应用授权。URL 变化本身不应生成第二条 Source Event，也不能直接覆盖已确认的内容身份。

可直接参照 `src/channels/weixin/external-files.mjs:7–50` 的 private ticket／descriptor equality／签名校验，以及 `src/channels/feishu/external-files.mjs:49–88` 的有界读取。QQ 缺少 Lark 的远端 source reread，所以需要清楚保留“已收到并保存的 source proof”，不能声称平台重新验证了远端当前内容。[微信 checked 文件](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/weixin/external-files.mjs)、[Lark checked 文件](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/feishu/external-files.mjs)。

## 3. 同群图片输出、post-upload fence 与结果

固定 SDK `src/QQBot.ts:924–989` 支持 `uploadMedia({target,fileType,buffer,srvSendMsg:false})`；>=5 MiB 本地/buffer 自动走分块。其 `:995–1034` 的 `sendImage -> sendMedia` 在 upload 结束后直接调用 send，没有可注入的 post-upload fence，不能直接作为 checked 输出实现。Provider legacy `sendQqImage`（`qq-bridge.mjs:342–371`）只是调用这个 wrapper 并等待／计时，不解决撤权期间上传后发送问题。

`src/protocol/api/media.ts:126–133` 区分 `file_type=1` 和 `srv_send_msg=false`；`:154–167` 允许上传重试；`:183–210` 原生最终发送为 `POST /v2/groups/{group_openid}/messages`，正文 `msg_type:7, media:{file_info}, msg_id, msg_seq`。最终 send 本身用单次 `ApiClient.request`，不是上传的 retry wrapper。该 SDK 的 ApiClient `src/protocol/api/api-client.ts:42–96` 内有自己的请求 timeout，但未提供调用方 AbortSignal 参数，不能把“外层取消了等待”当成平台没收到。

最小 checked 发送顺序：

1. 验证 Core 传入的 canonical 结果字节／真实 MIME／25 MiB，原 source route 与发送资格；仅图片使用 IMAGE，不能退回普通 file。
2. `uploadMedia({srvSendMsg:false,fileType:IMAGE,...})`，保存 `file_info` 私有返回，不把 upload 成功认作投递成功。
3. 上传后重新确认账户／runtime、exclusive lease、Registration、source route、5 分钟窗口和次数；先 await token 获取，随后再紧贴最终 POST 调用 Core `beforeSend()` 和取消／route 检查。不能先 fence 后 await token。
4. 使用固定 SDK 公共 `apiClient.request` 与协议 `messagePath/getNextMsgSeq` 发单次 native media POST，复用现有 checked 文本发送的实际方案。dispatch 开始后断线、取消、缺失或畸形 id 均 unknown，不生成新的 request_id 自动重试。
5. 原生 `MessageResponse.id` 才是 message receipt；`upload.file_uuid`、`file_info` 不是消息 id。SDK `src/protocol/types.ts:70–96` 明确两类响应不同。腾讯 API 入口：[群媒体上传](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_files.post.html)、[群发送](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html)；本轮页面不可读取，具体实现以已固定 SDK 为证。

现有 `QqExternalConsumer.reply` 的源路径、次数、token 后 fence、单次 POST、回执与 unknown 映射位于 `external-consumer.mjs:99–136`，应复用成 shared source qualification 而非绕过它；媒体必须与文本共用 source 回复次数和 canonical durable reply intent。[固定 checked QQ 发送](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/src/channels/qq/external-consumer.mjs)。

## 4. 公共 checked 图片回执的最小扩展

上游公共入口在 `plugin-src/host/index.mjs:96–107`：已有 `fileVersion:1`、`receiptVersion:1`，`replyFileChecked` 将参数转给 `deliveryService.externalFileChecked(...,{reply:true})`。Service `delivery-service.mjs:446–458` 和 adapter `delivery-adapter.mjs:258–261` 透明转发；Controller／Runtime 应拥有实际 QQ 操作和 native receipt。[公共入口](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/plugin-src/host/index.mjs)、[Service](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/plugin-src/host/delivery-service.mjs)、[adapter](https://github.com/DoodleBears/dsh-im/blob/71fa2a286bf1b70d814a296c43ca6bc8edab8352/plugin-src/host/delivery-adapter.mjs)。

产品基线 `packages/core/src/messaging/dsh-im.ts:63–69` 的 `replyFileChecked` 类型只有 `{sent:true}`；`:1021–1025` 丢弃可能返回的 receipt。`packages/core/src/messaging/provider.ts:233–242` 的 `replyFile` 仅 `{accepted:true}`。所以单独给 Controller 私有日志或 legacy SDK raw response 不满足公开 checked 回执要求。

建议兼容扩展（application-defined Service contract）：

- 上游 checked 返回 `{sent:true, receipt?:{version:1,messageId,conversationId}}`；Core MessagingProvider 对应 `{accepted:true,receipt?:MessagingReceipt}`。
- 用显式 capability（例如 `reply-image-receipt-checked`，最终命名按既有 Provider 约定）协商 QQ 图片的必需原生回执；旧平台无回执的文件路径保持兼容。若该能力被声明而结果缺失／畸形／conversation 不符，Core 报 unknown，不能接受成无回执成功。
- QQ 图片发送保留 MIME，不再落入目前“仅 weixin 保留 MIME”的 DTO 分支；否则通用文件接口无法决定 native image。
- `packages/core/src/messaging/outbound.ts:2109–2119` 已从 replyFile 结果抽取可选 receipt 并传 `settle(...,receipt)` 持久化；已有 Outbox receipt 权威，不需第二张回执表。现有 validation 只强制 report／跨 grant reply，需要在新 capability 的 checked adapter 中严格验证 QQ image receipt。
- native image 投递须可从公开 `bridge_outbox` 检查保存的 message id／原群，而不是只看私有日志。SDK 上传 ticket 继续私有。真实 QQ Client 独立确认原生图片显示与原群匹配；HTTP 接受／回执不能宣称 Human 已读。

## 5. DSH RC1 真实图片 seam 与最小模型路径

以下是 D: 工作区实际已安装 RC1 包的事实，避免误用 reference 新版本：

| RC1 实装包                                 | 直接核对位置与事实                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deepseek-ai/dsh-llm@0.2.0-rc.1`          | `node_modules/.pnpm/@deepseek-ai+dsh-llm@0.2.0-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts:61–76`：`ImageBlock={type:'image',attachment:ImageAttachmentRef,...}`；`lib/types/index.d.ts:360` 有 `resolveModelInfo(provider,model,signal)`。                                                                               |
| `@deepseek-ai/dsh-attachment@0.2.0-rc.1`   | pnpm 目录 `@deepseek-ai+dsh-attachment_e64d9bf2d7f191653704934e42d51285`，包 `lib/types/index.d.ts:20–81` 提供 imageLimits、validate/saveImages、saveImage、readImage；不需要自造 ImageBlock base64 结构。                                                                                                                                                          |
| `@deepseek-ai/dsh-tool-fs@0.2.0-rc.1`      | pnpm 目录 `@deepseek-ai+dsh-tool-fs@0._cb5a67f17b323e77a2e155466e76fc29`，包 `lib/index.js:896–910` 精确从 request header/agent options 查调用模型并强制 `inputModalities.includes('image')`；`:955–1016` 注册 native `read_image`、saveImage 后返回原生 image content block。图片格式支持 PNG/JPEG/WebP/GIF，扩展名须与字节匹配；Tool 需要 attachments/fs 已挂载。 |
| `@deepseek-ai/dsh-llm-deepseek@0.2.0-rc.1` | pnpm 目录 `@deepseek-ai+dsh-llm-deepse_40376b47bf918f80cd0b098b6797a02e`，包 `lib/index.js:42–54` advisory catalog 的 `deepseek-flash` 声明 text+image，`deepseek-v4-pro` 没有 image 声明。部署可替换 catalog；此静态默认不是目标 Host 的实际 route 声明。                                                                                                          |

产品已存在最小路径：`bridge_attachment_save -> native read_image -> channel_attachment_import -> bridge_reply_file`。首片复用它，不新增自动把所有群图片塞进模型上下文的路径。模型使用真实图像前必须通过 exact calling route gate；非图片模型应明确说明未看见图片，不能用下载成功替代理解。基线 `packages/core/src/runtime/dsh-bot-agent-adapter.ts:107` 已给外部图片这套提示。

[ADR-0129](../adr/0129-wechat-owner-dms-use-private-source-continuations.md) 的图片扩展 `:43–47` 记录了同一套微信路径的既有实际 DeepSeek Flash 图像理解和原生图片 Human 确认；这是复用依据，不是 QQ 证据。QQ 仍需要独立的新 source、真实 image Tool output、实际理解（可区分纯文本猜测的图片内容）、新结果图片原群发送和公开 native receipt。

## 6. 最小可交付路径与真正阻塞点

最小端到端路径：一个已授权 QQ Bot／一个已授权群／一条含正文和一张图片的 @ 消息 -> Provider sourceImages opt-in 与 private ticket -> canonical Source Event/Inbox -> checked 按需下载与 source preview -> PersonaBot 保存工作副本、native read_image -> 导入选定结果 -> checked native image upload／post-upload fence／单次发送 -> canonical Outbox 保存原生回执 -> Human 在原群独立确认。

实现缺口：QQ checked 图片 normalize/source proof/private下载、Controller consume 选项、readSourceFile/externalFileChecked、图片 MIME 传递、发送 post-upload fence、公开 receipt 返回／验证。Core/Client 的既有图片显示和 canonical Attachment seam 可复用，但必须在 QQ 平台协商分支启用并测试。

实证阻塞：目标 QQ 当前权限与真实入站字段、真实 CDN host/URL有效性、候选实际 DSH Plugin组合与 exact model input capability、原群 native image和公开回执匹配，均需要另行运行验收。当前调研没有改变这些外部状态。它们应作为具体 QA 步骤，而不是提前让 Human回答可由代码/真实账号验证的技术问题。

未扩张范围：普通群消息、多个身份、文件/语音、平台权限变更、自动重试、自动 OCR/ASR、直接模型图像输出生成。DSH ImageBlock 是模型输入/Tool结果表达，不代表默认模型会生成新图片；结果图片可以是经授权工具处理/选择并独立导入的文件。
