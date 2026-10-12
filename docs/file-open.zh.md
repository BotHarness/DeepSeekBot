# 在 Host 上打开文件

当前 Memory 文件阅读器、聊天里的普通文件卡，以及 Memory Repository 和已授权 Workspace 文件夹所在行，都有一个「打开」分体按钮。主按钮用默认应用在 Host 上打开文件或文件夹；旁边的箭头列出检测到的其他应用。在列表里选其他应用只打开这一次，不改变默认。「设为…的默认应用」会为该文件类型（例如 `.md`）或文件夹记住一个应用，「恢复系统默认」则取消它。默认设置只对当前浏览器和当前 Host Profile 生效：不修改操作系统的文件关联，也不会同步到其他设备。文件一开始使用 Host 的系统默认应用；文件夹没有系统默认，第一次点击会请你先选择。如果你设的默认应用在 Host 上已不可用，按钮会明确提示并请你重新选择，不会替你换成别的应用。「打开请求已发送到 Host」表示 Host 已接受请求；窗口是否出现请在 Host 屏幕上确认。

点击显示的 Memory Repository 或已授权 Workspace 路径，选择系统检测到的软件。Memory 文件行提供右键菜单和更多按钮。当前文件可以在文件管理器中显示、在编辑器中打开、复制 Host 路径，或下载到当前设备。

新发送的消息附件使用相同操作：点击文件卡片、右键文件或图片，或使用更多按钮。点击图片仍打开预览。菜单明确标示 Host 电脑；使用 Tailscale 或 Cloudflare Tunnel 时，编辑器／文件管理器在运行 DSH 的电脑上打开，下载则把当前字节传到浏览器所在设备。编辑下载文件不会写回 Host。无法原生打开时，仍可下载与复制路径。

发送会把文件传输到一个 profile 管理的真实目标位置。打开与保存附件直接修改这个目标文件；原消息下次读取、预览或下载使用当前字节、文件名、MIME 和大小。保存后刷新 Channel，可刷新显示的元数据。上传源文件独立。即使内容相同，两次独立上传也互不联动；只有显式复用同一个附件身份，多个消息才会引用同一个文件。

外部保存不创建附件版本、通知、Source Revision、Inbox Admission 或 Bot wake。目标文件缺失时报告不可用，不从原上传字节重建。Host 启动时转换保留的旧 hash 附件；成功迁移后提供相同编辑菜单，转换失败则保留旧文件的可读状态。Memory 保留既有 Git 行为。

## 存储与集成

新引用为 `{fileId,name,mime,size}`，旧引用为 `{hash,name,mime,size}`，身份必须二选一。不可变的消息 envelope 保留发送时引用，消息查询投影当前元数据。`channel_read_image` 用 `attachment_id` 传入返回的 `fileId`，旧图片仍使用 `hash`。Host 验证 Bot 当前 Channel 成员资格与消息归属后，读取符合大小限制的当前图片；`channel_read_image` 返回图片内容而不暴露 Host 路径；下述显式原件访问只返回经来源授权的指定路径。带原消息归属的旧图片 hash 在唯一匹配时解析到该消息的当前真实文件；没有消息归属、同一消息中含糊的 hash，以及新发送中的旧引用会被明确拒绝。刷新原消息取得 canonical fileId。可信 Channel 转发复用这份引用契约，目的地确认仍由 [#570](https://github.com/BotHarness/BotHarness/issues/570) 推进。

`$DSH_HOME/botharness/attachments/files/<uuid>/` 下的 `data/<安全文件名>` 就是真实目标，`record.json` 持久保存身份与传输回执。回执仅保存用于上传重试的校验值，不保存历史文件字节。Composer 重试复用同一个上传 key，不覆盖已经编辑的目标。发送验证 profile 归属；每次原生打开或下载重新解析 `channelId + messageId + fileId`。认证下载使用 `no-store`、服务器嗅探的 MIME 和 `nosniff`。

未完成传输的清理保持独立。引用感知清理从所有保留的 Source Event envelope（含已移除 Channel）标记身份，保护仍可达文件，之后才删除过期孤儿目标与记录；不启用自动保留期。后续 Profile Backup、选定 Export 与显式 Purge 必须覆盖当前引用文件及记录，保留共享身份，不能删除仍被保留事实引用的文件；明确导出捕获当时字节，不建立持续版本档案。本切片不新增这些产品。

设计见 [ADR-0100](adr/0100-file-open-actions-target-real-host-files.md)。可运行验收入口是 `scripts/e2e-real-attachment-files.mjs`：通过真实 composer 准备，在外部编辑器保存，验证原消息、独立上传和共享引用，重启同一 Profile，再验证缺失文件拒绝。登录地址与私有 fixture 留在 Git 外，只发布合成测试数据的截图。

## 旧消息迁移

Messaging 拥有 schema generation 39 的 `attachment_file_bindings`，按不可变 Source Event ID 与附件序号登记。Host 启动扫描所有保留的消息 envelope，含已移除 Channel。每个旧附件出现位置先在 `pending` 状态持久预留独立 UUID，再校验并流式传输旧 CAS 对象，由真实文件 owner 创建目标，重新读取并验证转换字节后才原子切换为 `ready`。查询先应用绑定再投影当前元数据；原 Source Event envelope、文本、placement 与 Inbox Admission 均不改写。Human 打开菜单时不会创建编辑副本。

旧表示只保存内容 hash，没有可信上传身份或复用来源。因此，相同 hash 也会得到独立目标，同一条消息中重复的附件亦如此；不能从 hash 相同推断历史共享。迁移后显式复用 canonical fileId 仍然共享。同一 Host 的并发启动调用共用一个迁移轮次。中断后保留预留 UUID，重启继续未完成转换，不产生重复目标；`ready` 绑定不再复制，即使当前文件已被编辑或缺失。失败转换继续使用可读的旧对象，并在有界 `attachment-migration` 开发日志中标记出现位置及修复／重启操作。损坏的旧对象仍报告不可用，不接受错误字节。

带消息归属的旧下载与图片读取解析到迁移后的当前目标，不返回冻结的旧 CAS 替代品。同一消息中旧 hash 解析到不同目标时，旧身份有歧义，必须改用当前 fileId；仍共同指向未转换 CAS 对象的重复引用保持可读。生产下载始终要求消息归属并使用 `no-store`，包含迁移中的旧引用。旧引用仅保留在历史事实 decoder 与带归属的兼容入口，不再用于新增可变消息文件。

引用感知清理标记 ready fileId 和所有 pending 预留 fileId；只要任一保留出现位置还未转换，其 legacy 对象就仍可达。仅在全部保留依赖安全转换后，既有显式 sweep 才能释放废弃共享 CAS 对象。迁移不启用自动删除，也不影响 SoulSnapshot 或其他 CAS。后续 Profile Backup／Export／Purge 必须覆盖 Operational Database 的绑定记录以及当前目标文件和回执；一次迁移及废弃兼容存储不提供附件历史 API。

Schema 激活是单向升级：旧的 hash-only 版本不能读取 generation 39 或新文件身份。恢复应向前修复，保留数据库、绑定与当前文件。升级前任何另行支持的备份仍由其 owner 负责；本功能不新增备份或恢复产品。真实验收使用 `scripts/e2e-legacy-attachment-migration.mjs`：旧版本 composer 真实发送，将私有 SQLite 备份导入新隔离 Profile，原生编辑器保存，带归属读取当前字节，验证源文件／独立附件隔离、持久注意力不变、重启和缺失文件拒绝。

## 让 PersonaBot 处理收到的文件

在本地 Bot Channel 展开 **Workspace Grants**，添加工作目录并展开该行。**允许 Bot 写入此文件夹** 默认为关闭；只为保存和生成文件所需的目录开启。关闭后阻止后续 Orchestrator 写入，不删除文件、不改变 Assignment 权限。Shell 仍需 Human 审批或匹配的已保存规则；写入权限变更会使旧规则范围失效。

上传任意格式文件，例如含 CSV 的 ZIP，并请求新结果。Orchestrator 通过 `channel_attachment_save` 另存独立工作文件，使用原生文件工具和经过审批的 Shell 处理，明确选择生成文件并通过 `channel_attachment_import` 导入，再回复独立可下载附件。父目录须已存在，另存不覆盖已有文件。原件引用保持不变，沿用 owner 的 25 MiB 传输上限；下载结果后检查实际内容。

检查原件时，请 Bot 读取指定附件。修改时明确说“修改这个原件”，例如“把这个原件 status.txt 中的 status=pending 改成 status=approved”。Bot 通过 `channel_attachment_open` 选择精确消息与文件：`read` 只允许原生读取，`edit-original` 沿用 Human 工具审批或匹配的已保存规则。只批准要改的那个原件。Bot 在返回的路径上使用普通原生 read/edit/write，不创建副本、不改变 Memory cwd。

刷新 Channel 后，从原消息下载或重新打开附件，检查当前内容。同一 fileId 的显式共享引用会展示修改，Host 重启后仍然如此；内容相同的独立上传和上传者的本地源文件不受影响。原生访问在当前回合结束后失效，每次操作复查来源成员资格。离开来源 Channel 或原件缺失后禁止后续访问，不从上传快照重建缺失原件。文件编辑不产生 Source Revision、文件变化 Inbox Admission 或自动唤醒；对话确认仍需显式回复。保留原生检查与 Shell 审批，不增加 BotHarness 锁或文件版本档案。

这些本地切片是 #632、#633。见 [ADR-0105](adr/0105-attachments-use-native-file-operations-under-source-authority.md)。

## 在原话题处理 Lark ZIP

按[连接指南](client-bridge.md#qualified-optional-im-provider)启动已验证临时 provider 的隔离 Profile。绑定一个 QA Bot 账号，授权测试群并开启提及收件。同一账号只保留一个 Host 接收连接。在 Bot 的 Workspace Grants 中，明确允许写入用于处理文件的目录。

向获准的 Lark 群／话题上传一个小型 CSV ZIP。回复该文件，使用普通文本并从真实成员候选选择 @Bot，请求返回新 ZIP。Bot Inbox 的「外部消息」详情展示文件名；「下载文件」按需获取原件。下载失败会明确显示，不表示传输成功。

Bot 通过 `bridge_read` 与 `bridge_attachment_save` 另存独立工作副本，使用原生文件工具及经审批的 Shell 处理，再通过 `channel_attachment_import` 明确选择新结果，使用 `bridge_reply_file` 以自己的账号回到准确原话题。文本与文件共用每个来源唯一的回复 intent，不先自动发送一条占用它的确认文本。请在 Lark 下载收到的结果并检查内容；「平台已接受」本身不能证明送达或已读。

原件保持不变。沿用 25 MiB 传输上限；撤销来源访问会阻止未来平台读取／回复，已完成的独立副本仍受其 Workspace Grant 约束。重启保留来源和文件身份，不重复不确定发送。这是 #657 的临时 provider 切片，不表示生产启用、Slack 支持或通用历史读取。见 [ADR-0107](adr/0107-external-files-use-trusted-source-capabilities-and-existing-owner.md)。
