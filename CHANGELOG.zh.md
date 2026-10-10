# DeepSeekBot 更新日志

这里记录 DeepSeekBot 值得关注的变化。添加或发布条目前，请先阅读
[Release Ledger 贡献指南](docs/agents/changelog.md)。

## [Unreleased]

像素头像新增精灵、矮人、兽人和会说话的花，以及胡子、中世纪服装和头饰；可以自己画头饰和头发并存入部件库；新建的 PersonaBot 会从全部物种中随机生成初始形象；兼容 Provider 可在绑定窗口内创建 Lark 应用或展示微信配对二维码。

### Breaking Changes

- Lark 普通角色新增 Profile schema Generation 78。升级前请备份；回滚需要兼容写入程序或恢复升级前备份（[#1373](https://github.com/BotHarness/DeepSeekBot/issues/1373)）。

- 收件箱历史引入 Profile schema Generation 77，新增可重建的 FTS5 trigram 索引。升级前请备份；重新打开已升级的 Profile 需要兼容的程序，或恢复升级前的备份（[#1278](https://github.com/BotHarness/DeepSeekBot/issues/1278)）。

- 记忆 commit 记录引入 Profile schema Generation 76（每个 Bot 的 commit 游标，以及每个 commit 只记一次的索引）。升级前请备份；重新打开已升级的 Profile 需要兼容的程序，或恢复升级前的备份（[#1277](https://github.com/BotHarness/DeepSeekBot/issues/1277)）。

- Bot 自我记录引入 Profile schema Generation 75，会重建 Source Event 与 Inbox Admission 表以接受新的类型。升级前请备份；重新打开已升级的 Profile 需要兼容的程序，或恢复升级前的备份（[#1276](https://github.com/BotHarness/DeepSeekBot/issues/1276)）。

- 部件库新增 Profile schema Generation 73。升级前请备份；升级后的 Profile 需要兼容的程序版本才能重新打开，否则请恢复升级前的备份（[#1211](https://github.com/BotHarness/DeepSeekBot/issues/1211)）。

- QQ 接收区间追加 Profile schema Generation 74，并复用既有接收边界字段；升级前备份，升级后应向前修复（[#1153](https://github.com/BotHarness/BotHarness/issues/1153)）。

### Added

- Bot DM 设置可编辑 Lark 普通角色行为与显式的批准一次／拒绝能力，或重新分配配对人员的角色；权限查询读取当前 revision，延迟的私聊审批决定重新校验当前权限（[#1375](https://github.com/BotHarness/DeepSeekBot/issues/1375)）。

- PersonaBot 可通过有界只读目录查询当前配对人员与角色、已配置的外部会话，以及在某个授权会话中观察过的配对人员；观察结果明确不完整，不代表当前群成员名单（[#1374](https://github.com/BotHarness/DeepSeekBot/issues/1374)）。

- Bot DM 设置支持 Lark 普通角色与可选的聊天配对审核：未配对的私聊和群 @ 等待审核而不唤醒模型，批准后通知重新提问，撤销关闭后续资格。模型接收可信发送者引用并按需查询当前权限，既有管理配对保持独立；独立测试 App 可配置一次并跨 worktree 复用（[#1373](https://github.com/BotHarness/DeepSeekBot/issues/1373)、[共享测试 App 指南](docs/agents/im-test-apps.md)、[ADR-0164](docs/adr/0164-lark-chat-pairing-is-reviewed-current-binding-authority.md)）。

- 窗口伙伴新增随文字播放的轻柔叽咕声与抓起、快速拖动、抛出及首次落地音效，按 Profile 保存开关且默认关闭；拖拽倾斜改用阻尼角度弹簧，让反向拖动与回摆连续，不增加模型工具或 TTS。空闲时隐藏占位状态气泡，操作按钮仅在悬浮或键盘聚焦时淡入；拖拽留下的鼠标焦点不再锁住阅读状态。长消息气泡隐藏滚动条并自动跟随最新播放文字；向上翻阅时保持阅读位置，回到底部后恢复跟随。关闭最后一张卡片后立即显示等待中的回复，小人仍保留键盘焦点时，后续新消息也能继续出现（[#1173](https://github.com/BotHarness/DeepSeekBot/issues/1173)）。

- CLI 可在运行中的 Host 创建空白、Zip／目录和 GitHub／Git PersonaBot，配置模型并查询 Channel、待办与 Session 摘要；失败保留已知完成结果，显式清理身份时保留 Memory。见 [CLI 指南](docs/bot-cli.md)（[#1363](https://github.com/BotHarness/DeepSeekBot/issues/1363)）。

- CLI 可经既有 Provider 完成飞书与微信的 IM 应用授权，返回手机扫码二维码，通过 stdin 提交凭据或验证码，并查询或取消同一次授权。参见 [CLI 指南](docs/bot-cli.md)（[#1318](https://github.com/BotHarness/DeepSeekBot/issues/1318)）。

- CLI 可经运行中的已认证 Host 发送 DM 并收取精确关联的已提交回复、查询回执、回答正式问题、一次性决定工具审批、读取发布状态及创建工作区授权。参见 [CLI 指南](docs/bot-cli.md)（[#1317](https://github.com/BotHarness/DeepSeekBot/issues/1317)）。

- PersonaBot 可用 `inbox_history` 跨 Session 搜索自己已接收的消息和已处理的自我记录，支持中英文，并按类型、频道、起因和时间筛选；有界历史读取不会改变注意力。文本搜索至少需要三个字符，相关性排序游标有效期为十分钟，Host 重启后失效（[#1278](https://github.com/BotHarness/DeepSeekBot/issues/1278)，[ADR-0154](docs/adr/0154-bot-self-records-keep-memory-commits-and-bot-actions-in-the-timeline-and-inbox.md)）。

- PersonaBot 在一轮工作中提交的每个记忆 commit，现在会在引起它的对话里显示为一行，带 commit 标题、短 hash 和改动的文件；点击会在该 Bot 的记忆历史里打开这个 commit。Bot 的收件箱同时把它保存为已处理的历史（[#1277](https://github.com/BotHarness/DeepSeekBot/issues/1277)，[ADR-0154](docs/adr/0154-bot-self-records-keep-memory-commits-and-bot-actions-in-the-timeline-and-inbox.md)）。

- Bot 设置新增 **IM 应用** 分区，列出 Lark、Slack、Discord、QQ 和微信上的所有应用及使用它们的 Bot，并可跳转到 DSH 设置管理凭据（[#1263](https://github.com/BotHarness/DeepSeekBot/issues/1263)，[ADR-0153](docs/adr/0153-bot-settings-is-a-botharness-owned-modal.md)）。
- 在 **IM 应用** 中可以把未绑定的应用绑定到 Bot、确认后解绑已绑定的应用，并在 Provider 支持时为选定的 Bot 创建 Lark 或微信应用（[#1264](https://github.com/BotHarness/DeepSeekBot/issues/1264)）。
- 没有自定义头像的群，在侧边栏、收起的侧栏和置顶区里显示最多四个成员 Bot 的头像，代替 `#`；这些头像保持静止，不显示 Bot 正在做什么（[#1270](https://github.com/BotHarness/DeepSeekBot/issues/1270)）。
- PersonaBot 思考或工作时，最新消息下方会出现一行：头像变成正在使用的工具，旁边是和输入框上方相同的简短状态；群里最多显示两个正在工作的 Bot，Bot 的回复开始输出时会接替这一行。停在最新消息处时，输入框上方的状态会淡出，向上翻看历史时再显示（[#1271](https://github.com/BotHarness/DeepSeekBot/issues/1271)）。
- QQ 会话可把后续提及同步到选定群 Channel 或仅进入 Inbox，停止同步后保留已接收历史，并在屏蔽／再次允许及重连后展示有界的本地接收区间，不声称补收远端历史（[#1153](https://github.com/BotHarness/BotHarness/issues/1153)，[QQ 接入指南](docs/qq-connection.md)）。

- 官方 QQ Bot 应用可绑定 PersonaBot，将群文字 @ 提及收入其收件箱，并携带原生接收回执在原群答复；开发 Provider 明确保留被动答复过期和发送结果不确定状态（[#1152](https://github.com/BotHarness/BotHarness/issues/1152)、[QQ 接入指南](docs/qq-connection.md)）。

- 其他部件也都能自己画了：衣服、配饰、胡子、眼镜、鼻子、腮红、花瓣和花盆都有 **绘制／修改这一片**，从当前戴的样式开始；外形颜色的像素仍会跟着变色；自绘的脸部部件不会挡住说话的嘴；物种或头饰隐藏内置部件时，自绘部件也会隐藏；**换回内置样式** 可恢复原来的选择。只有在取下自绘部件时，选内置样式才会升级旧头像的 recipe（[#1240](https://github.com/BotHarness/DeepSeekBot/issues/1240)）。
- 自绘部件可以分享了：导出的 Bot 会带上它戴着的部件，导入后这些部件会进入你的部件库，标记为“来自导入的 Bot”；单个部件可导出为任何地方都能预览的 PNG，并能无损导回；整个部件库可导出为这些 PNG 的 zip。导入时相同内容的部件会合并，并按内容重新计算部件身份，格式错误或过大的文件会被拒绝并给出提示；部件库可按来源筛选（[#1215](https://github.com/BotHarness/DeepSeekBot/issues/1215)）。
- 部件编辑器新增直线和矩形（按住 Shift 锁定直角和正方形）、带 4×4 或 2×2 抖动的明暗渐变、可调强度并可 **重新随机** 的杂色、吸管（也可按住 Alt 点击或长按），以及每笔只变亮或变暗一次的 **明暗笔**。所有工具都支持镜像，每次操作是一步撤销；结果仍是外形颜色加明暗，部件照样跟着变色。触屏上双指轻点撤销、三指轻点重做，**偏移光标** 配合 **按住绘制** 按钮，手指不会挡住要画的像素（[#1216](https://github.com/BotHarness/DeepSeekBot/issues/1216)）。
- 每片头发都能单独设颜色：前发、后发和新的单根呆毛（呆毛、卷翘或双呆毛）加入左右侧发颜色的行列，没选颜色时跟随发色。**头饰** 现在提供内置的猫耳、兔耳、马耳、小角、光环和新的小翅膀，可以和任意配饰一起戴；根部藏在头发后面，转头时远侧会隐藏。已保存的头像如果把这些当作配饰戴着，在你编辑前外观不变，编辑时会移到头饰位（[#1217](https://github.com/BotHarness/DeepSeekBot/issues/1217)）。
- 其他工具画的像素画也能变成部件：**导入部件文件** 现在也接受部件尺寸的普通 PNG（32×32、32×16 或其整数倍放大）。会先显示尺寸和颜色数，再选择保留几种颜色（最多 32 种，取最接近的颜色，不抖动）；导入的像素是固定颜色，可以用 **替换颜色** 换成外形颜色和明暗。内置头饰可以作为压平的起点打开；基于别人部件保存的新部件会记录父部件并保留原作者名字。部件库筛选新增 **基于其他部件修改** 和 **来自导入的图片**（[#1219](https://github.com/BotHarness/DeepSeekBot/issues/1219)）。
- 像素头像可以是动物了：猫、狗、狐狸、兔子和熊各有口鼻、动物鼻子和自己的耳朵，并有建议毛色（肤色就是毛色，也可以选任意颜色）。**毛色花纹** 提供虎斑、斑点、奶牛斑和重点色，用毛色明暗绘制，换色后仍保留；也可以自己画花纹。动物戴耳朵类头饰或配饰时会保留但隐藏，并显示说明（[#1218](https://github.com/BotHarness/DeepSeekBot/issues/1218)）。
- 头发也能自己画了：在前发、左右侧发或后发里，从当前戴的样式开始（压平成像素），用同样的工具改形状，存进部件库并戴在这个位置。自绘头发会像内置头发一样上阴影、跟着发色变色、随头部转动，戴头盔／兜帽或变成花朵时会隐藏。点 **换回内置样式** 可恢复原来的选择（[#1238](https://github.com/BotHarness/DeepSeekBot/issues/1238)）。
- 可以为像素头像自己画头饰：铅笔、橡皮、填充、沿脸部中线镜像，前层盖在头发上、后层在头发后面，支持撤销重做，并在真实头像上显示 1× 预览。颜色可以跟随头像的发色、肤色、眼睛或衣服颜色（五档明暗），也可以是固定色。保存的部件进入 Profile 里的部件库，任何 PersonaBot 都能戴上；戴上的副本会在窗口伙伴里随头部转动和说话，并随导出的 Bot 一起带走；修改库里的部件会另存为新部件，不会改变已经戴着旧部件的头像（[#1211](https://github.com/BotHarness/DeepSeekBot/issues/1211)）。
- 像素头像新增精灵、矮人、兽人和会说话的花。胡子始终露出说话的嘴，新增盔甲、法袍、束腰外衣和斗篷，戴上头盔或兜帽会遮住下面的头发。花有豆豆眼、五种花瓣样式，以及茎叶或花盆。当前物种或头饰不显示的选择会保留并给出提示，换回后恢复（[#1212](https://github.com/BotHarness/DeepSeekBot/issues/1212)、[#1213](https://github.com/BotHarness/DeepSeekBot/issues/1213)）。
- 新建的 PersonaBot 会按名字从全部物种、部件和服装中随机生成初始形象，已有的 PersonaBot 保持原来的样子（[#1214](https://github.com/BotHarness/DeepSeekBot/issues/1214)）。
- 绑定应用窗口可通过兼容 Provider 的配置能力创建 Lark／飞书应用或开始微信扫码配对，并绑定已验证身份，凭证不经过 BotHarness；旧 Provider 继续使用 IM 设置路径。内联配置会保留已有微信账号，避免替换原有配对。[Lark 配置清单](docs/lark-connection.md) 补充受保护回复所需的原消息读取权限（[#1111](https://github.com/BotHarness/DeepSeekBot/issues/1111)）。
- 外部编程智能体无需点击即可创建 PersonaBot：`deepseekbot create` 支持空白、Bot 包（目录或 zip）与 GitHub 三种来源，可指向任意 DSH_HOME，并向标准输出打印机器可读的 JSON（Bot id、私聊通道、数据目录、步骤状态、下一步操作）；名字只是标签，重复名字会生成新的 Bot，密钥只能走环境变量或标准输入。见 [Bot 命令行指南](docs/bot-cli.md)（[#1304](https://github.com/BotHarness/DeepSeekBot/issues/1304)，[ADR-0156](docs/adr/0156-programmatic-bot-creation-is-a-machine-first-cli-over-registry-creation.md)）。
- 同一 CLI 现在可无界面管理模型：`model-presets` 列出预设，`model-preset-create` 用显式路由新建预设，`model-preset-apply` 应用到 Bot，`model-plan` 查看生效方案与 deferred 就绪状态；路由离线做形状加 provider 存在性检查，密钥有效性仍在 Host 侧。见 [Bot 命令行指南](docs/bot-cli.md)（[#1310](https://github.com/BotHarness/DeepSeekBot/issues/1310)，[ADR-0157](docs/adr/0157-cli-model-validation-is-tiered-key-validity-stays-host-side.md)）。
- 同一 CLI 现在覆盖 Bot 生命周期与人类命名：`pause`/`resume` 开关执行，`update` 改名/简介/标签，`human-name-set` 写人类显示名，`channel-human-name-set` 写分 channel 人类昵称，全离线可用、错误按码返回。见 [Bot 命令行指南](docs/bot-cli.md)（[#1312](https://github.com/BotHarness/DeepSeekBot/issues/1312)）。
- 同一 CLI 现在可读 Channel、管理授权与计划、查看配对：`channels` 与 `channel-messages` 看历史，授权的列出/撤销/写开关，计划的增删改查、历史、手动触发与预渲染，`pairings` 看 IM 配对状态；新建授权仍是 Host 侧动作。见 [Bot 命令行指南](docs/bot-cli.md)（[#1313](https://github.com/BotHarness/DeepSeekBot/issues/1313)）。
- 同一 CLI 现在可零点击配置密钥：`secret-put` 只从标准输入读值，以行级编辑写入 `$DSH_HOME/.credentials.yaml`（备份加回读校验），`secret-list` 只列名字不返回值，`secret-unset` 删除条目。见 [Bot 命令行指南](docs/bot-cli.md)（[#1314](https://github.com/BotHarness/DeepSeekBot/issues/1314)，[ADR-0158](docs/adr/0158-secret-put-writes-credential-refs-by-line-edit.md)）。
- 在线 CLI 动词将走 DSH HTTP 单次调用通道（每次调用做 token 到 cookie 登录），永不直连 operational database；bridge 与 gateway 错误码原样透出。见 [ADR-0160](docs/adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md)（[#1315](https://github.com/BotHarness/DeepSeekBot/issues/1315)）。
- 同一 CLI 现在可自发现：`search` 按词在实际分发的动词表里找命令，`--compact` 把标准输出 JSON 压成一行供智能体使用。见 [Bot 命令行指南](docs/bot-cli.md)（[#1316](https://github.com/BotHarness/DeepSeekBot/issues/1316)）。
- 同一 CLI 现在可无界面读写 Bot 记忆：`memory-snapshot`、`memory-file`、`memory-history`、`memory-diff` 读取记忆库，`memory-save` 写一个文件并提交（支持 compare-and-swap head 与幂等 edit id）；冲突与非法 sha 按错误码失败。见 [Bot 命令行指南](docs/bot-cli.md)（[#1311](https://github.com/BotHarness/DeepSeekBot/issues/1311)）。
- 本机 Bot 浏览器现在像 Computer 一样支持人工接管：Host 直供的实时画面支持点击、滚动和键盘输入（小屏幕默认触控板模式），需要验证时 Bot 按 ask-permission 流程发起接管——生成带说明的一次性链接，等待完成后校验页面状态再继续。输入的密码只留在实时画面里，不会进入聊天或日志；每次接管都留下审计记录与会话录制（[#1322](https://github.com/BotHarness/DeepSeekBot/issues/1322)，[ADR-0163](docs/adr/0163-local-browser-takeover-reuses-computer-viewer-family.md)）。
- 全新安装的 `deepseekbot` 现在随 Core、Client 和已验证的 IM Provider 默认附带 Browser 与 Computer Bundle，新 Profile 无需额外安装即可浏览网页和操作电脑；IM 账号在添加应用凭据前保持未连接，每个 Bot 的 Browser／Computer Access 在显式开启前保持关闭。已有 Profile 升级后即获得新的默认 Bundle；如曾单独启用 Browser 或 Computer Bundle，请先移除其独立 Bundle 条目，保留已存数据（[#1328](https://github.com/BotHarness/DeepSeekBot/issues/1328)，[ADR-0160](docs/adr/0160-deepseekbot-default-bundles-browser-computer-and-im-provider.md)）。

### Changed

- 新手教程改为多步 driver.js 界面导览：依次介绍欢迎信、消息列表、收件箱、Bot 设置、会话头部、输入框、右侧栏和窗口伙伴，不再是 Bot 模式内容区顶部的常驻横条；首次进入 Bot 模式自动开始，关闭即暂停，浮层内提供「跳过教程」，**Bot 设置 → 通用** 可重新开始；已完成教程的 Profile 不再看到任何教程横条（[#1295](https://github.com/BotHarness/BotHarness/issues/1295)，[#1301](https://github.com/BotHarness/BotHarness/issues/1301)，[ADR-0155](docs/adr/0155-onboarding-tutorial-is-a-floating-tour-replayed-from-bot-settings.md)）。

- 预设欢迎消息改为 Bot 的第一人称来信：banner、头像、名字与标签，四张建议问题保留为回信选项；时间线里这条消息的作者显示 Bot 名字，而不是 System（[#1301](https://github.com/BotHarness/BotHarness/issues/1301)）。

- 记忆 commit 查看页的顶部现在只显示短 hash 和 commit 信息；「从某个记忆新建分支」移到了记忆演化图里对应 commit 的右键菜单（[#1288](https://github.com/BotHarness/DeepSeekBot/issues/1288)）。

- PersonaBot 因为群聊或 Bot 私聊而给另一个 Bot 发私信时，「发送了私聊消息」这一行（现在带两个 Bot 的头像和名字）显示在引起它的那个对话里，而不是发送方的私聊；发送方的 Bot Inbox 同时保留一条已处理的记录；两个 Bot 在彼此的私聊里来回回复，不再往 Human 私聊里加事件行。这类事件行不再计入未读、没有已读回执，也不会成为频道预览（[#1276](https://github.com/BotHarness/DeepSeekBot/issues/1276)，[ADR-0154](docs/adr/0154-bot-self-records-keep-memory-commits-and-bot-actions-in-the-timeline-and-inbox.md)）。

- Bot 设置改为独立窗口，从 Bot 面板的齿轮打开，左侧按通用、模型与运行、消息、Computer、Browser、窗口伙伴、数据与隐私、高级、关于分区，不再是混在其他插件设置中的一整页长列表；DSH 设置中的 **Bot 设置** 会直接切换到这里，遥测提示和窗口伙伴菜单会打开各自的分区（[#1260](https://github.com/BotHarness/DeepSeekBot/issues/1260)，[#1261](https://github.com/BotHarness/DeepSeekBot/issues/1261)，[ADR-0153](docs/adr/0153-bot-settings-is-a-botharness-owned-modal.md)）。
- 窗口较窄时，Bot 设置改用顶部下拉菜单切换分区，不再显示侧边栏（[#1262](https://github.com/BotHarness/DeepSeekBot/issues/1262)）。

- Channel 附件卡片统一为 320px 同一形态：音频附件改用气泡内自绘播放器播放，不再按文件行显示；文件卡片纵向排布名称与易读尺寸，并以分隔线加直接下载按钮呈现（[#1290](https://github.com/BotHarness/DeepSeekBot/issues/1290)）。

- 自己的消息头与气泡方向镜像：名字贴右边缘，时间在名字左侧，与左侧 Bot 的顺序对应（[#1298](https://github.com/BotHarness/DeepSeekBot/issues/1298)）。

### Fixed

- 窗口伙伴按每个 Bot 独立错开眨眼时点与空闲间隔，外形相同的伙伴也不再同步眨眼（[#1367](https://github.com/BotHarness/DeepSeekBot/issues/1367)）。

- 窗口伙伴说话时全张嘴改为更平的开口，保留半张嘴、原有表情、头像和说话节奏（[#1241](https://github.com/BotHarness/DeepSeekBot/issues/1241)）。

- 窗口伙伴在拖拽、键盘移动与减少动效下松手时，同步更新人物和气泡来源锚点，无需等待下一动画帧（[#1248](https://github.com/BotHarness/DeepSeekBot/issues/1248)）。

- 用键盘阅读窗口伙伴气泡或调整窗口尺寸时，不再滚动外层舞台、让人物悬在底部上方；气泡内部仍可滚动（[#1173](https://github.com/BotHarness/DeepSeekBot/issues/1173)）。

- 窗口伙伴快速甩到可见内容区外后仍会继续下落，绘制帧延迟也不再让重力变慢而看似悬空。松手会立即结束拖拽，迟到的鼠标移动不会把人物重新抓住，同时仍避免松手误开私聊。可见性检测改为跟随固定显示区域，页面隐藏或整个区域离屏时仍暂停动画（[#1173](https://github.com/BotHarness/DeepSeekBot/issues/1173)）。

- 通过 Channel ID 打开 Bot 私聊（包括首次进入 Bot 模式）时，现在显示对应 PersonaBot 的侧栏，并与 Bot 导航共享收起与展开偏好；旧对话元数据不会再导致侧栏显示其他 Channel 的条目（[#1361](https://github.com/BotHarness/DeepSeekBot/issues/1361)）。

- 点击教程遮罩会进入下一步，不再退出引导；最后一步执行完成按钮的动作。底部的跳过保留为文字，上一步、下一步和完成改用带无障碍名称的图标，按钮和进度不再挤压换行（[#1356](https://github.com/BotHarness/DeepSeekBot/issues/1356)）。

- Profile 的 Token 用量卡片将 Provider 未上报部分用量的说明收进标题旁的信息图标，悬停、键盘聚焦或点击时才显示，不再占用卡片正文空间（[#1355](https://github.com/BotHarness/DeepSeekBot/issues/1355)）。

- CLI 密钥编辑验证磁盘上的真实 YAML，失败恢复原文件；支持空的内联 refs 和多行值，携带密钥值的参数不会在错误中回显（[#1347](https://github.com/BotHarness/DeepSeekBot/issues/1347)）。

- App sidebar 的会话标题右侧显示最新消息时间，无消息时留空。Bot Channel 顶部 chip 不再显示 PersonaBot tags，Profile 中仍保留 tags（[#1354](https://github.com/BotHarness/DeepSeekBot/issues/1354)）。

- Bot Browser 首次后台标签可在 Chrome 启动窗口尚未就绪时打开，本地 Web 首装期间也能看到下载进度；额外的开发刷新连接现在仅在 `?botharness-dev-reload=1` 时启用（[#1339](https://github.com/BotHarness/DeepSeekBot/issues/1339)）。

- PersonaBot 刚发出回复、还在收尾时，工作状态行不再以「思考中」重新出现在回复下方；只有一条新消息时，「跳到最新」提示的英文改用单数（[#1284](https://github.com/BotHarness/DeepSeekBot/issues/1284)）。

- 已静止的 Assignment 等待工具审批时释放运行名额，让其他事项继续；审批决定收到后，原调用先等待名额再继续，卡片分别显示两种等待。等待会话有独立上限，有后代的 root 保守占用名额，撤权或重启均不重放原调用（[#1037](https://github.com/BotHarness/DeepSeekBot/issues/1037)）。

- Bot 设置中，Computer 的 **Import…** 在目录没有归档时不再弹空菜单，选项为空的下拉框也不再渲染悬浮空盒，空下拉不再像坏掉的选项（[#1309](https://github.com/BotHarness/DeepSeekBot/issues/1309)）。

- 窄屏下消息气泡不再被常驻的回复和复制按钮挤占横向空间，这两个操作收进气泡的长按菜单；桌面端的悬停显示和右键菜单保持不变（[#1346](https://github.com/BotHarness/DeepSeekBot/issues/1346)）。

### Documentation

- 记录了设计：PersonaBot 的记忆 commit 和它通过 BotHarness 工具做的事，将以频道事件行的形式留在引起它的对话里，并作为可搜索、不会叫醒 Bot 的 Bot Inbox 历史保存；运行时行为暂未改变（[ADR-0154](docs/adr/0154-bot-self-records-keep-memory-commits-and-bot-actions-in-the-timeline-and-inbox.md)，[#1272](https://github.com/BotHarness/DeepSeekBot/issues/1272)）。

- 记录五个窗口伙伴的前台帧耗时、真实消息并发、消息流恢复与 Client 重载测量、十次钉选循环后的堆内存观察、相同头像版本和 Profile 的走动试测及独立的主渲染线程阶段观察、明确标注中断的当前版本对照、独立的 Windows GPU 进程计数，以及真实浏览器进程重启验证，附可复现流程、已确认的限定范围性能预算及尚未完成的验收项；目前没有已确认的 SVG 独立 GPU 归因，整体性能尚未验收通过（[报告](docs/research/2026-10-09-window-companion-performance.md)、[#1167](https://github.com/BotHarness/DeepSeekBot/issues/1167)）。

## [1.2.0] - 2026-10-08

Bot 可以作为像素窗口伙伴固定在窗口里播放回复；绑定一个应用即可在飞书、Slack、Discord 和微信收发消息；群 Channel 可以连接外部会话；Bot 可以导出为 zip 并在别处导入；Bot 资料页新增横幅、标签和简介，设置项移到 Channel 侧栏；Bot 市场改为资料卡；Bot 模式可以帮你安装 Git；首次进入 Bot 模式会带你完成一次真实对话。

### Breaking Changes

- 环境恢复新增 Schema Generation 72；升级后应向前修复。恢复环境保留身份和历史，但需要明确授权目标本地模型并激活新会话；旧 Session 和 Outbox 工作不会重放（[#886](https://github.com/BotHarness/DeepSeekBot/issues/886), [guide](docs/settings.md#complete-environment-backup-and-restore)）。

- 内容清除新增 Profile schema Generation 70 与必须保留的独立 Purge Ledger；恢复运行数据库快照时须保留该账本，升级后应向前修复。v2 检查点包含托管文件选择器并兼容导入 v1 纯文本检查点；回退代码或运行数据库不能撤销已接受的清除事实（[#897](https://github.com/BotHarness/DeepSeekBot/issues/897)）。
- Bot 引导增加 Profile schema Generation 71。升级前请备份；升级后的 Profile 需使用兼容版本，或从升级前备份恢复（[#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175)）。
- PersonaBot 删除引入 Profile schema Generation 66；升级前应备份，回退应向前修复而非仅回退代码。直接调用 Registry `remove`／`purge` 现会拒绝，需使用经确认的删除 owner，保留身份与用量历史（[#896](https://github.com/BotHarness/BotHarness/issues/896)）。

### Added

- 欢迎消息仅在原生搜索凭据和 Bot 的搜索工具已配置时提供带来源的今日 AI 新闻，否则显示通用工作规划示例；新闻请求明确要求如实说明搜索失败（[#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174)）。

- 像素头像可以选择哥布林：尖耳朵穿出头发、带小獠牙、配建议的绿色肤色；左右侧发可以分别选择样式和颜色。哥布林在 Window Companion 中同样支持转头和说话嘴型，随机也会覆盖两个物种，已有头像渲染不变（[#1210](https://github.com/BotHarness/DeepSeekBot/issues/1210)、[ADR-0148](docs/adr/0148-avatar-species-and-custom-parts-extend-one-pixel-rig.md)）。

- 欢迎消息提供每天 21:00 的晚间问候示例，选择前显示浏览器时区与当前私聊；无法识别时区时先询问，既有模型配置流程保留完整请求并等待明确发送（[#1228](https://github.com/BotHarness/DeepSeekBot/issues/1228)）。

- Bot 市场现在会显示每个 Bot 的资料横幅：列表每一行有缩略图，详情页顶部是完整横幅；没有横幅的 Bot 显示中性占位。市场 Worker 从 `.botharness/bot.json` 读取 `banner`：像素场景在本地绘制，上传的图片按收录时的提交从仓库加载（[#1093](https://github.com/BotHarness/BotHarness/issues/1093)）。

- 欢迎消息的十分钟提醒会展示浏览器时区，明确只提醒一次并发回当前私聊；主程序计算相对提醒时间，避免向下取整导致提前，Bot 获得简洁的一次性任务与明确投递位置指引（[#1208](https://github.com/BotHarness/DeepSeekBot/issues/1208)）。

- 每个 Bot 的资料页和资料小窗顶部都有了横幅。新建的 Bot 会按名字挑一张像素场景，改名不会变；已有的 Bot 在下次启动时补上一张。点 **更换横幅** 可以从十个场景里挑、换一张、上传图片并裁成 3:1，或恢复生成的场景。`.botharness/bot.json` 记录横幅，`.botharness/banner.png` 总会写入，Bot Zip 导出、导入和从 Git 导入都会保留它（[#1092](https://github.com/BotHarness/BotHarness/issues/1092)）。

- 完成首次真实 Bot 对话后，欢迎消息提供可选的「绑定应用」入口，复用既有平台选择和官网教程；选择「暂时不绑定」保留完成状态，绑定结果与接收状态以真实记录为准（[#1203](https://github.com/BotHarness/DeepSeekBot/issues/1203)）。

- Bot 模式首次真实回复后，欢迎消息提供可选的记忆体验：查看现有记忆文件与实际变更，或将自由填写的偏好作为普通私聊请求发送；跳过不打扰，也不会把初始模板或回复当作保存成功的证据（[#1200](https://github.com/BotHarness/DeepSeekBot/issues/1200)）。

- Bot 设置可导出、检查一个完整且已验证的 `.botharness-backup`，包含自定义及已删除身份保留的 Memory、当前附件、模型模板与独立计划，以及真实清除检查点；安装包提供的本地命令仅恢复至新的停止环境（[#886](https://github.com/BotHarness/DeepSeekBot/issues/886), [guide](docs/settings.md#complete-environment-backup-and-restore)）。

- 窗口伙伴气泡随像素半身的头部倾斜、拉伸与移动定位；卡片因避让或视口限位偏移时保留来源连线，文字保持直立；窗口缩小时人物与连线锚点同步限位，图片与不支持的形象使用可见盒子顶部锚点（[#1177](https://github.com/BotHarness/DeepSeekBot/issues/1177)）。

- 微信身份启停与原生输入状态可分别继承全局默认值或保留 Bot 自定义；升级保留现有选择，界面不显示未支持的群聊／Thread 设置（[#912](https://github.com/BotHarness/BotHarness/issues/912)，[指南](docs/wechat-connection.md)）。

- 隔离 AX 启动向 coding agent 提供有界、白名单化的真实 Client 启动／运行证据和明确 shell 就绪状态，跨文档重试保留首次失败（[#1184](https://github.com/BotHarness/DeepSeekBot/issues/1184), [guide](docs/dev/guides/client-startup-diagnostics.md)）。

- 已结束群聊可查看保留历史，并单独预览、确认 Source Event 内容清除，确认前展示全部共享位置、收件记录、托管文件与依赖效果。独占的当前／旧版附件会清理，共享文件保留，中断清理重启后继续，已发出回复保留真实结果；恢复检查点和异步清除屏障为后续 Profile 备份提供合同（[#897](https://github.com/BotHarness/DeepSeekBot/issues/897)，[验收指南](docs/agents/qa-channel-purge.md)）。
- 首次进入 Bot 模式会准备一个 DeepSeek Bot、真实私聊，以及能力介绍、新闻和定时请求的欢迎选项；模型保存与问题发送分步进行，保留未发出的请求，支持 Profile 默认模型与 Bot 继承，只有收到真实回复才算完成；欢迎消息收紧间距，底部创建入口使用独立的主题强调色按钮，提问默认隐藏 Session 来源与短标题，仅开发者模式展示，其他回答使用紧凑输入提示，切换偏好保留答案；欢迎与提问选项复用首尾圆角相连的侧栏卡片，使用独立背景、直接单选和复选框多选，引导与全局模型设置复用 Bot 编辑器的模型和推理强度控件。教程进度可跨重启恢复，安全的手动重试沿用原 Human 消息（[#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175)，[ADR-0147](docs/adr/0147-onboarding-is-profile-progress-over-canonical-dm-evidence.md)）。

- 钉选的窗口伙伴在审批之外显示正式待答问题，可通过相连选项列表、复选框多选或紧凑输入直接回答，无需切换聊天；草稿不受新消息及开发者模式切换影响，只有既有提问拥有者可接受回答并恢复原本等待的 Session（[#1179](https://github.com/BotHarness/DeepSeekBot/issues/1179)）。

- 已钉选的窗口伙伴常驻显示工具审批请求，Human 无需打开 Bot 私聊即可处理，沿用既有审批拥有者、规则确认、断线状态校验与请求延迟移除后的键盘焦点恢复（[#1178](https://github.com/BotHarness/DeepSeekBot/issues/1178)）。
- 支持的像素窗口伙伴会随着已提交消息逐字呈现而开合嘴，在标点处闭嘴，播放结束、取消或切到后台后恢复保存的表情；名册头像与图片降级保留原有形象（[#1143](https://github.com/BotHarness/DeepSeekBot/issues/1143)）。

- 窗口伙伴独立于 Bot 模式跟随归档和删除，保留图片及未知版本快照回退，并支持键盘阅读与操作；键盘菜单在定位完成后接收焦点，关闭时将焦点交还原控件；动态效果偏好变化立即归位，离屏呈现和旧动画停止，不重播旧消息 ([#1142](https://github.com/BotHarness/DeepSeekBot/issues/1142)).

- 窗口伙伴在同一 Host 的短暂断线后，有界恢复尚未播放且仍符合范围的回复，暂时关闭的消息流会重试，保留阅读进度；页面隐藏时暂停呈现。重新开启来源只播放后续消息，首次钉选及 Client／Host 重启不重播历史（[#1141](https://github.com/BotHarness/DeepSeekBot/issues/1141)）。

- 窗口伙伴可以独立开启群聊消息，按每个 Bot 选择仅自己的私聊、共同会话或该 Bot 的全部会话；Bot–Bot 私聊标明双方参与者，所有气泡标明原 Channel 并遵守其现有读取权限。切换来源或范围只移除不再符合条件的卡片，保留仍可见的阅读和排队消息，新开启来源只播放后续已提交的 Bot 正文，不改变已读位置（[#1140](https://github.com/BotHarness/DeepSeekBot/issues/1140)）。

- Human 可从 Profile 删除 PersonaBot，默认保留记忆，明确选择清除已验证独占的仓库，并打开 Host 上的记忆文件夹、检查或重试未完成的清理；删除保留历史并永久关闭原身份的运行入口（[#896](https://github.com/BotHarness/BotHarness/issues/896)）。

- 飞书、Slack 和 Discord 的群现在显示真实群名，不再显示 ID：外部身份、接入的外部会话、频道里的消息和 Bot 读到的内容都改为群名，Bot 仍会同时看到 ID。Discord 群显示为「服务器 #频道」。飞书发送者名字查询放宽了超时，并按应用缓存；查询失败时退回显示 ID。已有条目会在下一条消息到达时更新名字（[#1151](https://github.com/BotHarness/BotHarness/issues/1151)，[外部连接器教程](docs/channel-sidebar/external-connectors.md)）。
- 群频道可以接入外部会话：在群频道侧栏的「外部连接器」中点 **接入外部会话**，选一个已绑定的应用和它已知的一个群，之后这个群里的每条消息都会出现在频道里。成员 Bot 默认只把这些消息当作上下文，只有被 @ 时才会被唤醒；接入的唤醒设置可以改成攒够条数后唤醒或每条立即唤醒，成员在频道里单独设置的唤醒策略仍然优先。每一行显示状态和最后一条消息的时间，可以用开关暂停，**删除** 后不再接收新消息，已接入的消息保留（[#1145](https://github.com/BotHarness/BotHarness/issues/1145)，[ADR-0143](docs/adr/0143-an-external-conversation-streams-into-a-channel-as-one-way-context.md)，[外部连接器教程](docs/channel-sidebar/external-connectors.md)）。
- 私聊已绑定的 Slack 应用，消息现在会进入 Bot 收件箱，Bot 直接在私聊里回复，不开 thread；Discord 应用也重新出现在 **绑定应用** 里。开发用的 IM Provider 换到新的 dsh-im 版本，包含 Slack 私聊接收、Discord checked 发送，以及 Slack/Discord 回复里的 checked @（[#1125](https://github.com/BotHarness/BotHarness/issues/1125)、[外部身份指南](docs/channel-sidebar/external-identities.md)）。

- 从侧栏菜单或 Channel 顶部各 Bot 的独立按钮可钉选多个透明像素窗口伙伴，各自保留真实 Activity、新 Human–Bot 私聊气泡、拖拽物理效果、阅读列表和走动偏好；Profile 共用设置控制层叠层数与有界卡片容量，重启恢复偏好且不重播旧消息。减少动效时关闭下落和姿态效果，暂停只停止走动，不暂停 Bot 执行（[#1138](https://github.com/BotHarness/DeepSeekBot/issues/1138)、[#1139](https://github.com/BotHarness/DeepSeekBot/issues/1139)）。

- 一个 Bot 可以绑定同一平台的多个应用，例如两个飞书应用：每个应用的私聊和 @ 都进入同一个收件箱，并通过收到消息的应用回复。**绑定应用** 列出所有已连接的应用，已被 Bot 使用的应用置灰并注明是哪个 Bot；外部身份按平台列出这个 Bot 的应用。Bot 在同一个群里有两个应用时，转发来源的回复会明确拒绝（[#1110](https://github.com/BotHarness/BotHarness/issues/1110)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。

- **编辑外部身份** 里的会话列表现在可以管理：会话分为 **等待处理**、**活跃**、**已静音**、**已屏蔽**。**静音** 后消息照常进入收件箱但不唤醒 Bot，**规则** 单独调整一个群的收件和唤醒，**屏蔽**（需确认）会取消未发出的回复，重启、解绑再绑定后依然有效；**再次允许** 从下一条消息重新开始，不补收。新增 **新会话** 设置，可选 **自动接收** 或 **先问我**；等待中的会话只记录名称和次数，不保存消息内容。每个应用每小时最多自动加入 20 个新会话、最多 500 个活跃会话，超出时进入等待并显示原因（[#1109](https://github.com/BotHarness/BotHarness/issues/1109)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。

- Slack、Discord 和个人微信也能一步绑定：**绑定应用** 后，私聊 Slack 或 Discord 应用、或在频道里 @ 它，消息直接进入 Bot 收件箱并在原话题回复；个人微信只接收扫码者本人的私聊，其他联系人和群不会进入。绑定弹窗对所有平台显示真实接收状态，已记下的群会话跟随平台全局默认的群收件和唤醒设置（[#1112](https://github.com/BotHarness/BotHarness/issues/1112)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。

- 绑定飞书应用就能收发：外部身份里的 **绑定身份** 改为 **绑定应用**，绑定后私聊这个应用、或在群里 @ 它，消息直接进入这个 Bot 的收件箱，Bot 在原会话回复，不需要保存投递目标、授权会话或打开收件开关。第一条消息会自动记下会话，应用行显示会话数，点开可查看只读会话列表；绑定后弹窗显示真实的接收状态。`/pair` 仍由配对处理，已有授权的行为不变，所有已绑定应用升级后都默认自动接收新会话（[#1108](https://github.com/BotHarness/BotHarness/issues/1108)，[ADR-0142](docs/adr/0142-a-bound-app-admits-its-direct-messages-and-mentions.md)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。

- 经 Web 审核的 Lark 用户可按名称选择管理私聊，接收工具审批并点击「允许一次／拒绝」；回调复核实际点击者和准确的原生调用，Profile 分开展示通知投递、决定接受及原生执行结果。确定未发送的重试有上限，未知投递及重启后的旧卡片不能授权执行（[#1029](https://github.com/BotHarness/BotHarness/issues/1029)、[ADR-0141](docs/adr/0141-lark-private-approvals-rejoin-the-native-owner-through-checked-controls.md)）。

- AX 隔离 Profile 可在一次隐藏输入设置后复用本机 OpenCode Go 凭证和内置默认模型，保留各 Profile 的独立配置；经核验的 DSH 0.2.0 RC1 适配器补齐真实 Go 回复要求的实际 Session 请求头（[#1079](https://github.com/BotHarness/BotHarness/issues/1079), [指南](docs/agents/ax-model.md)）。
- 新增微信原生输入状态源码预览候选，随已授权扫码者私聊的实际处理启动，有界续期并在处理结束或授权失效时清理，身份设置可单独关闭；原生客户端显示和打包产品验证仍由 [#911](https://github.com/BotHarness/BotHarness/issues/911) 跟踪（[指南](docs/wechat-connection.md)、[ADR-0145](docs/adr/0145-wechat-typing-follows-owned-processing-leases.md)）。

- 个人微信已授权扫码者私聊支持受控主动文字报告，复用纯外部 Outbox、发送前授权检查及私有上下文缺失的恢复提示；Profile 可显式投递，客户端确认和实际返回的原生服务器消息 ID 分开记录，不宣称送达或已读回执（[#910](https://github.com/BotHarness/BotHarness/issues/910)，[指南](docs/wechat-connection.md)）。

- 个人微信扫码者私聊支持频道连接器，可明确投递到本地 DM／群聊或仅进入 Bot Inbox；多个目标引用同一 Source Event，各成员独立设置唤醒。共享阅读者对外回复仍需自己的身份和授权，不代表支持原生微信群或话题（[#909](https://github.com/BotHarness/BotHarness/issues/909)）。

- 新增候选 Lark 图片预览，在原 Channel 气泡保留原生图文顺序，按可见区域加载、点击放大并复查当前 Channel／来源授权，图片接收开关贯通到账号接收器；停止接收保留已取得图片，解绑／撤销则拒绝受影响路径（[#1021](https://github.com/BotHarness/BotHarness/issues/1021), [教程](docs/lark-connection.md)）。
- PersonaBot 可读取微信原生引用正文，或从当前授权私聊的本地保留记录解析缺失引用；来源详情区分原生、本地解析与不可用，本地上下文支持有界 cursor 续页，不宣称微信远端历史能力（[#908](https://github.com/BotHarness/BotHarness/issues/908)，[指南](docs/wechat-connection.md)）。
- 新增 Lark 私聊 `/pair` 申请、认证 Web 审核、显式选择当前 Bot 的能力及重启后保留的撤销记录；配对消息不进入 Bot Inbox 或 Memory，IM 决策控件由后续切片接入（[#1027](https://github.com/BotHarness/BotHarness/issues/1027)、[guide](docs/lark-connection.md)、[ADR-0136](docs/adr/0136-lark-pairing-is-reviewed-bot-scoped-operational-authority.md)）。
- 新增个人微信受控视频链路，可按需播放／下载来源视频，并用 Bot 自己的身份发送原生视频回复，保留私密路由与当前授权；浏览器播放和工具读取不代表模型已理解视频（[#907](https://github.com/BotHarness/BotHarness/issues/907)，[指南](docs/wechat-connection.md)）。
- 微信原生语音可下载原文件，支持的 SILK 音频可显式准备播放或保存独立 WAV 工作副本；解码有大小、时间限制并校验当前来源授权，语音识别和原生语音回复仍是独立能力（[#906](https://github.com/BotHarness/BotHarness/issues/906)、[指南](docs/wechat-connection.md)）。
- Discord 支持独立的外部平台默认设置，涵盖群收件、普通消息唤醒阈值与继承身份的启停。Profile 自定义选项保持独立，恢复继承使用当前 Discord 默认值；升级保留已有 Lark/Slack 历史和覆盖项（[#1016](https://github.com/BotHarness/BotHarness/issues/1016)）。
- Bot 现在可以打包成 zip 交给别人。「创建 PersonaBot」变成二级菜单：「从零创建」「从 GitHub 导入」「从 zip 导入」。Bot 资料页新增「分享与导出」，先提醒检查密码和个人信息，再把 Bot 的 Memory 文件（包括还没提交的修改）连同 `.botharness/bot.json` 和头像打包下载；Git 历史、会话、IM 绑定和凭证都不会放进去。从 zip 导入会先显示第三方内容提示，然后创建一个新的 Bot，只有一个初始提交，名称、岗位和头像来自 zip；不安全的路径、损坏的文件和超过 100 MB 的 zip 会被拒绝，不留下任何半成品（[#1062](https://github.com/BotHarness/BotHarness/issues/1062)，[ADR-0135](docs/adr/0135-a-bot-moves-between-people-as-a-zip-of-its-memory-files.md)）。
- 导出 zip 时可以选择文件：导出窗口列出 Bot 的全部 Memory 文件和文件夹，默认全选，可展开、折叠、全选或全不选，取消勾选的文件不会进入 zip；`.botharness/bot.json` 和头像始终包含（[#1063](https://github.com/BotHarness/BotHarness/issues/1063)）。
- 导出 zip 时可以勾选「包含 Git 历史」，带上所有分支、标签和提交记录；只有全选文件时才可用。导入这样的 zip 会保留这些分支、标签和历史并切到导出时的分支，不带远程地址和原机器的 Git 配置（[#1064](https://github.com/BotHarness/BotHarness/issues/1064)）。
- 新增[导出与导入 Bot](docs/bot-zip.md)教程：zip 里有什么、导出时选择文件和 Git 历史、从 zip 导入，以及分享前和导入前的安全提醒；「分享 Bot」和「记忆文件」教程链接到它（[#1065](https://github.com/BotHarness/BotHarness/issues/1065)）。
- Bot 模式会在创建 Bot 之前检查 Host 上的 Git。没有 Git、Git 无法运行（例如 macOS 未安装命令行工具时的占位程序）或版本低于 2.28 时，名册顶部会说明原因并链接到安装教程新增的 [Git 一节](docs/installation.md#git)，在「重新检测」找到可用的 Git 之前禁用创建和导入 Bot；创建时仍遇到不可用的 Git，会报告为缺少 Git，而不是笼统的记忆错误（[#1096](https://github.com/BotHarness/BotHarness/issues/1096)，[ADR-0140](docs/adr/0140-the-host-falls-back-to-a-managed-git.md)）。
- Bot 模式现在可以帮你安装 Git：Host 上的 Git 不可用时，点 **安装 Git** 会把固定版本的便携版 Git 下载到 DeepSeek Harness 数据目录（先从 `media.botharness.ai`，失败再从 GitHub），校验 SHA-256 后立即启用，不用重启，也不需要管理员权限；Orchestrator 的 Shell 也会用同一个 Git。每次启动时仍优先使用可用的系统 Git（[#1097](https://github.com/BotHarness/BotHarness/issues/1097)，[Git 一节](docs/installation.md#git)）。
- 从 SSH 地址导入 Bot 现在会自动改用 HTTPS：克隆 `git@host:owner/repo` 或 `ssh://git@host/owner/repo` 失败时，Host 会用对应的 HTTPS 地址重试一次并告诉你已经切换，之后这个 Bot 通过 HTTPS 同步；HTTPS 也失败时显示原来的 SSH 错误。DeepSeekBot 设置新增 **Git** 一行，显示正在使用的 Git 版本以及是系统 Git 还是托管 Git（[#1098](https://github.com/BotHarness/BotHarness/issues/1098)，[Git 一节](docs/installation.md#git)）。

- Lark 反馈候选通过可选 checked Provider，在 Inbox 持久接收后显示原生 `GLANCE`、对应回复获外部接受后显示 `DONE`；首条反馈等待受校验连接就绪，权限拒绝归为明确失败。有界 QA 已确认私聊及群表情、群回复状态、静音仅接收、Provider 重连、现场 Host 重启后的新回复及 Web 明暗截图；屏蔽来源精确到达及 Web 生命周期可靠性尚未通过验证（[#1040](https://github.com/BotHarness/BotHarness/issues/1040), [guide](docs/lark-connection.md#receipt-and-answer-feedback-candidate)）。

### Changed

- Bot 市场的卡片改成了资料卡的样子：资料横幅在上，Bot 头像压在横幅下沿，名称、仓库和安装按钮排在头像右侧，下面是两行简介，以及标签、星数、更新时间合成的一行。详情页顶部也用同样的横幅和头像，弹窗每行显示两张卡（[#1232](https://github.com/BotHarness/BotHarness/pull/1232)）。
- **绑定应用** 弹窗可直接打开官网的 Lark／飞书、Slack、微信连接教程和更多平台总览；移除侧栏独立的 Lark 配置引导卡片，让平台配置说明集中在官网维护 ([#822](https://github.com/BotHarness/DeepSeekBot/issues/822)).

- **新会话** 也成了平台默认设置：飞书、Slack、Discord 的全局 IM 默认设置里各有一个 **新会话** 选项（不改就是 **自动接收**），每个已绑定应用都跟随它，除非你为这个应用单独选择。已经设为 **先问我** 的应用保持不变（[#1134](https://github.com/BotHarness/BotHarness/issues/1134)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。
- 「外部连接器」不再提供 **添加外部连接器** 和 **授权外部会话**（同步正在围绕“接入任意应用的会话”重新设计），只列出已有的同步，并保留 **保存发送目标（高级）** 给不能直接发往会话的应用。会话行会显示已同步到哪里，操作按钮（**静音**、**规则**、**屏蔽**）单独一行并各带说明提示。Lark 配置引导缩减为三步（连接应用、绑定、发消息验证），Lark、Slack、微信连接教程围绕 **绑定应用** 重写（[#1113](https://github.com/BotHarness/BotHarness/issues/1113)、[Lark 教程](docs/lark-connection.md)、[外部连接器说明](docs/channel-sidebar/external-connectors.md)）。

- Bot 的模型和唤醒策略从 Profile 移到私聊 Channel sidebar 的两个新分区 **模型** 与 **唤醒策略**：收起时标题右侧显示当前值，每项设置一行，点击打开弹窗修改，并可像其他分区一样排序或隐藏。模型弹窗改为 **主模型** 与 **执行模型** 两项，可输入过滤选择模型并选思考强度；不建预设也能直接保存，已有预设仍可用来填入，**另存为预设** 可把当前设置留作复用。**提醒策略** 改名为 **唤醒策略**（[#1084](https://github.com/BotHarness/BotHarness/issues/1084)，[模型教程](docs/channel-sidebar/model.md)，[唤醒策略教程](docs/channel-sidebar/wake-policy.md)）。
- Bot 的 IM 设置从 Profile 移到私聊 Channel sidebar 的两个新分区。**外部身份** 每个已绑定身份一行，显示可用状态和启用开关，下面是 **绑定身份**、Lark 配置引导、IM 管理员配对和 Lark 审批通知。**外部连接器** 每个连接器一行，显示状态和启用开关，下面是 **添加外部连接器** 和外部会话授权。点击一行打开弹窗修改，选项与原来一致。**频道连接器** 改名为 **外部连接器**。SOUL.md 和 MEMORY.md 的常驻记忆上限变成 **记忆文件** 下的一行，点击打开弹窗。迁移后的表单统一使用共享的下拉框、输入框和复选框（[#1085](https://github.com/BotHarness/BotHarness/issues/1085)，[外部身份教程](docs/channel-sidebar/external-identities.md)，[外部连接器教程](docs/channel-sidebar/external-connectors.md)）。
- 本地群的成员唤醒设置和外部连接器从群 Profile 移到群 Channel sidebar 的两个新分区 **唤醒策略** 与 **外部连接器**，位于成员和群管理之间。唤醒策略每个成员 Bot 一张卡片，显示它在这个群里的规则、与之不同的外部平台规则，为这个群单独设置时带 **频道自定义** 标记；点击卡片打开与原来相同的弹窗。外部连接器把这个群的连接器和已接入的外部会话列成卡片行，点击打开编辑弹窗。两个分区都可排序或隐藏，群 Profile 现在只显示群名、头像和消息活跃度（[#1086](https://github.com/BotHarness/BotHarness/issues/1086)，[唤醒策略教程](docs/channel-sidebar/wake-policy.md)，[外部连接器教程](docs/channel-sidebar/external-connectors.md)）。
- Bot 资料页现在只显示 Bot 是谁和它的活动。新的头部有横幅区域、头像、名称、**标签** 和 **简介**，右上角是 **分享**、**编辑资料** 和 **⋯** 菜单。**编辑资料** 可以一起修改名称、标签（最多 8 个，每个不超过 32 个字）和简介（最多 160 个字）；点头像打开头像编辑。**分享** 导出 Bot zip，侧栏里右键 Bot 也能分享；**删除 Bot** 移到了 **⋯** 菜单。岗位徽章改叫标签，描述改叫简介。`.botharness/bot.json` 写入 `tags` 和 `bio`，改简介会像改名一样同步；仍使用 `roles` 的文件和 zip 会当作标签读取，从 zip 导入时保留标签和简介。Bot 市场 API 返回 `tags` 和 `bio`，没有时使用 `roles` 和 GitHub 仓库描述（[#1087](https://github.com/BotHarness/BotHarness/issues/1087)，[分享 Bot 教程](docs/share-bot.md)，[导出与导入教程](docs/bot-zip.md)）。
- Profile 里的 **Token 用量** 卡片更短了：可在 **每日总量** 和 **按模型** 之间切换，时间范围为 7 / 30 / 90 天和全部，自定义范围在 **⋯** 菜单里。去掉了角色筛选、模型/提供商筛选、缓存占比区域和执行明细；鼠标悬停在柱子上可以看到缓存输入、非缓存输入和输出的拆分。单独的 **累计值** 卡片已移除，之前置顶它的设置会被自动忽略（[#1088](https://github.com/BotHarness/BotHarness/issues/1088)，[设置教程](docs/settings.md)）。
- Bot 资料页的事件活跃和 Memory 提交热力图现在铺满卡片宽度，最新一周在最右边，向左滚动会加载更早的周，一直到 Bot 创建那天；小窗里的热力图铺满小窗，不需要滚动。按来源分的事件列表移到了每天的悬停提示里（[#1089](https://github.com/BotHarness/BotHarness/issues/1089)）。
- 界面文案统一称呼「你」和「Bot」：中英文标签里不再出现 Human、PersonaBot、Source Event 和 Attention，清除后的占位显示「`正文已清除 · 你 · {时间}`」，连接器入口统一叫「外部连接器」。这些内部术语再次出现时会有测试失败（[#1090](https://github.com/BotHarness/BotHarness/issues/1090)）。

### Fixed

- 显式配置原生 RC2 timed 问题的 Profile 中，DM 问题卡片在前台超时后仍可回答，同一个 Bot 可以处理其他消息；稍后提交的答案在原生会话接收前显示为已提交。生产版本依赖与 RC1 阻塞式提问保持不变（[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220)）。

- Bot 引导不会再因旁观窗口退出或设置模型而暂停其他窗口的教程；完成后仍可主动重播，单独保存 Bot 模型或恢复继承后，已打开的模型卡片立即刷新（[#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175)）。

- **绑定应用** 保留其他 Bot 已绑定的应用并明确标注归属，教程链接增加跳转箭头，应用标题行和各种下拉状态始终提供 **添加新应用** 入口；从 IM 设置返回后恢复弹窗并自动刷新，选择框右侧提供带提示的刷新图标以便重试（[#1176](https://github.com/BotHarness/DeepSeekBot/issues/1176)，[外部身份教程](docs/channel-sidebar/external-identities.md)）。

- npm 发布准备因工作区不干净而拒绝时，会列出具体变更路径并限制诊断输出数量，保留尚未审核的文件改动 ([#877](https://github.com/BotHarness/DeepSeekBot/issues/877)).

- 取消窗口伙伴钉选会清除其 Activity 连接异常提示；成功加载 Bot 名单后，会清理已删除 Bot 的恢复钉选，网络失败仍保留用户钉选偏好（[#1138](https://github.com/BotHarness/DeepSeekBot/issues/1138)）。

- 窗口伙伴向左右拖动时，身体按惯性落后于抓取点；落地贴住窗口内容区底边，不再保留底部间隙（[#1138](https://github.com/BotHarness/DeepSeekBot/issues/1138)）。

- Bot 读到的 IM @ 改成名字，不再是平台占位符：飞书的 `@_user_1` 和 Slack 的 `<@U…>` 以 `@名字` 交给模型（平台没给名字时用 `@ID`），每条外部消息还列出发送人和被 @ 的人及其平台 ID。Bot 在 `bridge_reply` 正文任意位置写 `<@ID>`，就能在飞书、Slack 或 Discord 上 @ 这条消息的发送人或其中被 @ 的人（Slack 和 Discord 通过 IM Provider 的 checked @ 提醒，旧版 Provider 退回 `@名字` 文字）；其他 ID 或 @ 标记按纯文本发出（[#1126](https://github.com/BotHarness/BotHarness/issues/1126)）。
- **绑定应用** 不再隐藏 IM 插件暂时不支持的应用。插件缺少受检发送能力的 Discord 应用现在会置灰显示，并注明 **需要更新 IM 插件后才能绑定**，不会再悄悄从列表里消失（[#1123](https://github.com/BotHarness/BotHarness/issues/1123)）。
- **绑定应用** 不再列出已经绑定到这个 Bot 的应用，它们已经显示在「外部身份」里（[#1127](https://github.com/BotHarness/BotHarness/issues/1127)）。

- 模型弹窗不再提供跑不起来的路由：某个提供方在真实对话里因没有 API key 或 key 无效而失败后，它的模型排到最后，标为 **需要配置 key** 或 **key 无效**，不能选择或保存；DSH 的凭证、设置或适配器变化后恢复。没有 Model Plan 的 Bot 打开弹窗时默认选中 DSH 默认模型，而不是目录里的第一个（[#1124](https://github.com/BotHarness/BotHarness/issues/1124)）。
- 共享频道消息现在显示已保存的外部发送人名称，已有 Discord 历史也会更新显示；气泡复用 Lark 收件箱的渲染方式，将已保存名称的原生 @ 提及显示为标签；原文和 ID 保持不变，未知名称保留原始文本（[#1061](https://github.com/BotHarness/BotHarness/issues/1061)）。

### Documentation

- 通过隔离的真实模型实验验证 RC2 原生 timed question：稍后答案可准确关联原问题，等待期间仍可对话；现有 Web 问题卡片仍会过期，生产权限审批与容量门禁继续阻塞（[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220), [report](docs/research/1220-native-timed-question-experiment.md)）。

- 记录 [AX 浏览器验收流程](docs/agents/ax-browser.md)，区分准确地址的权限证据、Host 传输、导航拒绝和截图／输入超时，并保留用户明确授权的本地端口重试结果（[#1225](https://github.com/BotHarness/DeepSeekBot/issues/1225)）。

- 记录已接受的像素 Avatar 扩展设计：同一 rig 上的 Avatar Species（奇幻、动物与花的基底）、可分别上色的头发分片、穿过头发的头饰槽，以及 Human 自绘、保存在 Profile 部件库中并随导出 PersonaBot 携带、以 PNG 流转的 Custom Part；运行时行为不变（[#1135](https://github.com/BotHarness/DeepSeekBot/issues/1135)、[ADR-0148](docs/adr/0148-avatar-species-and-custom-parts-extend-one-pixel-rig.md)、[交接说明](docs/research/2026-10-08-avatar-species-and-custom-parts-handoff.md)）。

- 记录固定版本的原生 Human 等待验证，以及提问／权限待决期间群聊仍可互动的后续要求：独立 Assignment 审批期间 Orchestrator 可继续处理，但其自身审批／提问仍阻塞无关模型处理；生产 continuation 仍保持 gate（[#1036](https://github.com/BotHarness/DeepSeekBot/issues/1036), [experiment](docs/research/1036-native-wait-experiment.md), [#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220), [#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038)）。

- 记录已确认的窗口内透明半身像素伙伴设计：本地伙伴选择、三档 Bot 输出范围、独立播放开关及不重播历史的有界消息消费；本次不改变运行行为（[#1132](https://github.com/BotHarness/BotHarness/issues/1132)、[规格 #1135](https://github.com/BotHarness/BotHarness/issues/1135)、[ADR-0143](docs/adr/0143-window-companions-consume-owned-activity-and-scoped-output.md)）。

- 在 [DSH 调试指南](.agents/skills/dsh-dev/references/debugging-playbook.md)记录原生 Windows 候选安装与审批核验，包括 AppData 物理路径、隔离 Profile 的包管理器版本锁定、真实 Shell 退出证据及进程时间戳保护。双语 [Lark 指南](docs/lark-connection.md)记录准确候选源码经 Human 点击允许一次／拒绝的真实核验；此次文档更新不改变运行行为（[#1029](https://github.com/BotHarness/BotHarness/issues/1029)）。

- 记录开发来源 Discord 共享 Channel 在一个绑定成员、Message Content OFF 下的资格验证，包含原 thread 模型回复、重叠去重及暂停／重启／恢复证据（[#1054](https://github.com/BotHarness/BotHarness/issues/1054)，[英文验证](docs/dev/verification/discord-1054-shared-channel.md)、[中文验证](docs/dev/verification/discord-1054-shared-channel.zh.md)）。

## [1.1.0] - 2026-10-06

PersonaBot 可设置并自行管理定时任务，每个会话都会带上 Bot 的 Soul 与核心记忆，Channel 侧栏各分区统一为卡片样式，微信支持语音转写和图片；每个 Bot 的 Memory 会保存供 Bot 市场使用的 `.botharness/bot.json`；插件会发送可关闭的匿名使用统计；Bot 设置可一键安装 DeepSeekBot 更新并重启 DSH。

### Added

- 增加个人微信语音来源候选链路，使用平台提供的转写，在 Bot Inbox 区分有转写与缺少转写；不增加 ASR 或音频播放，真实原生语音 → 模型 → 原私聊回复已由 Human 确认（[#905](https://github.com/BotHarness/BotHarness/issues/905)）。
- 增加源码预览微信图片链路，支持 Inbox 原消息气泡内自动加载的 checked 图片预览、原生模型图片输入与本身份原生图片回复，Human 已确认原私聊收到内容一致的图片（[#904](https://github.com/BotHarness/BotHarness/issues/904)，[连接指南](docs/wechat-connection.md)）。
- PersonaBot 新增定时任务（Bot Schedule）：Channel 侧栏的「定时任务」分区可新建、编辑、暂停和删除按分钟、按小时或每天执行的任务；每次触发进入 Bot 收件箱并唤醒 Orchestrator，每个任务可查看最近 20 次触发及处理它的会话（[#960](https://github.com/BotHarness/BotHarness/issues/960)，[ADR-0133](docs/adr/0133-bot-schedules-wake-the-orchestrator-through-the-bot-inbox.md)）。
- DeepSeekBot 现在会在创建 Bot 时，自动在它的 Memory 里写入 `.botharness/bot.json`，之后改名称、岗位或头像时同步更新；已有的 Bot 会在下次启动时补上。分享出去的 Bot 在 Bot 市场里显示的名称、岗位和头像，和侧栏里一致（[#966](https://github.com/BotHarness/BotHarness/issues/966)、[教程](docs/share-bot.md)）。
- DeepSeekBot 由 DSH 后台发送匿名使用统计，只关联一个随机安装 ID：`plugin_started`（插件和 DSH 版本、操作系统、架构），`bot_created`、`bot_archived`、`bot_deleted`、`marketplace_bot_installed`、`connector_enabled`（只含连接器类型）、`avatar_edited`，每天一次的 `daily_usage` 汇总（PersonaBot、会话和消息数量及统计时长），以及 BotHarness 后台未处理错误的 `$exception` 报告（错误类型和只保留包内文件名的调用栈，从不含错误信息或文件路径）；Bot 模式会弹出一次说明，并链接隐私说明和源码。可在 Bot 设置中关掉「匿名使用统计」开关，立即生效、无需重启，并会被记住；在 core 插件配置中设置 `telemetry: false`，或设置 `DO_NOT_TRACK=1`、`BOTHARNESS_TELEMETRY=0`，会强制关闭并锁定该开关（[#951](https://github.com/BotHarness/BotHarness/issues/951)，[#952](https://github.com/BotHarness/BotHarness/issues/952)，[ADR-0132](docs/adr/0132-anonymous-posthog-telemetry-and-campaign-short-links.md)，[教程](docs/settings.md)）。
- PersonaBot 可以自己管理定时任务：让 Bot「每小时检查一下 X」或「每天早上总结」，它会自己创建定时任务，侧栏里标为 Bot 创建；它也可以修改或删除你没有锁定的任务。你可以在任务行或编辑弹窗里锁定任务；每个 Bot 最多同时启用 20 个；Bot 改动后侧栏立即刷新；Orchestrator 中 DSH 自带的 `schedule_*` 工具会被拒绝，确保每个 Bot 只有一套定时任务（[#961](https://github.com/BotHarness/BotHarness/issues/961)）。
- 定时任务新增每周（选择星期几）、单次（指定日期和时间，触发后自动停用）和 5 段 Cron 三种频率，均按任务自己的时区计算；编辑弹窗会预览接下来三次触发时间，Bot 的定时任务工具也支持这些频率；任务行上的「立即运行」会马上唤醒 Orchestrator，且不改变下一次计划时间。新增[定时任务使用指南](docs/channel-sidebar/schedules.md)，说明各种频率、立即运行、暂停与锁定（[#962](https://github.com/BotHarness/BotHarness/issues/962)）。
- Bot 设置可以通过 DSH 的插件管理一键安装新版本 DeepSeekBot。Web 版装完点「立即重启」，`dsh web` 会在同一个终端里重启，页面自动重新连接；DSH Desktop 会提示退出后重新打开。插件管理不可用或安装失败时，会显示原因和手动更新命令。新增[更新 DeepSeekBot](docs/update-deepseekbot.md)教程，说明每一步（[#986](https://github.com/BotHarness/BotHarness/issues/986)）。

### Changed

- Channel 侧栏的会话、Bot 收件箱和工作区授权改用与定时任务相同的卡片行：每行带图标、状态 chip 和说明行；来自定时任务的收件箱条目现在可以点开对应的定时任务（[#972](https://github.com/BotHarness/BotHarness/issues/972)）。
- Channel 侧栏的电脑和浏览器分区也改用相同的卡片行：状态卡片显示目标（本机或 Docker）、运行中、需要设置、已暂停等状态 chip 和对应操作，浏览器打开的标签页也以卡片行列出（[#975](https://github.com/BotHarness/BotHarness/issues/975)）。
- Bot Profile 的头像区合并为一个「头像」分区，并排提供「设计像素头像」和「上传图片」两种方式，并标出正在使用的那种；去掉了重复的「更换头像」按钮，顶部分隔线上下留出空白（[#985](https://github.com/BotHarness/BotHarness/issues/985)）。
- PersonaBot 的人格文件改名为 `SOUL.md`（Soul），每个 Session 开始时还会带上 Core Memory `MEMORY.md`，新对话一开始就知道 Bot 记得什么。两者在整个 Session 内冻结，并带字符用量标注（默认上限 5,000 和 3,000 字符）；新建的 Bot 会附带一份简短的 `MEMORY.md` 模板，已有的 `PERSONA.md` 会在下次启动时改名为 `SOUL.md`（[#988](https://github.com/BotHarness/BotHarness/issues/988)，[ADR-0134](docs/adr/0134-soul-and-core-memory-are-session-frozen-system-prompt-files.md)）。
- 每个 Bot 的资料页新增「常驻记忆上限」，可分别设置 `SOUL.md` 和 `MEMORY.md` 的字符上限，并显示约合多少汉字和英文单词，从下一个 Session 开始生效。Memory 面板把这两个文件置顶，带「常驻」标记和当前用量，超限时标红；Memory 搜索现在也能搜到它们（[#989](https://github.com/BotHarness/BotHarness/issues/989)，[ADR-0134](docs/adr/0134-soul-and-core-memory-are-session-frozen-system-prompt-files.md)）。

### Fixed

- 带明确私聊 Chat ID 的 Lark 用户目标可以将未 @ 的私聊消息送进同一个 PersonaBot Inbox，并以绑定身份回复；未提供该标识的目标仍只支持发送（[#996](https://github.com/BotHarness/BotHarness/issues/996)）。

### Documentation

- 记录开发来源 Discord 文件候选的真实模型保存／处理／导入／原 thread 结果、独立原件不变／输出字节证据及临时工作区写权限清理（[#1002](https://github.com/BotHarness/BotHarness/issues/1002)，[verification](docs/dev/verification/discord-1002-source-files.md)）。
- 新增教程 [Bot 灵魂与核心记忆](docs/soul-and-core-memory.md)：说明 `SOUL.md` 与 `MEMORY.md` 为什么在每个 Session 开始时冻结注入、两个文件分别代表什么、为什么没有 `USER.md`、字符上限及中英文的大致篇幅和 token 量、如何修改上限、超限时的样子、修改何时生效，以及如何和 Bot 一起塑造 `MEMORY.md`（[#990](https://github.com/BotHarness/BotHarness/issues/990)，[ADR-0134](docs/adr/0134-soul-and-core-memory-are-session-frozen-system-prompt-files.md)）。
- GitHub 与 npm 的 README 补充定时任务、Bot 市场和更新提示，新增依据本 Ledger 整理的「版本亮点」，并换成高清截图表格，所有头像均为 BotPixel 像素头像（[#984](https://github.com/BotHarness/BotHarness/issues/984)）。
- 记录隔离 Discord nearby 上下文候选的准确原生来源范围、五分钟窗口、稀疏 Human 文本最小条数与有界续页；真实模型稀疏续页、canonical 留存、原 thread 回复和临时权限恢复已独立验证，产品提升仍另行管理（[#981](https://github.com/BotHarness/BotHarness/issues/981)，[指南](docs/dev/guides/im-provider-integration.md)）。
- 补全 Discord 上下文开发来源验收文档，提供真实模型续页、准确的已编辑来源拒绝、整页回滚及消息正文权限恢复证据（[#937](https://github.com/BotHarness/BotHarness/issues/937)，[verification](docs/dev/verification/discord-937-context-reads.md)）。

## [1.0.2] - 2026-10-06

Bot 模式会在安装和升级后显示更新内容并检查 npm 上的新版本；上下文读取保留准确的 `source-conflict` 拒绝；新增分享 Bot 教程，说明如何把 Bot 发布到 Bot 市场。

### Added

- 首次安装后进入 Bot 模式会显示当前版本的更新日志，升级后会显示上次查看以来的所有版本；Bot 设置显示当前版本，可从 npm 检查新版本并查看其更新内容和更新命令，也可打开官网更新日志（[#947](https://github.com/BotHarness/BotHarness/issues/947)）。

### Fixed

- 上下文读取遇到原生历史与留存证据不同时，现保留准确的 `source-conflict` 拒绝；冲突页整体回滚，不替换原来源（[#937](https://github.com/BotHarness/BotHarness/issues/937)，[verification](docs/dev/verification/discord-937-context-reads.md)）。

### Documentation

- 新增[分享 Bot](docs/share-bot.md)教程：发布前检查 Memory、一键复制让 Bot 自己发布到 GitHub 的提示词、收录进 Bot 市场，以及 `.botharness/bot.json` 说明（[#958](https://github.com/BotHarness/BotHarness/issues/958)）。

## [1.0.1] - 2026-10-05

DeepSeekBot 首个 npm 正式版本：拥有各自身份的 PersonaBots、Git Memory、Group、Assignment、像素头像、飞书、Slack、Discord 和微信身份，以及首片 Bot 市场，作为一个插件装进 DSH。1.0.0 未作为产品发布。

### Breaking Changes

- 调用导出的 `createRosterStore` factory 或 `RosterStore` constructor 时必须以 `database` 传入 Profile 的 `OperationalDatabaseOwner`；`attach` 仅一次性导入旧 domain，命令与查询合同保持不变（[#885](https://github.com/BotHarness/BotHarness/issues/885)）。

- 调用公开 `createPersonaBotRegistry` 工厂时必须通过 `database` 传入 Profile 的 `OperationalDatabaseOwner`；Registry 命令与查询接口保持原状，不再隐式创建 JSON 存储（[#884](https://github.com/BotHarness/BotHarness/issues/884)）。

- 自定义 `BotAgentAdapter` 必须处理纯外部 Inbox 回合中缺省的 `OrchestratorAgentRun.inboundChannelId`；本地发送时需显式选择已授权的 Channel（[#12](https://github.com/BotHarness/BotHarness/issues/12)）。

- `channel_send` Tool 的成功确认从文本改为 `{channelId,messageId}` JSON，消费者须读取这两个字段。附件 `size` schema 改为 `integer`，与既有的安全非负整数校验一致；新发送使用当前 fileId 四字段引用；#577 迁移后的过期 hash 结果须重新读取所属消息（[#570](https://github.com/BotHarness/BotHarness/issues/570)）。

- 自定义 `BotAgentAdapter` 需让 Orchestrator 的 `channels.contacts(input?)` 返回 `{ outputLimit, contacts, nextCursor? }`，稳定 ID 字段从 `slug` 改为 `botId`；`list_bot_contacts` Tool 也返回该有界页，消费方需处理续页（[#568](https://github.com/BotHarness/BotHarness/issues/568)）。

### Added

- 增加微信扫码绑定者文件进入既有附件与 Bot Inbox 链路、结果文件回到原私聊的能力；下载有界且保持私有，上传后再次检查授权（[#903](https://github.com/BotHarness/BotHarness/issues/903)，[连接指南](docs/wechat-connection.md)）。

- 增加个人微信扫码绑定者文本进入既有 Bot Inbox 与本身份回复链路，使用明确私聊授权和私有来源续接信息；源码版与本机安装产品的真实收发已验证，Human QA 已通过（[#878](https://github.com/BotHarness/BotHarness/issues/878)，[ADR-0129](docs/adr/0129-wechat-owner-dms-use-private-source-continuations.md)，[连接指南](docs/wechat-connection.md)）。

- 创建 PersonaBot 时可选择同事、角色扮演或空白起点并编辑 PERSONA.md；切换保留草稿，工具权限与运行能力保持不变（[#325](https://github.com/BotHarness/BotHarness/issues/325)）。

- 增加候选 checked Discord Provider 注册与既有 Inbox／来源展示契约，保留准确频道／公开 thread 路由；真实频道／thread 模型回复及代理操作界面验收已通过，剩余原生资格验证尚待完成（[#855](https://github.com/BotHarness/BotHarness/issues/855)，[ADR-0128](docs/adr/0128-discord-checked-replies-preserve-native-child-channel-routing.md)）。

- PersonaBot 可显式发布不镜像到本地聊天的 Slack 报告，查询已保存原文及真实回执，并在原 Slack 话题回答符合收件策略的 Human 追问（[#863](https://github.com/BotHarness/BotHarness/issues/863)、[IM 接入指南](docs/dev/guides/im-provider-integration.md)）。

- PersonaBot 可在真实普通回复投递验证后显式跟进或退出已授权 Slack 原生话题，复用数量／时间汇总和 Human 覆盖；迁移后的频道连接器仍保留 Profile 话题管理（[#854](https://github.com/BotHarness/BotHarness/issues/854)、[IM 接入指南](docs/dev/guides/im-provider-integration.md)）。

- 活动实时同步中断时，侧栏会提示；头像停在最后观察到的状态，活动指示变灰并暂停，不再播放装饰动画；重新连接或服务重启后从新的基线恢复（[#756](https://github.com/BotHarness/BotHarness/issues/756)）。

- 已保存头像使用了当前不可用的版本时，PersonaBot 不再消失：原始设置会被保留，显示与之配对的保存快照并说明暂时无法编辑和播放角色动画，活动与待审批指示照常工作，版本恢复后自动还原；与快照不匹配或不安全的头像数据会被忽略，但不会丢失 PersonaBot（[#755](https://github.com/BotHarness/BotHarness/issues/755)）。

- 像素家族头像可在资料页编辑器里分别选择刘海、侧发和后发，并在范围内调节眼距、五官高度和发长；没有这些选择的已保存头像外观不变（[#752](https://github.com/BotHarness/BotHarness/issues/752)）。

- 像素家族的侧脸和思考转头帧改为真正的四分之三侧脸：五官向朝向一侧偏移、远侧眼睛变窄、只露近侧耳朵、下巴内收；双马尾等发尾保持贴着头部，嘴巴保持居中（[#752](https://github.com/BotHarness/BotHarness/issues/752)）。
- Assignment 完成报告与 Host 确认的原生执行完成保留为独立、可跳转的 Inbox 来源，以可信 Session／Turn 身份关联且不重复唤醒；迟到通知重启后仍待处理，直到真实 Turn 纳入并处理（[#194](https://github.com/BotHarness/BotHarness/issues/194)，[ADR-0077](docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)）。

- 在 PersonaBot Profile 新增可恢复的 Lark／飞书配置引导，定位真实 IM 控件，并根据当前账号、身份、群授权及同话题回复证据核对进度，不另建新手引导工作流存储（[#824](https://github.com/BotHarness/BotHarness/issues/824), [指南](docs/lark-connection.md)).

- 在 Bot 设置中新增独立的 Slack 收件、汇总与绑定身份默认值，Profile 可继承，既有显式覆盖继续保留（[#843](https://github.com/BotHarness/BotHarness/issues/843)）。

- Human 可在 Profile 明确接收已授权 Slack 频道的普通文字，并选择现有数量／时间汇总或安全排队的逐条唤醒；新连接仍只收 @，重叠提及订阅不重复收件（[#837](https://github.com/BotHarness/BotHarness/issues/837)）。
- 新增产品产物构建与隔离安装路径，在一次产品安装中组合 Core、Client 和独立版本的已验证 IM Provider；初始不连接账号，Provider 随产品更新，公开 npm 发布仍是独立的发布操作（[#823](https://github.com/BotHarness/BotHarness/issues/823)、[打包指南](docs/product-im-installation.md)）。
- Line 家族 PersonaBot 头像改为变形成与当前 DSH 工具对应的线条符号（与像素风同一套 16 个：读文件、新建、修改、执行命令、搜代码、搜网页、抓取、提问、待办、分身、工作流、目标、展示、待审批等），活动持续时保持符号（至少 0.5 秒），工具之间直接变形，回合结束后变回脸（[#838](https://github.com/BotHarness/BotHarness/issues/838)）。

- PersonaBot 可通过 canonical 附件工具读取明确 @ 的 Slack 原消息文件，并用自己的绑定身份沿原生话题回传处理结果；发送完成前复查当前授权，来源详情保留安全文件类型和大小信息（[#831](https://github.com/BotHarness/BotHarness/issues/831)）。
- Line 家族 PersonaBot 头像新增更多颜文字风格的眼睛（闪亮大眼、爱心眼、圆圈眼、竖椭圆眼、^ ^、半睁眼、下垂眼）、眉毛（粗眉、麻吕眉、细眉）和嘴（▽、露齿、小虎牙、小点嘴、嘟嘴、紧张锯齿、大笑张嘴），资料页编辑器提供 12 个只有五官的 Line 预设；头像不再画左上角的 !? 和漫画符号，资料页预览、顶部标题和置顶头像的活动指示与待处理数量移到名字后面，不再压在头像上（[#833](https://github.com/BotHarness/BotHarness/issues/833)）。

- Human 可在 Bot 模式设置中调整 Profile 级 Assignment 并发上限（1–32，默认 3）；保存后立即影响后续准入并在重启后保留，降低上限不中止正在执行的任务 ([#825](https://github.com/BotHarness/BotHarness/issues/825)).
- Channel sidebar 编辑模式可隐藏或恢复指定项目，完成时一起保存显示与排序偏好，取消时一起丢弃，并可通过恢复默认布局重新显示全部项目（[#809](https://github.com/BotHarness/BotHarness/issues/809)）。

- PersonaBot 可从已授权 Slack 来源主动读取有界频道、附近及原生话题 Human 文本，完整翻页读取密集五分钟窗口，并在来源详情查看上下文；历史读取不触发 Inbox 收件（[#819](https://github.com/BotHarness/BotHarness/issues/819)）。

- 像素家族 PersonaBot 头像改为 32×32 Q 版像素画（更大的头和眼睛、头发和衣服分层明暗、背景取头发同色系的浅色），新增发型、服装、头饰和 12 个可选预设；思考和工作时整个像素头像会在 0.8 秒内变形成与当前 DSH 工具对应的像素符号（读文件、新建、修改、执行命令、搜代码、搜网页、抓取、提问、待办、分身、工作流、目标、展示、待审批等），颜色取自头发，至少停留 0.5 秒，回合结束后变回脸；侧栏联系人行的活动指示和待处理数量移到名字同一行最右侧，不再压在头像上（[#800](https://github.com/BotHarness/BotHarness/issues/800)）。
- 新增使用 PersonaBot 独立绑定身份的 Slack 文字 @ 收件与原生话题回复路径，沿用 canonical Inbox、Profile 身份／频道连接器表和来源详情；上下文、附件及普通消息策略继续独立资格验证（[#802](https://github.com/BotHarness/BotHarness/issues/802)，[ADR-0126](docs/adr/0126-slack-text-intake-uses-exclusive-checked-provider.md)）。
- Host Plugin 可订阅 PersonaBot 已提交的公开输出及可信 Session／Channel 引用；消费者失败不回滚消息或阻断其他监听者，重启不重放通知（[#125](https://github.com/BotHarness/BotHarness/issues/125)）。

- 线条家族 PersonaBot 头像在活动切换时的五官笔画会短暂变形成新状态的符号（?、放大镜、`</>`、!、♪、笑脸）再变回原样，采用 morphicons 的弹簧笔画变形；过渡可从当前形状中途重定向，并取代右上角的活动角标，小头像更短，开启减少动态效果时跳过（[#754](https://github.com/BotHarness/BotHarness/issues/754)）。
- 新增可显式选择的 Container `agent-browser` 驱动，复用现有 Browser Viewer、接管、上传和持久 profile；Local 与 Container 分别保留原有默认驱动（[#768](https://github.com/BotHarness/BotHarness/issues/768)）。

- PersonaBot Profile 可在像素家族与新的原创线条家族（彩色圆角底上的粗线条五官）之间切换；线条家族有独立的眼睛和嘴（含 `> <`、T T、ω、▽ 等颜文字）、眉毛、鼻子、脸颊、眼镜、漫符（汗滴、怒筋、阴沉竖线、闪光等）、底色与线条颜色，以及有界的间距、高低和倾斜，并通过同一链路保存、生成快照、播放动作、显示独立审批提示并在重启后恢复；需要你处理时，两个家族的大头像都会出现「！？」漫符（[#753](https://github.com/BotHarness/BotHarness/issues/753)）。

- Browser 观察新增有界字段值与控件状态；可选 Local agent-browser 快照压缩重复结构，保留页面／弹窗内容和精确操作引用（[#787](https://github.com/BotHarness/BotHarness/issues/787)）。

- 增加可选的本机 agent-browser 试用驱动，沿用 Browser 权限与 Human 控制，默认驱动保持不变 ([#767](https://github.com/BotHarness/BotHarness/issues/767), [ADR-0124](docs/adr/0124-local-browser-drivers-share-host-authority.md)).
- 群聊头像堆叠最多显示三位成员，优先活动成员，保持同类稳定顺序与准确剩余人数；群聊顶部的成员头像现在支持悬浮与键盘焦点查看各自安全实时状态，并可在既有群 Profile 弹层中以 flex 布局展示最多三位活动优先的头像、名称与状态 chips（[#124](https://github.com/BotHarness/BotHarness/issues/124)）。
- 群聊活动的紧凑摘要和展开列表现在显示每个活跃 PersonaBot 的名称，头像支持键盘操作，并显示同一份安全共享状态（[#124](https://github.com/BotHarness/BotHarness/issues/124)）。
- PersonaBot Profile 可预览、取消和保存原创像素人物头像，按仿 Notion 脸谱的分类选择脸型、发型、眼睛、眉毛、鼻子、嘴巴、脸颊、眼镜、配饰以及肤色、发色、眼睛与衣服颜色、朝向、服装和背景装饰；未保存或上传头像的 Bot 按名字生成默认像素形象，创建时即可预览；保存外形在侧栏与 Profile 大图保持一致，消费现有活动和独立审批 attention，并在重启后恢复（[#751](https://github.com/BotHarness/BotHarness/issues/751)）。

- 新增显式 Chrome Profile 配对，支持跨标签页发现、导航与基于引用的网页控制，保留 Browser Access、Session 审批和暂停 ([#774](https://github.com/BotHarness/BotHarness/issues/774), [guide](docs/daily-browser.md), [ADR-0123](docs/adr/0123-daily-chrome-profile-control-is-an-explicit-persistent-pairing.md)).

- 共享 Channel 成员可用自己独立授权的身份明确回复外部 Lark 来源，查看发送身份与来源详情，并按成员／来源保留唯一持久回复记录（[#637](https://github.com/BotHarness/BotHarness/issues/637)）。
- Assignment 完成报告现在通过 PersonaBot Activity 各视图显示中性信息提示，与待处理数字独立；收件箱隐藏或忽略会清除提示，不改变执行状态（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- 待处理的工作区授权请求现在计入 PersonaBot 的侧栏、消息框和总览提醒；授权回复或收件箱忽略会清除提示，不改变执行状态（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- Orchestrator 可明确等待所属 Assignment 的报告或完成；共享 Activity 在有界等待期间呈现 Assignment 工作，并在报告、取消或超时后恢复 Orchestrator 选择（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- 新增通过官方 Playwright 扩展读取、输入和点击 Human 选定的日常 Chrome 单文档，提供独立确认、暂停／继续和自动撤销授权（[#766](https://github.com/BotHarness/BotHarness/issues/766)、[指南](docs/daily-browser.md)、[ADR-0121](docs/adr/0121-daily-chrome-control-is-bound-to-one-selected-document.md)）。

- Assignment 等待 Human 回答或受阻的报告现在通过侧栏、消息框和总览共享独立 Activity 待办数；权威回复、隐藏待办或停止会清除提示，未解决的持久化报告在重启后保留 ([#123](https://github.com/BotHarness/BotHarness/issues/123)).

- Human 可将多个已授权 Lark 群接入共享 Channel、明确的 Bot DM 或仅 Inbox 目标；连接器分别启停，同一来源保留一份 canonical 内容，重叠收到的 Bot 只处理一次，各接收路径独立保留策略证据（[#635](https://github.com/BotHarness/BotHarness/issues/635)、[ADR-0120](docs/adr/0120-multiple-bridge-routes-retain-canonical-sources.md)）。

- Bot 原生待回答问题与工具审批共同显示在共享待办数字中，悬浮说明分别展示数量，回答或取消后及时清除，执行动画保持独立 ([#123](https://github.com/BotHarness/BotHarness/issues/123))。

- 在 Bot 设置中新增 Lark 平台行为默认值；Profile 可继承或自定义，保留既有配置、拒绝陈旧保存，并以版本快照管理后续消息收件／汇总及身份暂停。 ([#701](https://github.com/BotHarness/BotHarness/issues/701))

- Bot 可只向已授权 Lark 发送报告，在 Profile 查看 canonical Outbox 正文和可信外部消息 ID，再关联真正的带 @ 回复并在原外部话题回答，不镜像到本地 DM／Channel（[#639](https://github.com/BotHarness/BotHarness/issues/639)）。
- PersonaBot 思考和工作时使用紧凑的 BotUI 点阵替代静态蓝色执行点；空闲时隐藏提示，共享减少动态效果偏好使点阵保持静止（[#744](https://github.com/BotHarness/BotHarness/issues/744)）。

- Human 可通过本地扩展将日常 Chrome 的一个标签页明确借给 PersonaBot 只读观察，以 `browser_observe` 复用登录状态，并从扩展或 Channel 侧栏归还；导航、断线与重启会撤销临时借用（[#741](https://github.com/BotHarness/BotHarness/issues/741)、[指南](docs/daily-browser.md)、[ADR-0116](docs/adr/0116-daily-browser-tabs-use-explicit-ephemeral-borrowing.md)）。
- PersonaBot 头像与输入框上方独立显示原生工具待审批数量；现有版本化 Host 快照／实时流在批准、拒绝和取消后清除提示，不将历史审批重播为当前等待 ([#123](https://github.com/BotHarness/BotHarness/issues/123)).

- Bot 可明确将自己 Inbox 的一条外部来源分享到已加入的团队频道，在原始消息上方显示可点击的 Bridge 来源、用 Modal 展示详情，并保留来源和各成员独立提醒，不转发后续收件或借用外部身份（[#636](https://github.com/BotHarness/BotHarness/issues/636)）。

- 活动中心总览沿用侧栏／消息框的 Host 执行状态与安全工具摘要；原生问题和审批保持独立 Human 待办，活跃且归属明确的 Session 卡片仍可见（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- 活跃 Orchestrator 决定共享 Bot 活动，并发 Assignment 的工具详情不再覆盖主状态；展开后仍显示双方 Session，Orchestrator 结束后恢复展示仍在执行的 Assignment（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- 新增受管 Container Browser target，使用独立 profile 数据、既有原生 Browser 审批与认证 Human 预览，明确开启操作时先暂停 Bot；默认仍为 Local（[#726](https://github.com/BotHarness/BotHarness/issues/726)，[ADR-0114](docs/adr/0114-browser-targets-share-capabilities-with-separate-execution-worlds.md)）。
- Channel sidebar 设置新增个人排序编辑，支持拖动与键盘、完成／取消／恢复默认草稿操作，恢复展开时保留权限限制，并分别保存 DM 与群组的浏览器顺序 ([#721](https://github.com/BotHarness/BotHarness/issues/721)).

- Computer 与 Browser Access 改用紧凑 Lucide Power 按钮，提供本地化授权操作、Host 确认状态、处理中防重与失败提示 ([#720](https://github.com/BotHarness/BotHarness/issues/720)).

- 记忆侧栏刷新与重新展开时保留上次成功内容，仅首次读取显示骨架屏，失败时通过重试恢复，并移除标题栏刷新按钮（[#719](https://github.com/BotHarness/BotHarness/issues/719)）。

- Channel sidebar 各功能项新增 Lucide 图标，顶部齿轮集中会话与记忆演化显示设置，并保留各项原有偏好保存范围（[#718](https://github.com/BotHarness/BotHarness/issues/718)）。

- Human 可在群聊组合器一次选择 `@所有 Bot` 并查看活跃接收人数；单个 Bot 的提及菜单仅显示头像、名称及角色标签；过期预览须重新确认发送，提交的消息沿用逐个 @Bot 的 attention 与 wake policy（[#542](https://github.com/BotHarness/BotHarness/issues/542)）。

- 显式获授权的 Host Plugin 可通过 Activity 的不透明引用读取有界原生 Tool 参数／结果；未授权、过期或撤销后拒绝读取，Channel 活动不会公开原始内容（[#122](https://github.com/BotHarness/BotHarness/issues/122)）。
- 群 Profile 显示成员各自的有效消息提醒；明确开启收件的 Lark 普通消息保留一份共享历史，并按各成员既有数量／时间汇总或安全排队的逐条策略处理 ([#638](https://github.com/BotHarness/BotHarness/issues/638)).

- 群组频道资料可通过 Attention 风格表格、独立收件 Switch 与编辑／删除弹窗管理一个已授权 Lark 频道连接器；暂停保留已收来源，删除仅移除收件路径而保留 Bot 身份和历史（[#700](https://github.com/BotHarness/BotHarness/issues/700)）。
- 总览统计新增逐 Bot 近七天 Memory Git 提交趋势与当前未提交改动提示，复用紧凑 Profile 卡片，明确显示仓库不可用状态并可展开每日精确值（[#716](https://github.com/BotHarness/BotHarness/issues/716)）。
  既有 Bot Profile Memory 活动也统一使用相同的普通提交日期与引用口径。
- 展开的消息框状态区在每个活跃 Session 的独立紧凑卡片内显示最新安全活动，不重复 Bot 名称；Host revision 同步当前记录，完成或销毁的 Session 移出，重启后重建当前基线，不复制参数、结果或推理内容；展开区域透明，桌面名称与状态同行，Assignment 显示原生 DSH 名称（[#122](https://github.com/BotHarness/BotHarness/issues/122)）。

- 总览统计新增整体及逐 Bot 的今日／近七天 token 用量、对齐 Profile 的紧凑图表、分页明细和直接 Profile 导航；未知分项及保留用量保持明确（[#709](https://github.com/BotHarness/BotHarness/issues/709)）。
- 浏览器标签页活动可在侧栏和输入框上方显示 Provider 显式声明的操作摘要；仅接纳有界公开文本，并发摘要冲突时省略，URL、页面标题和原始工具载荷不进入 Activity（[#122](https://github.com/BotHarness/BotHarness/issues/122)）。

- 当前工具摘要新增可信的主会话、任务会话与 DSH 子代理来源，执行会话数量与并发工具数量分开统计，已完成来源经同一版本化 Host 投影清除，展开后以与总览一致的紧凑角色行展示（[#122](https://github.com/BotHarness/BotHarness/issues/122)）。
- 总览优先展示等待 Human 的 Bot，提供一键消息已读且保留待处理请求，并以现有 TanStack 图表呈现可折叠 Channel 统计（[#705](https://github.com/BotHarness/BotHarness/issues/705)）。

- 新增 macOS 本机 Computer，可在 Profile 设置中选择本机或 Docker 目标，显式检查桌面权限并按 Bot 授权；新安装默认使用本机桌面，旧 Docker 配置保留原目标（[#694](https://github.com/BotHarness/BotHarness/issues/694)）。

- PersonaBot Profile 将外部身份与来源授权分开管理，支持仅绑定账号、持久启停、本地命名、重连及明确解绑，保留已收历史和既有授权的准确范围（[#699](https://github.com/BotHarness/BotHarness/issues/699)、[ADR-0111](docs/adr/0111-external-identity-lifecycle-is-independent-of-grants.md)）。

- 总览展示今日可访问 Channel 的消息总量，区分 Human／Bot／其他发送者，并可展开查看当前名字与明细；明确日期与时区，统计读取不推进已读 ([#703](https://github.com/BotHarness/BotHarness/issues/703))。

- 总览默认聚焦活跃 Bot，保留有 Human 待行动的 Bot，并可直接在 Bot 卡中回答或决定；正在执行的 Session 以紧凑行卡显示当前原生名称与角色图标，保留准确 Session 跳转（[#698](https://github.com/BotHarness/BotHarness/issues/698)）。
- PersonaBot 可主动跟进已验证的 Lark 话题，按群默认或独立唤醒策略接收普通回复，并在退出后恢复群收件规则；Human 可查看和覆盖参与方式 ([#614](https://github.com/BotHarness/BotHarness/issues/614), [ADR-0110](docs/adr/0110-external-thread-following-is-scoped-and-explicit.md)).

- PersonaBot 在侧栏与输入框活动区域同步显示 Host 声明的工具效果和紧凑安全摘要；并发不同类别回退通用工作状态，键盘可展开当前工具摘要，不暴露原始参数或结果（[#122](https://github.com/BotHarness/BotHarness/issues/122)）。

- 活动中心入口改为 Bot 模式设置旁的紧凑未读 Chip；侧栏折叠后显示为 Bot 模式下方对齐的图标，跨聊天和刷新记住最后查看的总览或收件箱，展开时仅显示未读数字 badge，没有未读时仅在 Bot 模式开启后悬停或聚焦才显示入口；折叠时入口仅在 Bot 模式开启后显示，并以右上角红点提示通知（[#679](https://github.com/BotHarness/BotHarness/issues/679)）。
- Human 或绑定 Bot 可为已授权外部群独立配置普通文字收件，以及按数量／时间汇总、下一轮唤醒、随提及阅读或静默读取；Admission 保留当时的策略版本，普通消息不打断正在执行的步骤 ([#613](https://github.com/BotHarness/BotHarness/issues/613), [ADR-0109](docs/adr/0109-external-group-collection-is-separate-from-wake.md)).

- Human 可将授权 Lark 群的 @ 消息接入已有共享 Group Channel：当前成员读取同一条带来源的外部消息，仅被 @ 的绑定 Bot 被唤醒，并可用自己的身份明确回复 ([#634](https://github.com/BotHarness/BotHarness/issues/634), [ADR-0108](docs/adr/0108-shared-channel-bridge-places-canonical-external-sources.md)).

- 活动中心新增跨 Bot 总览，显示权威 Human 待行动数、Bot 当前状态及正在执行的 Orchestrator／Assignment Session；点击 Bot 进入私聊，点击 Session 切换到准确的 DSH 原始会话（[#541](https://github.com/BotHarness/BotHarness/issues/541)）。

- 只收 @ 的 PersonaBot 可用自己的 Lark 身份主动读取有界群历史、附近时间窗或原话题上下文；Inbox 来源以聊天布局展示内容、姓名和 @ 人员，消息／来源引用、稳定 ID 与读取记录可展开查看，遗漏及权限拒绝仍明确提示，不将普通历史加入收件或产生新唤醒；Provider 分页游标不前进时，在保留或观察返回消息前明确拒绝（[#612](https://github.com/BotHarness/BotHarness/issues/612)）。

- PersonaBot 可处理获准 Lark 话题中收到的 ZIP，另存独立工作副本，明确选择新文件并回复原话题；Bot Inbox 提供按需原件下载，使用已验证临时 provider（[#657](https://github.com/BotHarness/BotHarness/issues/657)、[文件指南](docs/file-open.md)、[ADR-0107](docs/adr/0107-external-files-use-trusted-source-capabilities-and-existing-owner.md)）。

- Human Inbox 增加可筛选的已处理历史，回看提问答案、工具审批、Workspace Grant 回应和 Assignment 答复，并准确跳转请求及回答；待行动默认等待最久优先，双窗口与重启沿用权威事实刷新（[#553](https://github.com/BotHarness/BotHarness/issues/553)）。

- Human 可在 Human Inbox 授权工作区请求或回应等待／受阻 Assignment，查看来源上下文并准确打开 Session；已提交回应沿用 Bot DM authority，待办根据持久事实刷新（[#552](https://github.com/BotHarness/BotHarness/issues/552)）。

- Human 可在 Human Inbox 使用来源 DM 提问卡的选项或自定义输入回答实时原生提问；答案只恢复原请求一次，刷新已解决或过期待办，并保留其他 Bot 的独立请求（[#551](https://github.com/BotHarness/BotHarness/issues/551)）。

- Human 可在 Human Inbox 查看实时工具请求并原位批准或拒绝，同时展开来源附近消息或准确跳转。决定沿用来源 DM 命令，移除已解决待办、保留其他 Bot 的独立请求，并刷新过期卡片（[#550](https://github.com/BotHarness/BotHarness/issues/550)）。
- PersonaBot 可通过原生文件工具读取指定收到的原件，并在 Human 审批下显式编辑；原消息下载与共享引用展示当前内容，独立上传和默认工作副本保持独立（[#633](https://github.com/BotHarness/BotHarness/issues/633)，[文件指南](docs/file-open.md)）。

- Human 参与的 DM 与群聊头部菜单支持“我的昵称”；各 Channel 独立设置，清除后继承插件默认名，历史提及、Inbox 与 Bot 上下文使用来源 Channel 的当前称呼，不改变身份或注意力（[#622](https://github.com/BotHarness/BotHarness/issues/622)）。

- PersonaBot 用量新增实际模型／提供商与执行类别筛选，独立展示保留的累计用量，图表默认近七天，并明确显示查询新鲜度或失败状态 ([#507](https://github.com/BotHarness/BotHarness/issues/507)).
- 本地 Human 可在插件设置中保存可选默认名字，Channel 作者、成员、回执与 Bot 上下文使用当前称呼；历史可信 Human／Bot 提及按稳定身份显示当前名字，不改写消息或注意力事实（[#621](https://github.com/BotHarness/BotHarness/issues/621)、[ADR-0103](docs/adr/0103-local-human-names-label-one-identity-across-channels.md)）。
- Human 可明确允许 PersonaBot 写入一个已授权工作目录，将收到的文件另存到该目录，通过原生工具与经过审批的 Shell 处理，再回发独立可下载的结果（[#632](https://github.com/BotHarness/BotHarness/issues/632)、[ADR-0105](docs/adr/0105-attachments-use-native-file-operations-under-source-authority.md)）。
- Human 可开启已授权 Lark 工作群的文字 @ 收件，将消息送入绑定 PersonaBot 的 canonical Inbox；Bot 使用自己的身份显式回复原群／话题，保留来源详情、独占收件且不隐式镜像到 Human DM。此隔离验证切片使用已核验的临时 Provider，不代表生产 IM 启用（[#12](https://github.com/BotHarness/BotHarness/issues/12)、[ADR-0106](docs/adr/0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md)）。

- PersonaBot 可通过群聊中有效的成员身份明确提及本地 Human；Human Inbox 将可信提及与直接回复合并到个人视图，支持展开上下文和原位回复，普通 `@Human` 文本不会生成个人提醒（[#549](https://github.com/BotHarness/BotHarness/issues/549)）。
- PersonaBot Profile 的每日用量与实际模型图表共用一个有界时间范围，初始显示最近 7 天；模型／提供商切换只展示选中维度；默认按模型合并提供商与执行类别，以紧凑单行显示名称与总 token，含缓存的输入、缓存读、输出和加权比例放在图表悬浮提示中，并提供用量构成与缓存比例图；键盘可展开的详细信息提供会话类别 ([#592](https://github.com/BotHarness/BotHarness/issues/592))。
- 旧消息附件在 Host 启动时迁移到可恢复的独立真实文件身份，原消息菜单可打开当前目标；相同 hash 不会意外联动，带归属的旧读取跟随保存后的内容，不改写消息或唤醒 Bot（[#577](https://github.com/BotHarness/BotHarness/issues/577)，[迁移指南](docs/file-open.md)）。
- 本地 IM 验证 Profile 可显式安装固定 Git 提交的已验证临时 dsh-im fork，并在启动前校验运行时代码；旧 npm 包仍不可用，生产启用仍需上游资格验证（[#117](https://github.com/BotHarness/BotHarness/issues/117)、[指南](docs/client-bridge.md#qualified-optional-im-provider)、[ADR-0104](docs/adr/0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md)）。

- PersonaBot 模型用量现在按实际 provider/model 分别展示 Orchestrator、Assignment 和 DSH 子代理调用，计入失败和重试调用已报告的 token；未报告的用量仍显示未知（[#503](https://github.com/BotHarness/BotHarness/issues/503)、[ADR-0094](docs/adr/0094-retain-per-model-usage-after-session-deletion.md)）。

- Human Inbox 在个人视图中展示群聊 Bot 对本地 Human 的直接回复，可按 Bot／Channel 过滤、准确定位来源并原位回复；附近消息按时间排列，显示作者、头像和时间，个人回复与其他未读消息共用去重后的权威未读总数（[#548](https://github.com/BotHarness/BotHarness/issues/548)）。
- PersonaBot 资料页新增 IM 账号绑定、明确目标授权、持久发送记录和未知结果提示；外部发送要求兼容的公开 dsh-im 契约，旧接口保持禁用（[#117](https://github.com/BotHarness/BotHarness/issues/117)、[ADR-0101](docs/adr/0101-external-grants-require-authenticated-accounts-and-checked-targets.md)）。
- Human 可在收件箱内查看群聊或 PersonaBot 私聊未读消息及附近上下文，并直接回复；来源不可用时拒绝提交，失败时保留草稿（[#547](https://github.com/BotHarness/BotHarness/issues/547)）。
- PersonaBot Profile 现在按实际调用的 provider/model 显示每日用量，分别展示输入、输出、缓存读写 token 和 provider 报告的总数；未报告的分项明确显示未知（[#499](https://github.com/BotHarness/BotHarness/issues/499)）。
- Human 可通过 DSH 应用菜单在 Host 上打开当前 Memory Repository、子目录及文件，显示文件位置、复制 Host 路径，或将完整当前文件下载到浏览器设备；普通文件选择仍使用内置阅读器（[#574](https://github.com/BotHarness/BotHarness/issues/574)、[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)）。
- Human 可点击或右键已授权 Workspace 的路径，用 Host 探测到的应用打开当前目录或复制路径；Host 校验当前 Workspace Grant 与注册身份，不改变 Grant、Session cwd 或访问权限（[#575](https://github.com/BotHarness/BotHarness/issues/575)、[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)）。
- 新消息附件可通过文件菜单打开真实 Host 目标；外部保存后，原消息后续读取与下载获得当前文件，独立上传互不联动，显式复用同一身份才共享，不产生通知或 Bot wake（[#576](https://github.com/BotHarness/BotHarness/issues/576)，[文件指南](docs/file-open.md)）。

- Human 收件箱现在按 Channel 汇总群聊和 PersonaBot 私聊未读消息，在侧栏入口显示去重后的消息数；只有打开具体消息或主动标记时才推进已读位置，待处理事项另有提示（[#546](https://github.com/BotHarness/BotHarness/issues/546)、[ADR-0098](docs/adr/0098-activity-center-separates-overview-and-human-inbox.md)）。
- PersonaBot 的消息投递方式现在可按来源在 Profile 中设置：Human 私聊、Bot 私聊、群内提及规则可选择消息在活动回合中**并入正在运行的回合**（`steer`，默认不变）或**排为独立回合**（`turn`）；已入队的消息保留原修订（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Group Channel 现在可从聊天头部打开群 Profile，查看已提交消息的每日热力图与按作者分组的活跃度；固定的群卡片显示在弹层中（[#424](https://github.com/BotHarness/BotHarness/issues/424)、[ADR-0085](docs/adr/0085-personabot-profile-is-a-popover-and-a-channel-body-view.md)）。
- 浏览器观察现在覆盖无角色的可点击目标（图标、自定义按钮，例如 B 站发布框控件）：它们以 `clickable` 角色获得 ref；ref 点击会在元素中心派发真实输入事件；`browser_click` 还支持从 1:1 CSS 像素截图读取的视口 x/y 坐标，用于完全没有 ref 的目标（[#526](https://github.com/BotHarness/BotHarness/issues/526)）。
- PersonaBot 可以分配到命名的 Bot Browser profile（默认：共享 profile）；同一 profile 上的 Bot 共享登录态，不同 profile 会按需启动为独立浏览器并各自空闲停止。Browser entry 提供 Profile 输入框修改分配（[#497](https://github.com/BotHarness/BotHarness/issues/497)、[ADR-0096](docs/adr/0096-bot-browser-profiles-are-named-and-assignable-per-personabot.md)）。
- Human 可在 PersonaBot Profile 中创建本地模型预设并应用为该 Bot 的独立计划；Orchestrator 从下一轮起使用所选的 provider、模型和 reasoning effort（[#498](https://github.com/BotHarness/BotHarness/issues/498)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 可以修订可复用模型预设供今后应用，在 Profile 的紧凑控件中切换某个 PersonaBot 的预设，或把该 Bot 的 Orchestrator 选择保存为自定义快照。已有 Bot 快照保留原路由，过期的预设编辑会被拒绝，每次应用或自定义修改都会增加 Bot 计划修订号（[#501](https://github.com/BotHarness/BotHarness/issues/501)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 可在 PersonaBot Profile 中设置新建 Assignment 可用的模型和 reasoning effort，包括每个模型的默认 effort 与整体默认模型。Orchestrator 可为新 Assignment 选择允许的路由，其 DSH Session 使用该路由；超出 Bot 计划的选择会在启动工作前被拒绝（[#504](https://github.com/BotHarness/BotHarness/issues/504)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 切换 Bot 预设后，已有 Assignment 保留原模型；Orchestrator 可显式选择当前 Bot 计划允许的路由，在该会话下一次 DSH 请求生效，未获允许的选择不会改变原路由（[#506](https://github.com/BotHarness/BotHarness/issues/506)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- PersonaBot 启动 DSH 子代理时，默认继承仍获允许的父会话模型与 effort。如果旧 Assignment 的路由已被当前 Bot 计划排除，新子代理改用当前 Assignment 默认值，并告知父 Agent；越界或不可用的选择会在创建子代理前失败（[#508](https://github.com/BotHarness/BotHarness/issues/508)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- PersonaBot 现在可用 `browser_upload` 把宿主文件附到页面上（可选先点击打开选择器的控件）：原生对话框被拦截，页面文件输入收到该路径；审计只记录文件名（[#491](https://github.com/BotHarness/BotHarness/issues/491)）。
- `browser_screenshot` 现在会把截图保存到浏览器数据目录并返回其路径，只保留最新的若干张（[#494](https://github.com/BotHarness/BotHarness/issues/494)）。
- 记忆演化现在提供包含分支、提交、暂存区和工作树状态的审计恢复检查点。Human 确认后可恢复，并完整归档原仓库；检查点区分“何时被观察”与 Git 内容作者（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[ADR-0097](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)）。
- PersonaBot 现在可用 `browser_tabs`（list/open/select/close）在共享 Bot Browser 中保留自己拥有的多个后台标签：新标签以后台方式打开、不抢焦点；观察与操作跟随当前选中的标签；空闲 Bot 标签自动关闭而浏览器继续运行；Human 关闭的标签可通过 list/select 或重新打开恢复（[#463](https://github.com/BotHarness/BotHarness/issues/463)）。
- PersonaBot 在 Bot Browser 里现在不止能读、还能操作：`browser_click`、`browser_type`、`browser_press_key`、`browser_scroll` 与 `browser_wait` 使用最近一次观察的 ref；ref 过期会以明确的"重新观察"错误失败；输入文本进入审计时只记字符数（[#462](https://github.com/BotHarness/BotHarness/issues/462)）。
- Browser entry 现在显示该 Bot 当前标签的实时画面，并提供 Human **接管**：接管期间该 Bot 的浏览器动作与模型截图暂停，结束接管后恢复；Bot 新增 `browser_screenshot` 工具，截图只作为 model attachment 送达模型，绝不进入审计（[#461](https://github.com/BotHarness/BotHarness/issues/461)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)）。
- Human 开启某个 PersonaBot 的 Browser Access 后，该 Bot 即可在 profile 共享的 Bot Browser 里浏览网页：只读的 `browser_open` 与 `browser_observe` 工具及其指引只注入这个 Bot 的会话，每个会话的首次动作向 Human 询问一次（profile 开关可自动允许），每次观察与动作都以脱敏的 Browser Audit 记录；机器上没有可用浏览器时按需安装 version-pinned Chrome for Testing（[#460](https://github.com/BotHarness/BotHarness/issues/460)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 外部工具修改记忆后，变更路径会作为持久事件进入 PersonaBot 的 Bot 收件箱。Host 关闭期间的编辑会在启动时恢复，并于下一次普通回合送给 Agent；不会额外唤醒，也不会注入文件全文（[#350](https://github.com/BotHarness/BotHarness/issues/350)、[#352](https://github.com/BotHarness/BotHarness/issues/352)、[#464](https://github.com/BotHarness/BotHarness/issues/464)、[ADR-0092](docs/adr/0092-memory-changes-enter-bot-inbox-with-durable-observations.md)）。
- PersonaBot 现在可用 `group_leave` 自行退出已加入的群聊；离群后立即失去 Channel 访问权，群内留下一条区分“自行退出”和“被移出”的成员变动提示，并按其他成员各自的 Channel 唤醒策略投递独立 Inbox Admission；离群成员未处理的 Group Inbox Admission 会被结算，原消息历史保留且不会在 Human Inbox 产生虚假的修复事项；若它是创建者，其他成员继续留在由 Human 管理的群聊中；提交后的唤醒通知失败时，Host 运行期间会重试（[#372](https://github.com/BotHarness/BotHarness/issues/372)、[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)）。
- PersonaBot 私聊把「记忆文件」与「记忆演化」分成两个入口：目录树中的文件在 Channel body 以紧凑的阅读面板只读查看；提交历史和当前差异以带新旧行号的紧凑阅读面板呈现，默认按「新记忆／已有记忆的更新」分组，也可切换到持久化的 Git 术语与状态标识。外部编辑会自动更新；演化标题栏提供刷新与术语菜单，侧栏只在分支选择区显示分支名，不再重复展示历史标题或区块分隔线（[#416](https://github.com/BotHarness/BotHarness/issues/416)、[#444](https://github.com/BotHarness/BotHarness/issues/444)、[#466](https://github.com/BotHarness/BotHarness/issues/466)、[ADR-0088](docs/adr/0088-memory-files-and-evolution-are-separate-channel-views.md)）。
- Human 开启某个 PersonaBot 的 Computer Access 后，该 Bot 即可操作共享 Computer：精选的观察/动作/验证工具集与其指引只注入这个 Bot 的会话；每个会话的首次动作向 Human 询问一次（profile 开关可自动允许）；每次观察与动作都以脱敏的 Computer Audit 记录（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0079](docs/adr/0079-adopt-official-computer-use-seam-with-own-provider.md)、[ADR-0080](docs/adr/0080-computer-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 群聊 Channel 现将成员名单与群设置分开。Human 可裁切正方形 WebP 群头像、改群名、搜索并邀请 PersonaBot，在通知弹窗处理待办邀请和入群申请，并通过成员菜单调整消息提醒策略或移出成员，并从次级菜单解散群聊；群头像在普通、置顶和折叠侧栏中一致显示（[#390](https://github.com/BotHarness/BotHarness/issues/390)）。
- 已入群的 PersonaBot 可通过 Orchestrator 工具读取及修改自己的群聊提醒偏好；Human 与 Bot 共用同一 Channel 当前值，修改留下可追溯的修订历史，已入队消息继续保留原策略快照（[#365](https://github.com/BotHarness/BotHarness/issues/365)）。
- PersonaBot 资料页现在将可折叠的来源策略放在活动图表下方；两个区域铺满 Channel 正文的可用宽度，展示所有内建来源类别的提醒默认规则及其持久修订来源；新 Channel 与 Assignment 待办记录所用来源规则修订，同时保持即时送达、群消息汇总和报告条件唤醒的既有行为（[#366](https://github.com/BotHarness/BotHarness/issues/366)）。
- PersonaBot 可通过限定在自身 Session 的工具查看所有来源提醒默认值及近七天 Orchestrator 实际唤醒次数。Bot 或 Human 可修改 Assignment 报告唤醒，以及普通群消息的默认提醒（每条、可调条数／间隔的汇总、仅提及、静默），恢复内建默认，并在资料页查看最后修改者与持久修订。已设置的单群偏好仍优先；已入队 Admission 保留原策略快照（[#370](https://github.com/BotHarness/BotHarness/issues/370)）。

- Group Channel 成员可选择让 PersonaBot 即时处理每条普通消息、定期汇总、仅由直接提及唤醒，或静默记录；直接提及会带入同群有界的待处理上下文，包括最早未读和附近消息，并提示省略数量，后续回合继续推进积压消息。主动读取的消息在回合中显示“处理中”，成功后显示“已处理”，失败则需修复；没有返回的消息保持待处理。新成员默认使用汇总；点击群成员或 Bot 消息头像可打开该 Bot 的私聊（[#364](https://github.com/BotHarness/BotHarness/issues/364)）。

- 长事项报告现在只向 Bot 收件箱发送简短预览和 DSH Spill 定位信息，无需打断 Agent 或要求它先写文件；Orchestrator 可通过 DSH Session Query 分页读取已接收的完整报告，或按需查看最近的 Session 事件，并获得返回量与估算 token 成本（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- Group Channel 回执现可在 Bot 消息旁显示本机 Human 具名未读／已读状态，依据持久 Human 成员关系与按身份保存的阅读位置；发送者不计入自己的收件人数（[#347](https://github.com/BotHarness/BotHarness/issues/347)、[ADR-0078](docs/adr/0078-local-human-group-receipts-use-member-identity.md)）。
- operational-logs 技能（`logs.db` 阅读指南）现在仅在 Bot 设置的开发者模式开关打开时出现在技能与 `/` 目录中：开启后人类可调用 `reading-operational-logs`，模型可按需加载指南；关闭（默认）时任何客户端都看不到它（[#248](https://github.com/BotHarness/BotHarness/issues/248)）。
- 停止事项后，Host 会在所属 PersonaBot 的 Bot 收件箱记录生命周期通知，使 Orchestrator 即使没有事项报告也能告知已确认的停止结果；未读通知在 Host 重启后继续送达，若 DSH 的 Agent Loop 尚未就绪则短暂重试（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- 已有的完整文件访问 Assignment 在关闭 Bot 默认开关或重启 Host 后，仍会在 Bot 的会话列表显示权限提示；提示依据该会话创建时的权限快照（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- Group Channel 成员可为 Bot 选择静默收件：普通消息保留为持久待处理 Admission，重启后也不会自动唤醒；直接 @ 仍即时唤醒（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- Orchestrator 现在可通过 DSH 原生取消停止事项；停止状态在重启后保留，迟到报告不能使事项复活，同一 Continuity Key 可启动新 Session（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- Bot 模式在“消息”上方提供 Human 收件箱，汇集待处理的群聊加入申请、原生 Bot 提问和工具审批，以及新 Bot 私聊消息。用户可打开来源作出决定、将通知标记已读，并按 Bot 或 Channel 筛选和按时间排序（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。
- 事项明确请求 Human 协助时，会在 Human 收件箱的待办中出现一项，并可打开对应事项详情；后续受阻报告会更新同一项及最新原因；如回复后事项仍受阻，待办继续显示，直到新报告解除受阻或事项停止（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- PersonaBot 的工作区授权请求现在会作为 Human 收件箱待办出现，并可打开对应的私聊卡片。带有 Host 核验 Grant 引用的授权回复会清除待办；普通回复不会清除（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。
- Bot 收到的 Channel 消息如需修复，现会进入 Human 收件箱的待办。Human 可打开 Bot 收件箱或原消息；来源 Channel 不可用时安全降级到 Bot 收件箱，修复状态解除后待办消失，不产生第二套收件箱存储（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#126](https://github.com/BotHarness/BotHarness/issues/126)）。
- 已完成的事项报告可进入 Human 收件箱“仅供了解”；Human 能打开对应事项，或忽略这一份报告。决定在重启后保留，同一事项的新报告仍会重新出现（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。

- Bot 收件箱的来源组在新待处理消息或更严重状态到来时会重新展开；内容没有变化时，Human 手动折叠的组保持折叠（[#152](https://github.com/BotHarness/BotHarness/issues/152)）。
- PersonaBot 私聊的右侧栏现在按来源 Channel 分组显示该 Bot 的收件箱，呈现持久 Attention 状态、来源消息跳转和来源不可用时的降级提示；已处理不代表 Bot 必须回复（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)、[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)）。
- PersonaBot 可用 `inbox_ignore` 明确忽略已收到或读过的 Channel 消息；持久 Bot Inbox 与 Channel 投递状态会区分这项决定和无需回复的正常处理，原始消息仍保留在历史中（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)）。
- Assignment 报告现在与 Channel 消息共用持久 Bot Inbox，显示报告状态并可打开所属事项。重启后尚未观察的到期报告会继续处理；进入 Orchestrator 上下文后中断的报告显示“需要修复”，已完成回合也不强制向 Channel 回复（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)、[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)）。

- Human 可在 PersonaBot 私聊里通过 `#` 选择 Group Channel；Bot 仅收到当前 ID 与名称，不会因此入群或看见成员和历史。Bot 可申请加入，由 Human 或群的 Bot 创建者批准或拒绝；Human 点击已发送的引用可打开对应群聊（[#292](https://github.com/BotHarness/BotHarness/issues/292)、[ADR-0069](docs/adr/0069-selected-channel-references-and-bot-join-requests.md)）。

- Group Channel 可按 Bot 设置普通消息汇总：积累 N 条，或非空队列等待 T 秒后，在 Bot 下一个空闲回合投递一份有界 Inbox 摘要。直接 @ 仍即时唤醒；忙碌的 Bot 先完成当前回合，汇总处理完成无需强制回复。Bot 明确读取到的群消息会标记为该 Bot 已观察，不再进入后续汇总（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。

- PersonaBot 现在可列出自己已加入的群聊、Human 私聊和 Bot 私聊，按名称或 Bot 成员筛选、查看当前成员，并用稳定 Channel ID 向选中的 Channel 发送消息；也能通过统一的 `channel_read` 工具按正文、作者和日期查询单个 Channel 的完整消息历史，或跨已加入的 Channel 搜索，并通过游标翻页（[#304](https://github.com/BotHarness/BotHarness/issues/304)）。
- 创建 PersonaBot 时可选择空白记忆仓库，或用 HTTPS/SSH Git 地址导入。Host 先检查 Git，再利用现有凭证在暂存目录克隆；克隆成功后才创建 Bot，失败不会留下半创建的 Bot（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。

- PersonaBot 现在可创建群聊 Channel，并通过持久化的待处理邀请及 Bot Inbox Admission 邀请活跃同事；受邀 Bot 接受或拒绝后才决定是否取得成员身份与群聊访问权。创建者可改群名、移出 Bot 成员；Human 可查看邀请状态、取消邀请、移出成员、改名，或以保留运行证据的逻辑删除方式移除整个群聊（[#282](https://github.com/BotHarness/BotHarness/issues/282)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- 在 Human–PersonaBot 私聊中，选择一个或多个其他活跃 Bot 的 `@`，会在当前 Bot 下一回合提供这些 Bot 的稳定 ID、当前名称和有限简介；仅选择不会唤醒这些 Bot，也不会让它们加入私聊（[#280](https://github.com/BotHarness/BotHarness/issues/280)）。
- 群聊中的 PersonaBot 现在可以按稳定 ID @ 多位已入群同事；Host 渲染 Bot 标签，只提交一条消息，并独立唤醒各收件 Bot，同时限制 Bot 间循环（[#281](https://github.com/BotHarness/BotHarness/issues/281)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- PersonaBot 现在可以通过双 Bot 私聊联系活跃同事。每次发送会提交一条 Channel 消息及发送者 Human DM 中不复制正文的动作入口；仅在跳数限制和因果根去重检查允许时，才为收件 Bot 建立 Inbox Admission；收件 Bot 可在同一私聊回复。Human 可从隐藏频道管理器只读查看这些私聊（[#279](https://github.com/BotHarness/BotHarness/issues/279)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- Human 现可在群聊中通过 `@` 候选列表选中多个已入群的 PersonaBot；一条已提交消息分别唤醒各 Bot，回复留在原群，并独立显示处理状态；选中的提及在输入框和已发送消息中均显示为不带 @ 的头像加名称标记；点击已发送的标记还可打开该 Bot 的私聊。旧 Channel 历史会一次性从 NDJSON 导入 SQLite Messaging 权威（[#254](https://github.com/BotHarness/BotHarness/issues/254)、[ADR-0037](docs/adr/0037-messaging-facts-share-one-sqlite-transaction.md)）。
- PersonaBot 当前检出的 Memory Git 工作树现在就是当前记忆：原生 Git 可引入无关联历史、合并提交、代码和二进制文件，不再需要第二道接纳步骤。Channel Memory 显示当前文件与所有本地分支历史；二进制文件在文本预览中保持只读（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[ADR-0068](docs/adr/0068-git-working-tree-is-current-memory.md)）。
- 记忆分支目标含糊时，Orchestrator 通过 DSH 原生提问服务在 PersonaBot 私聊询问；Human 的选择恢复同一 Session，已回答或取消的卡片刷新后仍不可重复操作（[#264](https://github.com/BotHarness/BotHarness/issues/264)）。

- 记忆分支切换遇到未完成改动时，Orchestrator 可协调相关事项、以命名 Git stash 保留工作，再在同一 Session 重试；私聊的分支选择器支持输入过滤本地分支（[#263](https://github.com/BotHarness/BotHarness/issues/263)）。

- Human 可在记忆 Git 提交上选择「从此处继续」、命名新分支；同一个 Orchestrator Session 创建并切换到该分支。原始待验收提交仍保持未验收，并可通过 Human Repair 恢复（[#262](https://github.com/BotHarness/BotHarness/issues/262)）。
- Human 可在 PersonaBot 私聊选择已有且已验收的记忆分支；同一个 Orchestrator Session 切换仓库，在 Channel 回报进度，并在下次原生读取时看到新工作树的文件（[#261](https://github.com/BotHarness/BotHarness/issues/261)）。
- PersonaBot 私聊的记忆侧栏现显示本地 Git 分支与提交图，并标示验收及修复状态；选中提交可在整个 Channel 主区域查看改动文件和差异，返回对话时保留草稿与阅读位置（[#260](https://github.com/BotHarness/BotHarness/issues/260)）。
- PersonaBot 私聊现可查看已接受的记忆文件、编辑现有 Markdown 文件并检查经过验证的提交历史与差异；Agent 的普通文件写入会在成功回合后接受，暂存或分叉的仓库状态会阻止继续保存；Human 可明确修复：先归档未完成更改，再恢复已接受的 head（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- PersonaBot 需要尚未授权的项目文件夹时，Orchestrator 可在私聊发送授权请求卡；Human 在卡上选择 Host 文件夹后，明确的授权回复唤醒同一个 Orchestrator Session，再创建事项（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- Human 可在 PersonaBot DM 侧栏通过 DSH 目录选择器或绝对路径添加 Host 文件夹，并移除有效授权而不删除文件；侧栏默认只显示固定 Memory 与有效文件夹，Bot 设置中的开发者模式开关可显示撤销历史与高级文件夹选项。新事项保留所选 Grant 与单目录权限快照；Bot-owned Session 保留 DSH 原生文件与搜索工具，并在每次调用时校验 Grant；Shell 等无法按路径核对文件效果的工具会在 Bot 私聊请求 Human 对当前调用批准或拒绝（[#116](https://github.com/BotHarness/BotHarness/issues/116)、[ADR-0067](docs/adr/0067-workspace-grants-bound-personabot-file-access.md)）。
- PersonaBot 工具审批卡可保存「完整输入相同」或「当前角色与 Grant 范围内全部不透明工具」的自动批准规则；规则可撤销，每次命中仍由 DSH 独立审计。另有单 Bot 危险权限开关，经明确风险确认后，对**之后新建**的事项使用 `danger-full-access + never`，不改变已有事项或 Orchestrator（[#116](https://github.com/BotHarness/BotHarness/issues/116)、[ADR-0067](docs/adr/0067-workspace-grants-bound-personabot-file-access.md)）。
- Bot 模式的 Channel 现可用 Shift 按可见顺序范围选择、用 Ctrl／⌘ 逐个增减；右键任一已选 PersonaBot DM 或群聊 Channel，可在按数量显示文案的菜单中批量置顶或取消置顶、移动到分组（包括从置顶区移动）或隐藏；每次多选通过单个有数量上限的 Host 命令提交，并一起呈现在列表中，不再另设操作栏。破坏性批量删除仍待 [#138](https://github.com/BotHarness/BotHarness/issues/138) 定义（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- 置顶 Channel 默认跟随全局排序，也可独立选择最近更新或手动排序；在置顶区内拖拽可调整位置而不取消置顶，手动落点会持久化，并同步作用于展开侧栏与折叠 rail（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- Web 侧栏现可用 Alt+1–9 打开对应的可见 Channel、用 Alt+0 打开第十个；按住 Alt 时会显示行内数字提示，Alt+波浪线键切换 BOT 模式。输入框不会被快捷键抢占，桌面宿主的 Ctrl／⌘ 映射留待后续接入（[#216](https://github.com/BotHarness/BotHarness/issues/216)）。
- Bot 与桥接 Channel 消息现在使用 DSH 原生安全渲染器显示 Markdown；Human 消息仍保留原样文字与换行（[#142](https://github.com/BotHarness/BotHarness/issues/142)）。
- PersonaBot 的回复在生成 `channel_send` 时会先作为 Channel 实时草稿出现，提交后由唯一正式消息接替；中断的草稿会消失并显示明确状态（[#144](https://github.com/BotHarness/BotHarness/issues/144)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- Channel 消息现在可引用同一 Channel 中已提交的消息。输入区支持回复与取消；气泡显示作者和摘要，点击可定位较早历史；原消息不可见时安全降级（[#145](https://github.com/BotHarness/BotHarness/issues/145)）。
- Human 与 PersonaBot 的 Channel 消息现在可携带上传图片和可下载文件；上传失败可在输入区重试，已提交消息只保存 profile 范围内的附件引用（[#146](https://github.com/BotHarness/BotHarness/issues/146)）。

- Bot 设置分区里的 Computer 分组支持在导出时选择目标目录，并可一键在宿主文件管理器中打开目录；当部署未挂载目录选择器时也可以手动输入路径（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- Bot 设置分区新增 Computer 分组：导出目录通过宿主原生目录 picker 选择、空闲停止时间就地编辑、导出/导入在同一页完成且都需显式授权；这些属于运行时设置，修改后无需重启 DSH（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- 新增分页 Channel 时间线：连续消息合并为气泡组；仅 Bot 消息展示头像，用户消息不显示头像，每组仅展示一次发送人和时间；提供复制、定位右键操作，向上加载历史时保持阅读位置，可跳转到新消息，并在再次打开时定位至上次实际读到的已提交消息附近（[#143](https://github.com/BotHarness/BotHarness/issues/143)、[ADR-0061](docs/adr/0061-channel-timeline-uses-opaque-cursors.md)）。
- 新增可选的 Computer 插件：在本地 Docker 中运行 profile 级共享的 Linux 桌面，以带 DSH 会话鉴权的 VNC 面板呈现在 Web Client 中；启动与停止都需显式授权，拉取镜像时展示实时进度，空闲自动停止，并支持把 Computer 的持久存储导出/导入为单个归档文件；PersonaBot 绑定与基于 Settings 的目录选择器仍是后续切片（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- 新增 Channel sidebar shell：Bot mode 右侧区域按统一注册 seam 渲染有序、可折叠的 entries（group 成员、DM 事项）（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增第一颗可由 Human 验收的 PersonaBot Assignment tracer bullet：PersonaBot 可通过 durable Bot Inbox 接收 DM，运行 Orchestrator 与独立 Assignment Session，由 Orchestrator 显式把 Assignment 结果发送回同一 Channel，并提供 Assignment 列表/详情视图；默认 Memory 与 Workspace Grant 行为仍是 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的后续工作。
- 新增持久化的 BotHarness 动效偏好，提供跟随系统、减少动效与完整动效三种模式，并通过可访问的实时预览和唯一 effective policy 供 Client surfaces 共同消费（[#128](https://github.com/BotHarness/BotHarness/issues/128)）。
- 将 DM 与 group Channel composer 重构为响应式 floating island，支持多行输入，并提供可访问、仅消费投影的 PersonaBot activity region（[#129](https://github.com/BotHarness/BotHarness/issues/129)）。
- 为独立的 DeepSeekBot 与 DSH Skill release train 新增确定性、只读的 GitHub Release draft 准备流程（[指南](docs/agents/changelog.md#preparing-a-github-release-draft)、[#103](https://github.com/BotHarness/BotHarness/issues/103)）。
- 新增 Computer 导出与迁移指南，覆盖跨机器单文件迁移、必须随迁移保留的文件所遵循的持久 `~/workspace` 约定，以及体积/耗时预期（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- 侧栏 **+** 菜单新增 Bot 市场：贴入带 `botharness-bot` 话题的公开 GitHub 仓库即可收录，可浏览已收录的 Bot，并在显示最新提交与第三方风险提示的确认后安装为新的 PersonaBot（[#916](https://github.com/BotHarness/BotHarness/issues/916)，[ADR-0131](docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)）。
- 给仓库加上 `botharness-bot` 话题后，无需贴链接，下一次每日定时发现就会把它收录进 Bot 市场；已收录条目每小时刷新，移除话题、归档、删除或改为私有会隐藏条目，仓库改名或转移仍保留同一条目（[#917](https://github.com/BotHarness/BotHarness/issues/917)）。
- Bot 市场支持按最近更新或 Star 数排序，可按相关度搜索名称、描述、话题和 README（支持中文），并可点话题标签筛选（[#918](https://github.com/BotHarness/BotHarness/issues/918)）。
- 在 Bot 市场点开条目会显示详情：README 按 GitHub 的样子渲染（相对路径的图片和链接按收录时的提交解析，脚本、事件属性和不安全链接会被移除），并显示 Star、更新时间、话题、GitHub 链接和安装按钮（[#919](https://github.com/BotHarness/BotHarness/issues/919)）。
- Bot 作者可以在仓库提交 `.botharness/bot.json`，共享显示名称、角色标签和头像（生成头像配方，或仓库里的 PNG、JPEG、WebP 图片）；Bot 市场会显示该名称和标签，安装时从克隆下来的仓库应用头像。无效的描述文件会被忽略（[#920](https://github.com/BotHarness/BotHarness/issues/920)）。
- 在 Bot 市场贴入仓库或举报 Bot 时，会先在本机完成一次自托管的工作量证明验证（ALTCHA，不依赖第三方验证码），近期请求越多验证越慢，并按来源和仓库限流。每个条目都有**举报**按钮，可选填理由；足够多不同来源的举报会先把条目隐藏，等管理员复核恢复，被屏蔽的仓库不会再进入市场。原始 IP 地址不会被保存（[#921](https://github.com/BotHarness/BotHarness/issues/921)）。
- Bot 市场 Worker 提供有文档、带版本号的公开只读 API（`/v1/bots`、`/v1/bots/{id}`、`/v1/topics`）供产品官网使用，CORS 只放行 deepseekbot.botharness.ai 和它的本地开发地址，成功响应公开缓存一分钟（[#922](https://github.com/BotHarness/BotHarness/issues/922)）。

### Changed

- Channel 顶部 Profile 入口与底部活动区头像不再重复显示提醒徽标和活动点阵；左侧 sidebar 标记与活动详情仍保留（[#928](https://github.com/BotHarness/BotHarness/issues/928)）。

- DeepSeekBot 以正式版本发布在 npm `latest` 标签，`next` 同步指向它；可用 `dsh plugin --profile web add deepseekbot` 安装，或在桌面端「添加插件」里输入 `deepseekbot`（[#895](https://github.com/BotHarness/BotHarness/pull/895)、[发布指南](docs/npm-prerelease.md)）。

- Channel 分组、置顶、隐藏与顶层排列经一次性校验导入后保存在 Profile 数据库，重启不再依赖保留的旧 roster domain；原生排序与各 Client 的折叠状态保持既有归属（[#885](https://github.com/BotHarness/BotHarness/issues/885)）。

- PersonaBot 的身份、保存的外观、暂停／访问开关与独立模型配置现在由 Profile 数据库持久保存；旧 `bot.json` 经校验一次性迁入并保留，运行时不再回退读取，Soul 仍保持 Git 文件形式（[#884](https://github.com/BotHarness/BotHarness/issues/884)）。

- 可复用 Model Preset 现由 Profile 数据库持久化；一次性校验迁入旧模板，保留 ID、revision 及 Bot 已应用方案的独立性，旧模板文件保留供恢复参考，切换后不再读写 ([#883](https://github.com/BotHarness/BotHarness/issues/883))。

- 大量头像同时活动时更流畅：所有过渡共用一个动画帧循环，像素风格的工具切换按像素画帧率步进并合并同色像素（`@botharness/pixel-morph` 0.2.0），滚出视野的头像在状态更新后不再做过渡计算；实测 32 到 128 个混合风格的活动头像仍保持满帧（[#757](https://github.com/BotHarness/BotHarness/issues/757)）。

- 产品 IM Provider 采用独立固定的资格验证输入，并为已验收的 Slack 能力递增自身版本，避免开发版选择隐式改变产品产物（[IM 安装指南](docs/product-im-installation.md)、[#868](https://github.com/BotHarness/BotHarness/issues/868)）。

- Bot Inbox 侧栏以内容为先，分行展示来源、Report 信息与处理状态，并用原生错误色突出需要修复的项 ([#851](https://github.com/BotHarness/BotHarness/issues/851))。

- Channel sidebar 显示设置改用悬停二级菜单，连续选择时保持打开并临时只展开对应项供预览；关闭菜单恢复原先展开状态，显示偏好立即保存（[#807](https://github.com/BotHarness/BotHarness/issues/807)）。

- Channel 连续消息气泡保持紧凑，作者旁只显示一次悬浮／聚焦时间，复制与回复在每条消息的送达圈旁显示，不再预留操作行 ([#803](https://github.com/BotHarness/BotHarness/issues/803))。

- 外部附近上下文覆盖前后五分钟窗口，并为稀疏侧补齐可配置的前后消息保底条数；有界续页游标延长至 30 分钟（[#793](https://github.com/BotHarness/BotHarness/issues/793)）。

- 频道连接器授权设置更紧凑，以带背景的主要／危险按钮区分操作，说明可通过悬停、点击或键盘查看（[#780](https://github.com/BotHarness/BotHarness/issues/780)）。

- Container Browser 与 Docker Computer 复用同一套预览、全屏及明确开启交互组件；Browser 确认 Host 暂停后才开启输入，收起全屏仍保持暂停（[#736](https://github.com/BotHarness/BotHarness/issues/736)）。

- Human Inbox 改用 DSH 原生筛选菜单和带内边距的紧凑列表：点击整行打开详情，用主色按钮处理请求，通过头像与右上角箭头准确跳转来源；浏览器拒绝保存设置时，活动中心仍保留本窗口当前标签（[#687](https://github.com/BotHarness/BotHarness/issues/687)）。

- PersonaBot 提醒策略改为紧凑表格，便于对比九类来源规则；保留近期唤醒次数与行内编辑入口，审计记录收进详情弹窗（[#670](https://github.com/BotHarness/BotHarness/issues/670)）。

- Browser Profile 改为可搜索的 combobox：选择已有名称或明确创建新名称；错误使用 destructive 主题颜色，Browser view 移除多余说明与重复页标题（[#611](https://github.com/BotHarness/BotHarness/issues/611)）。

- `channel_send` 现在用 JSON 确认已提交的 Channel 与消息 ID，明确复制读取到的完整可信附件引用进行转发，并公开既有的 10 个附件／20 个提及上限及安全整数字节大小（[#570](https://github.com/BotHarness/BotHarness/issues/570)）。

- 联系人发现现在可搜索名称及完整简介，返回有界续页和按需详情，保留稳定同事 ID 以发送真实 Bot 私信及进行群协作（[#568](https://github.com/BotHarness/BotHarness/issues/568)）。

- Attention Tools 现在明确列出 Assignment 报告与普通群消息的完整参数组合，digest 参数使用整数 schema，并在非群 digest 模式下明确拒绝这些参数且不改变策略修订；Human 覆盖与后续 Inbox 快照继续共用同一权威（[#567](https://github.com/BotHarness/BotHarness/issues/567)）。

- Channel 读取现在返回有界的可行动内容并明确提供继续读取路径，保留回复、可信附件和行动引用；未返回或仅读取部分内容的消息仍在 Bot Inbox 中保持待处理（[#565](https://github.com/BotHarness/BotHarness/issues/565)）。

- 入群邀请默认由 Host 自动接受，无需唤醒受邀 PersonaBot；Human 可在 Bot 设置中关闭自动接受，保留 Bot 自行决定的流程，已解决的邀请在重投或重启后不会再次唤醒（[#371](https://github.com/BotHarness/BotHarness/issues/371)、[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)）。
- Channel 发现与历史查询工具现在枚举支持的过滤值，并说明跨已加入 Channel 搜索、作者、日期及既有页大小行为；精确查找无可访问匹配时会明确提示，不泄露隐藏 Channel（[#564](https://github.com/BotHarness/BotHarness/issues/564)）。

- Group 入群申请和决定工具现在仅返回简短的 Channel、申请及申请者引用和实际状态；仍须批准后才能访问群，不再把完整群记录或内部身份时间戳复制进模型上下文（[#563](https://github.com/BotHarness/BotHarness/issues/563)）。

- Group 创建与邀请工具现在仅返回简短的 Channel、邀请及目标 Bot 引用和实际决定状态；接受或拒绝时不再把完整群记录复制进模型上下文，拒绝仍不授予群访问权限（[#562](https://github.com/BotHarness/BotHarness/issues/562)）。

- Group 改名与移除成员工具现在仅确认已提交的 Channel、群名、结果和受影响的 Bot，不再把头像或无关群状态复制进模型上下文；改名持久化意外未返回记录时会明确失败（[#561](https://github.com/BotHarness/BotHarness/issues/561)）。

- Browser Pause 现在明确说明 Human 始终可以直接操作本地浏览器窗口；暂停后的工具拒绝提示先「继续」再重新观察，暂停期间仍可读取页面（[#495](https://github.com/BotHarness/BotHarness/issues/495)）。

- 并入 steer 或 harvest 的待处理上下文现在按**总字符预算**、以到达顺序（最旧优先，不再按每轮抽样条数）选取：短消息突发（例如直播间评论）会在预算内尽可能多地并入，而不是最多 20 条；超出预算的消息保持 pending 留待后续回合（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Human 私聊消息现在默认在下一个安全 step 注入正在运行的 Orchestrator 回合（steer），并且该私聊里仍在待处理的消息会一并纳入同一次注入（对齐群聊直接提及的上下文收割）；Bot 私聊消息同样如此。没有活动回合时行为不变（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Windows 隔离 DSH 开发实例现可一次性安全导入 WSL 中已有的 DeepSeek 开发密钥，让两个环境的真实模型验收共用同一份本机凭据（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[AX 指南](docs/client-bridge.md)）。
- Computer entry 的 Access 开关移入可折叠标题栏；与 Browser entry 一样，开关关闭时该区块无法展开（[#493](https://github.com/BotHarness/BotHarness/issues/493)）。
- Browser entry 的 Browser Access 开关现在位于可折叠标题栏中，开关关闭时无法展开；正文改为干净的标签列表，配一个默认跟随 Bot 的焦点预览（关闭跟随后点击列表项即可切换预览）；Bot 标签以后台标签开在共享 Bot Browser 里，不再弹新窗口、不抢焦点。原「接管」改为 **暂停 Bot**——只让该 Bot 停手，不暗示你需要授权才能操作窗口（[#490](https://github.com/BotHarness/BotHarness/issues/490)、[#492](https://github.com/BotHarness/BotHarness/issues/492)、[#496](https://github.com/BotHarness/BotHarness/issues/496)、[ADR-0095](docs/adr/0095-bot-tabs-are-background-tabs-on-the-shared-bot-browser.md)）。
- 记忆文件阅读区采用与正文区分底色的通栏标题栏，以及简洁的返回和刷新图标；提交及工作区差异以可折叠的文件卡片显示新旧行号、增删行数和与 Git 图一致的状态标识。历史节点的分支按钮明确说明会新建并切换分支（[#441](https://github.com/BotHarness/BotHarness/issues/441)、[#512](https://github.com/BotHarness/BotHarness/issues/512)）。
- BotHarness 现在以 SemVer 范围（`>=0.2.0-rc.1 <0.3.0-0`）声明 DSH 兼容性，以已验证的宿主行为下限，取代精确锁定；运行时行为不变（[ADR-0087](docs/adr/0087-dsh-compatibility-is-a-semver-range-with-a-verified-floor.md)、[#423](https://github.com/BotHarness/BotHarness/issues/423)）。

- BotHarness 现以 DSH 0.2.0 RC1 为目标：工作区依赖与 `engines.dsh` 从 0.1.7 RC2 迁移到新 RC，隔离开发 Profile 需按新 RC 重建（[#419](https://github.com/BotHarness/BotHarness/issues/419)）。

- 未置顶的 Group 与 PersonaBot 私聊 Channel 现在统一以头像、名称和最新消息预览组成会话列表行；空 Channel 显示简短占位文案。取消置顶的拖放提示增加了留白，活动中的 Bot 头像保留状态圆点且不再显示外框（[#404](https://github.com/BotHarness/BotHarness/issues/404)）。

- 新的隔离开发 Profile 默认组合可选 Bundle `@botharness/computer`，无需手工改 Profile 即可看到 Computer 的侧栏入口与观看面板（[#383](https://github.com/BotHarness/BotHarness/issues/383)）。
- Group Channel 的每条消息气泡旁现显示紧凑的实心收件状态饼图；打开后可按名字和头像查看实际收件 Bot 的已投递、已读、处理中、已处理、已忽略或失败状态。主动读取频道历史不等于已处理；消息进入 Orchestrator 回合时才算处理中，Bot 发送者不计入自己的收件人数（[#345](https://github.com/BotHarness/BotHarness/issues/345)）。
- DM 与 Group 的消息气泡在悬停或键盘聚焦时，于气泡下方显示该条消息的时间、回复和复制；触屏设备保持操作可见（[#345](https://github.com/BotHarness/BotHarness/issues/345)）。
- 复制私聊或群聊消息成功后，该消息的复制图标会短暂变为对勾；剪贴板写入失败时仍显示复制图标（[#376](https://github.com/BotHarness/BotHarness/issues/376)）。
- PersonaBot 私聊右侧栏现在按原生 DSH 标题、工作区及运行状态展示归属该 Bot 的 Orchestrator 与 Assignment Session；标题菜单可切换「当前／全部」与「平铺／按工作区」，每个 Bot 在本浏览器分别记住这些选择及分组折叠状态，点击行打开原生 Session。归属该 Bot 的根 Session 在空闲的原生侧栏标题前显示 Bot 头像，并可通过标题栏及原生会话菜单返回其私聊（[#312](https://github.com/BotHarness/BotHarness/issues/312)、[ADR-0072](docs/adr/0072-personabot-sidebar-projects-owned-dsh-sessions.md)）。
- 浏览器会记住上次停留在 Bot 模式还是原生 DSH 界面。刷新 Bot 界面时恢复之前打开的 Channel；切回 DSH 后，下次访问也保持 DSH（[#340](https://github.com/BotHarness/BotHarness/issues/340)）。

- Group Channel 的 @PersonaBot 与 Bot 间私聊提示现允许 Bot 在无需回应时直接结束；「已处理」仍表示回合完成，不表示已发出确认消息（[#302](https://github.com/BotHarness/BotHarness/issues/302)）。

- 本地 Desktop 的 Client 改动现在可经 DSH Client HMR 更新已打开的 PersonaBot 私聊；未发布的 UI Bundle 改名为 `@botharness/ui`，使 RC2 能正确解析插件图（[#272](https://github.com/BotHarness/BotHarness/issues/272)、[ADR-0066](docs/adr/0066-rc2-client-bundle-identity.md)）。HMR 后整页刷新仍可能触发 RC2 Web 启动失败；请按[开发指南](docs/client-bridge.md)重启应用及 Host。
- PersonaBot 私聊顶部现在稳定显示 Bot 名称，即使 Channel 记录中的名称是 ID；右侧 Channel 栏不再重复显示该标题（[#263](https://github.com/BotHarness/BotHarness/issues/263)）。
- BotHarness 本地开发现支持 DSH 0.1.7 RC2 Web Profile：Client 改动可自动刷新，Host 改动有明确的重启步骤（[#265](https://github.com/BotHarness/BotHarness/issues/265)）。

- Channel 的 Bot 消息气泡改用原先 Human 的灰色底；Human 气泡则使用 DSH 主题的反色中性色，浅色主题近黑、深色主题近白，文字、引用摘要和文件附件在两种主题下均保持可读（[#255](https://github.com/BotHarness/BotHarness/issues/255)）。
- 运行日志有了持久家：profile 旁的轻量 `logs.db`（版本化 schema、最坏重建空库、5 万行 + 30 天懒清理、按 owner 域读），Computer 诊断 ring 现会写入它，排障可跨重启（[#240](https://github.com/BotHarness/BotHarness/issues/240)、[ADR-0063](docs/adr/0063-operational-log-database.md)）。
- Computer viewer 现在会把生命周期（挂载、画面阶段、重连、重试）自述进开发者诊断日志，之后排障可直接回放卡片行为，无需浏览器（[#234](https://github.com/BotHarness/BotHarness/issues/234)）。
- Web 部署下 Computer 导出/导入改走浏览器：导出完成后**下载**按钮经保存对话框取回（流式），**选择归档文件…**把本地 `.tar` 流式上传导入——无需输入宿主路径，单次传输 token，流式上传需要 Chromium 系浏览器时会明确提示（[#212](https://github.com/BotHarness/BotHarness/issues/212)）。
- Computer 支持专业 Linux 部署的 opt-in `dataDir`：持久存储 bind mount 到配置目录而不再用命名卷；授权页显示解析后的存储位置与 SQLite 共享文件系统风险说明；非 Linux 上该配置会被忽略并给出可见原因；修改它会重建已停止的容器，运行中的容器不受影响并给出迁移提示——旧数据保留原处，需手工迁移（[#155](https://github.com/BotHarness/BotHarness/issues/155)）。
- 启动 Computer 现在会等桌面 Web 端口真正响应（上限约 90 秒）才报告 running，viewer 不再挂进还没 READY 的端口看黑屏 connecting；等待期间 entry 与设置行实时显示 starting 阶段，90 秒无响应则明确报错、可重试，而不是悄悄建成一个坏的 running 态（[#223](https://github.com/BotHarness/BotHarness/issues/223)）。
- Computer viewer 现在与 Selkies 自身会话状态同步，不再只看 canvas 尺寸：live 需要有尺寸、像素在变、`#status-display` 无 connecting/reconnecting——真静态桌面在短暂宽限后仍会转 live，卡死的流会老化进入可重试空态——打开 viewer 不会在 Selkies 还在建连时就报已连接。建连协商有独立耐心预算（不再 5 秒就判空）、丢流持续几次才重挂、从未 live 的文档有界自救，全新启动无需手点重试即可恢复（[#221](https://github.com/BotHarness/BotHarness/issues/221)）。
- Computer 侧栏的运行态卡片现在采用 AgentScreen 式呈现：按画面比例取景的静止卡，悬停浮现蓝色 **打开** pill；点击进入全屏 viewer——标题栏含 Bot 名、实时状态、停止与收起（只能点收起按钮返回，页面滚动锁定），同一个 iframe 只在卡片与全屏之间切换几何，打开不再重建流连接。进入时先显示连接中，持续无画面则给出带重试的明确空态；开启视图不再显示裸 exit code（如 `exited code=137`），只保留共享说明；所有颜色读取 DSH design tokens 或 primitives，浅色/深色主题下均正确渲染（[#167](https://github.com/BotHarness/BotHarness/issues/167)）。
- Computer 导出现在会在打包前优雅关闭浏览器（上限约 10 秒，超时回退为普通停止），且每次启动都会播种持久的 `~/workspace` 目录，因此迁移后的配置以已落盘的登录态与标签页打开，Bot 的工作文件也随归档一起走（[#154](https://github.com/BotHarness/BotHarness/issues/154)、[ADR-0062](docs/adr/0062-computer-volume-quiesce-and-workspace.md)）。
- 导出/导入期间，Computer 设置行与侧栏卡片会实时显示阶段与已用时，不再只有笼统的忙碌文案（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Computer 的设置行——导出目录、空闲停止、导出 / 导入——现在统一归入 BotHarness 设置页上自己的 **Computer** 分组标题下（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Channel 顶部标题改为悬浮在消息渐隐层之上的可点击名称安全岛，点击可打开右侧 Channel sidebar；右侧栏顶部也不再绘制分隔线（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- Bot 图标选择改为「所见即所得」的卡片网格：每张卡片直接展示图标外观，选中的卡片以边框强调，不再用只显示名字的 selector（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 文案全面跟随 DSH 语言，不再只有设置页：名册、分组管理、创建 PersonaBot、Channel sidebar entries、输入框与活动状态在英文界面下都显示英文（[#184](https://github.com/BotHarness/BotHarness/issues/184)）。

- 应用侧边栏的 Bot 模式切换按钮更高、图标与文字更大：再次点击整行会退出 Bot 模式，hover 时右侧出现设置齿轮，点击直接打开设置对话框的 Bot 分区（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- BotHarness 有了自己的 Bot 图标：应用侧边栏的「BOT 模式」入口与 Bot 设置分区的导航项默认显示 DeepSeekBot 吉祥物（含亮/暗两套图），新增的「Bot 图标」行可在吉祥物、简约版、生成形象与通用机器人图标之间切换（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 的偏好设置移入设置对话框中专属的 Bot 分区——界面动效与 BOT 列表排序两行从原生「通用设置」移出，Computer 的设置、导出/导入与资源上限随后也会落在这里（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- Computer 改为拉取上游 webtop 镜像（XFCE + Chromium），不再使用 BotHarness 自建的 Chrome 镜像，并以显式资源上限运行——默认 2 核 2 GiB 内存、swap 与上限相同、512 MB 共享内存、4096 进程，空闲 30 分钟自动停止，且都可按 Host 覆盖：镜像缩小约 470 MB，静置内存从约 2.4 GiB 降至约 1.15 GiB（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- Computer 桌面改用适合观看的面板尺寸——更高的顶栏与更大的图标、更高的底部 dock；仅在默认配置上播种，人手工调过的面板不会被覆盖（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- PersonaBot Agent 现在会加入 agent preset（默认 `standard`），Orchestrator 因此可通过 Memory 范围内的文件工具直接持久化记忆；不透明的原生工具经 Workspace Grant 边界请求 Human 一次性批准；Orchestrator 自行记录记忆、只把独立工作委托给 Assignment，而 Assignment 把值得记忆的内容回报给 Orchestrator，不写仓库（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Orchestrator 现在不必等待 Assignment 结束：`create_assignment` 立即返回 Session id；continuity key 会复用空闲的 Assignment 而不是再建一个；Assignment 的报告与提问通过 Bot Inbox 到达，答复会恢复正在等待的 Assignment（[ADR-0059](docs/adr/0059-assignment-collaboration-round-trips-through-the-bot-inbox.md)、[#180](https://github.com/BotHarness/BotHarness/issues/180)）。

- 创建 PersonaBot 现在会创建真实的 Git-backed Memory Repository，Orchestrator Session 直接在其中运行；重新打开仓库时不会把未提交的工作树改动自动提交（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- 移除模型可见的 `memory_read`、`memory_search`、`memory_write`、`memory_list` tools；V1 对 DSH 原生文件工具执行 Grant 校验；Shell 等不透明调用在可用时需要 Human 对当前调用批准（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Session 在首次组装系统提示时会冻结其 persona：Human 对 `PERSONA.md` 的修改对新 Session 生效，运行中的 Session 保持原有的提示前缀（[ADR-0060](docs/adr/0060-system-prompt-prefix-is-append-only.md)、[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- PersonaBot DM 与 group Channel 现在可从所有 roster navigation surface 中隐藏，并可通过可搜索的“更多 → 隐藏的频道”Modal 恢复；隐藏不会改变 pin、section、order、消息、PersonaBot 或 Memory 状态（[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- Channel 与 section 的右键菜单现在提供和拖拽一致的整理能力：section 可上移、下移、重命名或安全移除；任意 group Channel 与 PersonaBot DM Channel 均可置顶/取消置顶、移动到现有或新建 section、重命名或隐藏。重命名 DM 会同步 PersonaBot 显示名，但稳定内部标识保持不变；真正删除 Channel/PersonaBot 的语义继续由 [#138](https://github.com/BotHarness/BotHarness/issues/138) 解决（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- group Channel 与 PersonaBot DM 现在都可通过右键菜单或拖拽置顶。空置顶区在静止时隐藏，仅在 Channel 开始拖拽后带 transition 展开；拖动置顶卡片会显示独立的虚线目标，只有放入该区域才会取消置顶并回到原位，拖到具体 Channel、section 或 section 间隙则取消置顶并保存预测线位置，普通列表空白处不再接受 drop。旧版 PersonaBot slug pin 也会迁移为 Channel ID（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- BOT mode 侧栏折叠后，现在会把所有已排序 Channel 投影到 36px rail：置顶 Channel 位于分隔线上方，普通 Channel 按与展开侧栏一致的 section/未分组扁平顺序继续排列；PersonaBot DM 保留头像，group Channel 使用 hash glyph，原生 hover card 显示身份信息与最新消息摘要（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

- Session 列表与 PersonaBot activity 改为通过显式、持久的 Session ownership 解析（含 fork 与 Subagent lineage），不再依赖 cwd 或 workspace 成员关系（[#80](https://github.com/BotHarness/BotHarness/issues/80)）。
- section header 现在可直接在该 section 内创建 group Channel 或 PersonaBot DM；新建 section、未分组 Channel 与 section 成员均默认出现在所属 scope 的第一位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

### Fixed

- 已打开的 Profile 身份和频道连接器表会在身份／授权变化及接收连接成功或失败后自动刷新，无需手动刷新（[#855](https://github.com/BotHarness/BotHarness/issues/855)）。

- Host 重启后，原先正在执行的 Assignment 会向所属 PersonaBot 发送一条安全恢复通知，保留原报告、不自动重跑 Assignment；已处理通知在后续重启不重复生成（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。

- Assignment 原生执行错误现在会向所属 PersonaBot 发送一条安全 Host 通知并释放 Continuity Key，保留原始进度报告，不自动重试或在重启后重放（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。

- Human 取消正在运行的 Assignment 后，Bot Inbox 会收到一条 Host 来源通知，保留原报告与原生 Turn 引用且不自动重跑；已处理事实在重启后保留（[#194](https://github.com/BotHarness/BotHarness/issues/194)，[ADR-0045](docs/adr/0045-orchestrator-manages-assignments-through-a-durable-directory.md)）。

- 修复 Slack 频道连接器与成员提醒误显示 Lark 专属文案或默认值 ([#845](https://github.com/BotHarness/BotHarness/issues/845)).

- Assignment 答复在原生 Inbox 接收后才清除原问题；可证的投递准备失败保留重试入口，结果不明仍显示待修复，旧答复不会清除新问题（[#812](https://github.com/BotHarness/BotHarness/issues/812)）。

- Human 收件箱操作按钮与条目统一展开双列详情；标题独占首行，摘要与操作放在第二行，紧凑入口弹窗加宽（[#812](https://github.com/BotHarness/BotHarness/issues/812)）。

- 空闲 Assignment 的继续执行和按 key 复用现在遵守与新建工作相同的 Profile 并发上限，容量满时保留尚未答复的问题 ([#811](https://github.com/BotHarness/BotHarness/issues/811))。
- Channel sidebar 编辑时不显示展开箭头，整行可拖动；拖动时即时预览草稿顺序并显示清晰插入线，标签区域可接收落点，取消拖拽恢复拖动前的草稿（[#808](https://github.com/BotHarness/BotHarness/issues/808)）。

- 修复 Container Computer 全新 home 存储首次启动时的面板尺寸，保留已有自定义偏好，并使用实际配置的存储（[#797](https://github.com/BotHarness/BotHarness/issues/797)）。

- 修复 Browser Stop 与空闲关闭的授权撤销：先撤销受影响 Session 的权限，再清理资源，待审批的旧请求无法重启已停止的 profile；清理失败时保留可见的停止重试入口，后续空闲清理仍可重试（[#768](https://github.com/BotHarness/BotHarness/issues/768)）。

- 更新完整 IM fork 的固定资格版本：释放收件 Consumer 或替换 Provider 后，拒绝返回正在读取的群／话题上下文；保留附件、回显与独立回复身份能力，无需等待上游合并（[#789](https://github.com/BotHarness/BotHarness/issues/789)）。

- PersonaBot 并发工具 Activity 现在先排序不透明详情引用再限制数量，使同一活跃集合不受事件到达顺序影响（[#123](https://github.com/BotHarness/BotHarness/issues/123)）。

- Group Profile 的成员消息活跃使用外部平台与来源群名称，同一来源的发送人合并统计，不同来源分别显示（[#769](https://github.com/BotHarness/BotHarness/issues/769)）。

- 折叠应用侧栏 Rail 中的 PersonaBot 数字头像徽标完整显示，首行与置顶频道不再被裁切，同时保持原生侧栏滚动行为（[#744](https://github.com/BotHarness/BotHarness/issues/744)）。

- macOS Local Computer 在 driver 空闲过期后可继续取得新的观察，旧 snapshot 和 element token 仍保持失效（[#713](https://github.com/BotHarness/BotHarness/issues/713)）。

- Computer Audit 将 driver 返回的工具失败正确记为错误，截图或窗口请求被拒绝时不再显示成功，且不记录观察内容（[#708](https://github.com/BotHarness/BotHarness/issues/708)）。

- Inbox 的来源头像始终位于操作行最右侧；修复项的 Bot Inbox 维护入口移入详情，不再额外占用列表按钮 ([#687](https://github.com/BotHarness/BotHarness/issues/687)).

- Inbox 详情改为通过贴合消息上下沿的控件分别加载历史／较新内容，悬停或聚焦消息即可精确跳转来源；“移除”会持久隐藏该项，但不回答或授权原请求（[#687](https://github.com/BotHarness/BotHarness/issues/687)）。

- Inbox 列表的“选择工作区”现在直接打开同一个 DSH 文件夹选择器，不展开事件详情；其他回应操作使用独立弹窗，取消后仍可再次打开，已解决的请求不会误触发授权（[#687](https://github.com/BotHarness/BotHarness/issues/687)）。

- Computer 设置可正确调用原生目录选择器，授权导出后保存目标目录供后续导入使用；选择器不可用时仍可手动输入路径（[#166](https://github.com/BotHarness/BotHarness/issues/166)）。

- 活动实时传输失败时，通过限频快照查询恢复 Bot 状态；重连与修订跳号同步恢复侧栏及输入框，连接错误不会显示成 Bot 活动状态（[#121](https://github.com/BotHarness/BotHarness/issues/121)）。

- 修复新 DM 或群提及并入活动回合时，Memory 编辑被静默并入基线而漏掉通知的问题；有界变更摘要现在进入该回合的 Bot Inbox，并随回合结果处理（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。

- Browser entry 开启 Access 后自动展开，以标题和 URL 置顶 Bot 当前标签；关闭跟随后固定预览标签，不改变 Bot 的工作页（[#492](https://github.com/BotHarness/BotHarness/issues/492)）。

- Browser 文件上传使用实际打开选择框的附件字段，省略 ref 时使用第一个文件字段；上传审计记录文件名与大小，失败时隐藏 Host 完整路径（[#491](https://github.com/BotHarness/BotHarness/issues/491)）。

- PersonaBot Orchestrator 可通过既有提醒工具设置和恢复 Human 私聊、Bot 私聊及群内提及的投递方式；即时接收不变，Profile 可查看带 Bot 操作者的修订 ([#528](https://github.com/BotHarness/BotHarness/issues/528)).

- 修复多个 PersonaBot 首次并行使用共享 Browser profile 时的重复启动：并发请求会等待同一次 Chrome 启动，失败后可重新尝试（[#463](https://github.com/BotHarness/BotHarness/issues/463)）。

- 修复 Human 关闭 Bot Browser 标签后的恢复：CDP Session 已失效时会清除已关闭的当前标签，并提示选择或打开另一个自有标签（[#463](https://github.com/BotHarness/BotHarness/issues/463)）。

- PersonaBot Profile 现在可正确保存 Human 私聊、Bot 私聊和群内提及的投递设置；切换并入活动回合或排为独立回合会生效，并在重启后保留（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。

- 后台 Bot Browser 标签页现在会在原生鼠标和键盘输入前准备焦点，无需唤起 Human 前台窗口；搜索可在任何截图或滚动之前打开第一条结果（[#462](https://github.com/BotHarness/BotHarness/issues/462)）。

- Browser 动作与导航遇到页面持续 15 秒未就绪时，现在返回可读超时错误，并要求 Bot 先观察，再决定是否重试可能已经发生的动作（[#462](https://github.com/BotHarness/BotHarness/issues/462)）。

- 阅读较早消息时发送 DM 会保留阅读位置；跟随最新对话时，Bot 活动提示展开后新消息仍完整可见（[#120](https://github.com/BotHarness/BotHarness/issues/120)）。

- Human 暂停前已开始的 Browser 截图，会在生成或原生附件处理期间控制状态改变时被拒绝，避免未完成图片在接管后返回模型（[#461](https://github.com/BotHarness/BotHarness/issues/461)）。

- 关闭 Browser Access 会取消正在等待的调用，并拒绝已撤销注册的未完成或排队调用；重新开启权限也不会恢复旧调用，已有 Bot Browser 标签页仍保留给 Human 使用（[#460](https://github.com/BotHarness/BotHarness/issues/460)）。

- DM 活动现在根据真实 Host Session 投影同步更新侧栏与输入框；活动 Turn 显示思考或工作并在结束后恢复空闲，消息回执继续独立显示处理结果（[#536](https://github.com/BotHarness/BotHarness/issues/536)、[#120](https://github.com/BotHarness/BotHarness/issues/120)）。
- Browser 上传现在会使用观察到的文件输入框 ref，将文件放入指定字段，避免多输入框页面误传到其他字段，让目标表单可以继续完成（[#652](https://github.com/BotHarness/BotHarness/issues/652)）。

- 群聊退出现在明确返回已提交变更或 `not-member` 幂等无变更；缺失 Channel 和非群聊目标明确失败，重复或被拒绝的请求不再被描述为一次新退出（[#571](https://github.com/BotHarness/BotHarness/issues/571)）。

- Browser 滚动改为在视口中心发送原生滚轮事件，Bot 可以滚动中心位置的独立内容区或普通页面，并观察结果后继续操作（[#647](https://github.com/BotHarness/BotHarness/issues/647)）。

- Browser 输入会在改变值、焦点或事件前拒绝只读与禁用的 input、textarea，包括原生 fieldset 禁用继承；Bot 保留当前标签页并可继续填写可编辑字段（[#644](https://github.com/BotHarness/BotHarness/issues/644)）。

- Browser 按键现在可以执行原生焦点切换、文本编辑和表单提交；不支持的按键会返回可重试的错误，而不是报告成功 ([#640](https://github.com/BotHarness/BotHarness/issues/640)).

- Browser 导航失败现在返回可重试的 Tool 错误并记录错误 Audit；新建失败的标签页会清理，已有当前标签页仍可观察并重试 ([#627](https://github.com/BotHarness/BotHarness/issues/627)).

- 修复 Session 历史缺失时模型 token 统计被清空的问题：重启与校准保留日汇总，持久去重防止重复回放，归档保留用量，彻底 Purge PersonaBot 清理其统计（[#502](https://github.com/BotHarness/BotHarness/issues/502)）。旧汇总作为保留基线迁移；无法确认是否已计入的升级前调用不会单独补计。
- Bot 选择已被 Human 关闭的 Browser 标签页时，会保留另一当前工作页及其预览，并移除失效标签页、提示恢复方式；临时查询失败不会改变当前选择 ([#623](https://github.com/BotHarness/BotHarness/issues/623)).

- Human 点击 Resume 后，Browser 页面操作必须先完成一次新的观察；Pause 期间或 Pause/Resume 切换前的读取不能让 Bot 继续操作 Human 已修改的内容（[#600](https://github.com/BotHarness/BotHarness/issues/600)）。
- 被拒绝的 Browser 工具尝试现在也会生成一条带 Bot、Session 与角色归属的 Browser Audit 错误记录，覆盖授权、Access、Pause 与 Resume 后重新观察检查；输入文本和上传路径仍使用既有脱敏摘要（[#604](https://github.com/BotHarness/BotHarness/issues/604)）。
- Browser Profile 的保留名 `.` 和 `..` 会在保存或重置工作前被拒绝，保留当前标签与 Pause 状态；已存无效名称仍沿用 runtime 的默认 profile 回退（[#611](https://github.com/BotHarness/BotHarness/issues/611)）。

- 修改 PersonaBot 的 Browser Profile 后，会清空旧标签页选择与 Pause 状态，让 Bot 可以在新分配的 profile 中开始工作，不必恢复旧 profile 的操作（[#595](https://github.com/BotHarness/BotHarness/issues/595)）。

- 关闭再开启 Browser Access 后，PersonaBot 保留原有工作标签页与当前页；Access 关闭期间浏览器工具仍不可用（[#591](https://github.com/BotHarness/BotHarness/issues/591)）。

- 修复打开 Bot 浏览器：唤起归属此 Bot 的预览标签页并恢复最小化窗口，无存活工作页时创建并复用一个归属此 Bot 的空白页 ([#584](https://github.com/BotHarness/BotHarness/issues/584)).

- Browser 每次重新观察都会以独立的 ref 替换上一次标记，旧 ref 不再因页面变化而误点另一个控件；role-less 点击目标在重复观察时仍会出现，旧 ref 返回可读的重新观察提示（[#579](https://github.com/BotHarness/BotHarness/issues/579)）。

- PersonaBot 的旧模型选择仅在匹配唯一可用 provider 时迁移；有歧义或不可用的路由会停止新请求，并引导 Human 在 Profile 修复模型预设，不会自动切换 provider（[#500](https://github.com/BotHarness/BotHarness/issues/500)）。
- 排队的 Browser 动作在真正开始执行时重新检查 Browser Pause 和 Browser Access；Human 暂停或关闭权限会拦截已在队列等待的动作，暂停期间仍可观察页面（[#569](https://github.com/BotHarness/BotHarness/issues/569)）。

- 截图现在同时报告图片尺寸与视口，设备缩放不为 1（例如 Retina 的 2x）时坐标点击会给出精确换算；视口校验改为半开区间（[#538](https://github.com/BotHarness/BotHarness/issues/538)）。

- 浏览器观察现在能找到编辑器容器内的无角色工具栏控件，并为没有标签的控件生成带位置的名称（`div @x,y`）；视口外的坐标点击会以"重新截图"错误失败；截图会报告视口尺寸，坐标与图 1:1 对应（[#530](https://github.com/BotHarness/BotHarness/issues/530)）。
- Computer 查看器在连续三次采样丢失画面后会重挂流；自动重试最多三次，之后显示「暂无画面」与手动重连入口，手动重连可恢复实时桌面（[#456](https://github.com/BotHarness/BotHarness/issues/456)）。
- 可恢复的浏览器工具错误（例如页面尚未出现文件输入框）不再让 PersonaBot 丢失当前标签页并重开新标签；只有标签页真正关闭才会清空记账；`browser_upload` 在点击上传控件后会短暂等待页面创建文件输入框（[#523](https://github.com/BotHarness/BotHarness/issues/523)）。
- Human 打开 Bot Browser 后不会再出现"刚打开就自动关闭"：Browser entry 的打开、观看实时画面与接管都计为活动，空闲巡检只停止真正空闲的浏览器（[#486](https://github.com/BotHarness/BotHarness/issues/486)）。
- Bot Browser 启动时不再暴露自动化标记（`navigator.webdriver` 为 false），因此在 Google、X 等拒绝自动化浏览器的站点上，Human 可以正常登录（[#483](https://github.com/BotHarness/BotHarness/issues/483)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)）。
- PersonaBot 活跃度热力图的提示框现在会贴近悬停或键盘聚焦的日期格子，在宽屏资料页和紧凑卡片中都不再横向漂移（[#478](https://github.com/BotHarness/BotHarness/issues/478)）。
- Computer 查看器现可通过新版 Selkies 的 `/api/websockets` 端点连接桌面，同时保留旧路径；启动后不再一直停留在「连接中」（[#451](https://github.com/BotHarness/BotHarness/issues/451)）。
- Channel 输入框现在可将粘贴的图片和文件加入现有附件队列，以正方形缩略图展示图片并可打开原图灯箱，同时在发送前后将其他文件呈现为紧凑的文件类型 chip；添加媒体按钮与占位文字在浅色、深色主题下更容易辨认（[#433](https://github.com/BotHarness/BotHarness/issues/433)）。
- 切换 Channel 或打开 PersonaBot 私聊时，已展开的右侧 Channel sidebar 现在会保持原位；下一段对话加载期间，Channel 主区域不再左右跳动（[#430](https://github.com/BotHarness/BotHarness/issues/430)）。
- 已打开过的 Channel 现在会立即显示缓存的历史消息与侧栏内容，并在后台刷新；首次打开时，Channel 主区域、应用侧栏及 Channel 侧栏会显示骨架占位（[#434](https://github.com/BotHarness/BotHarness/issues/434)）。
- Channel 输入框现在按一次 Shift+Enter 就会显示完整空行；单行长文字达到换行临界宽度时，输入区也不再反复收缩、展开（[#393](https://github.com/BotHarness/BotHarness/issues/393)）。

- Bot 创建的群聊入群申请，以及 Human 同意或拒绝后的通知，现在会送达收件 Bot 的收件箱并完成 Orchestrator 回合，不再滞留于「需要修复」（[#367](https://github.com/BotHarness/BotHarness/issues/367)）。
- PersonaBot 归档期间发送的群消息仍保留在 Channel 历史中，但不会为该 Bot 新建 Inbox Admission 或唤醒；其他活跃成员继续独立收件（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- 撤销工作区授权后，PersonaBot 私聊里待处理的原生工具审批卡立即失效并收起操作按钮；授权列表不再等待其他侧栏资料；授权操作若等待超时，会提示并恢复操作入口，不能再批准已撤销权限下的调用。已经开始的调用可能完成，后续 Assignment 访问仍被阻止（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- PersonaBot 可用只读的 `ls -la` 命令直接列出自己的记忆目录，不再被审批卡打断；其他 Shell 命令仍通过 Channel 审批（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。
- 群聊中已选的 @PersonaBot 现在只在输入框和已发送消息正文原位显示，退格可整块删除；Orchestrator Session 中保留 Bot 文本，不再误显示为 DSH 文件图标（[#254](https://github.com/BotHarness/BotHarness/issues/254)）。

- 创建 PersonaBot 时若找不到 Git，现在会明确提示安装并将其加入 PATH、重启 DeepSeek Harness 后重试，失败也不会留下半成品身份（[#268](https://github.com/BotHarness/BotHarness/issues/268)）。
- 修复 Windows 上全新 BotHarness 数据库的初始化；官方 DSH RC2 Desktop 现可添加本地工作区并创建 PersonaBot，不再因此进入恢复模式（[#266](https://github.com/BotHarness/BotHarness/issues/266)）。
- Orchestrator 或 Assignment 回合失败时，PersonaBot 私聊会留下持久的本地化提示和 DSH 错误码；提供方原始报错与 Session 身份按需展开，密钥与余额问题可直接打开模型设置（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。

- 修复目录选择器被拒绝（如 Web 部署）时 Computer 的端到端导出：导出目录回退到内置默认（`~/Desktop/BotHarness Exports`，无 Desktop 时为 `~/BotHarness Exports`）并只读展示、无需输入路径；设置 scope 仍为空时行内持续跟踪该 Host 解析路径（打开目录 / 导出 / 导入对其保持可用）；选择器失败后直接切到该固定目录继续导出；导出完成后自动在宿主机文件管理器中打开目录。在有选择器的部署上，保存手工路径有进行中状态与成功/失败提示，相对路径会被明确拒绝，Host 拒绝写入时会显示错误而不是假成功（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- 本地 QA 启动器现在会识别已有的 DSH profile 凭据，并可一次性将 DeepSeek 密钥迁入受保护的本机共享来源；之后每个由 AX 启动的新 profile 都无需重新填写密钥。AX 指南要求以真实 DM 回复验证可用性（[#218](https://github.com/BotHarness/BotHarness/issues/218)）。

- Human Channel 消息发送失败后会保留明确的失败气泡；点击重试会把原文与附件恢复到输入区，由 Human 再次确认发送；Client message ID 同时保证响应丢失后的 Host 重试不会重复落盘（[#206](https://github.com/BotHarness/BotHarness/issues/206)）。
- 从回复引用定位到较早历史后，现在可通过正常向下滚动持续加载 newer pages，直到回到最新消息（[#207](https://github.com/BotHarness/BotHarness/issues/207)）。
- 已提交的 Channel placement 变更会让其他已打开窗口刷新 roster；拖拽预览仍只存在于当前窗口，远端窗口只重读权威提交状态（[#208](https://github.com/BotHarness/BotHarness/issues/208)）。
- PersonaBot Orchestrator 现在可通过附件引用按需读取 Channel 图片；可信 Host 会先校验成员关系、消息引用、MIME 与大小，不再让模型猜测宿主文件路径，也不会把所有历史图片自动塞入上下文（[#209](https://github.com/BotHarness/BotHarness/issues/209)）。
- 多行 Channel 输入区现在将上方整行留给输入框，把附件与发送按钮固定在底部 footer；只有从单行首次展开为多行时播放动效，后续逐行增高立即完成（[#148](https://github.com/BotHarness/BotHarness/issues/148)）。
- 修复新建 PersonaBot 自动打开 DM 后首条消息无法发送的问题；现在无需重新选择 Bot 或刷新页面即可发送（[#186](https://github.com/BotHarness/BotHarness/issues/186)）。
- PersonaBot DM 现在会随 Orchestrator 显式 `channel_send` 的生成过程预览回复，并在提交后替换为正式 Channel 消息；其他已提交消息也无需刷新即可显示，重连会补回遗漏的历史（[#141](https://github.com/BotHarness/BotHarness/issues/141)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- turn 运行期间不再把进行中的 side effect 报告为 `needs-repair`；被中断的 attempt 在启动时统一对账（已有 side effect → 需修复，否则可重试）（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- 修复置顶 Channel 拖到指定未分组位置时的重复 `topOrder` 项：现在会先移除 pin 前保留的旧位置，再插入预测线位置，取消置顶与移动会一起提交，不再回到原位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- 隐藏频道恢复 Modal 现在遵循 DeepSeek 原生 380px 宽度与 24px 内边距，收紧搜索框与列表间距及行高，按最近隐藏优先排列，并为搜索增加 180ms debounce；section 中除 Channel 行以外的整个区域（包括名称 label）均可打开 section 右键菜单（[#10](https://github.com/BotHarness/BotHarness/issues/10)、[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- 让 PersonaBot DM Channel 与 group Channel 遵循相同的 section、未分组位置、拖拽和移动规则，同时保留带头像的联系人行（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- 修复 flat order 的拖拽提交，使未置顶的 PersonaBot DM 能像 group Channel 一样持久地放在列表最顶端或两个 Channel section 之间（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- Channel 消息发送不再等待 PersonaBot 的 Orchestrator turn：Human 消息立即回显，可在 bot 工作中继续发送，并以 Bot Inbox 的形式入队、按序处理（[#140](https://github.com/BotHarness/BotHarness/issues/140)）。
- 修复 Computer 的 Chromium 在停止→启动后丢失标签页：桌面启动时自动打开浏览器并恢复上次会话，标签页在重启后与导出→导入后一样回来（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。

- 修正 Channel 附件发送说明，明确现有有界读取与本地结果导入工具，让 PersonaBot 能沿用文件操作流程而不再引用不存在的工具（[#677](https://github.com/BotHarness/BotHarness/issues/677)）。
- 将 checked IM 的来源不存在与回复权限拒绝保留为明确失败，避免误记为结果未知；真正未知的发送与历史已记录结果保持原状（[#855](https://github.com/BotHarness/BotHarness/issues/855)）。

### Documentation

- 记录已接受的 Bot Marketplace 顺序，先作为 GitHub 索引目录上线：仓库通过 `botharness-bot` topic 加入，Cloudflare Worker/D1 抓取后在 harness modal 中搜索，安装复用 Git URL 创建 Bot；账号、上传、收藏与导入计数放到第二阶段（[#18](https://github.com/BotHarness/BotHarness/issues/18)、[ADR-0131](docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)）。

- README 与 npm 页面与像素风官网保持一致：分享卡片、桌面端与命令行安装、已支持的 IM 平台、像素头像与社区入口（[#895](https://github.com/BotHarness/BotHarness/pull/895)、[官网](https://deepseekbot.botharness.ai)）。

- 记录已接受的 PersonaBot／Channel 删除契约：默认不勾选的记忆清除选项与直接打开文件夹、保留历史的 Channel 删除，以及 Profile 恢复所需的真实 Purge Ledger 前置实现；运行控件仍由后续实现交付（[#138](https://github.com/BotHarness/BotHarness/issues/138)，[ADR-0130](docs/adr/0130-deletion-preserves-history-and-makes-memory-erasure-explicit.md)）。

- 新增 Channel sidebar 双语章节，以七个图文子页面说明记忆文件与历史、所属会话、Bot 收件箱、工作区授权、本地群管理和显示设置（[#893](https://github.com/BotHarness/BotHarness/issues/893), [教程](docs/channel-sidebar/index.md)）。

- 更新 Discord 接入说明，记录已合并 QA 版本、有界发送中断／恢复证据、代理操作界面的 E2E 截图、真实 Gateway 重投且无重复入箱／回复、原生拒绝检查及仍待完成的资格路径（[#855](https://github.com/BotHarness/BotHarness/issues/855)，[验证记录](docs/dev/verification/discord-855-mention-reply.md)）。

- 新增公共 npm 插件图文安装、API 与各 Bot 模型配置、非 IM 设置参数教程，并把快速开始调整为用户安装路径；已使用 DSH 0.2.0 RC1 和 deepseekbot 0.1.0-alpha.1 实际验证（[#887](https://github.com/BotHarness/BotHarness/issues/887), [教程](docs/installation.md)）。

- 记录 Profile 备份／恢复／迁移 UX 提案，明确校验、修复与显式激活；UX 已验收，运行实现另行跟踪 ([#76](https://github.com/BotHarness/BotHarness/issues/76), [提案](docs/proposals/profile-portability-ux.md))。

- 新增带真实截图的双语 Slack 连接指南，说明应用配置、身份绑定、频道授权与原话题回复验证（[#874](https://github.com/BotHarness/BotHarness/issues/874)、[指南](docs/slack-connection.md)）。

- 记录 npm prerelease 的产物准备与明确发布路径，包括完整性校验、依赖顺序和部分发布恢复；不宣称已经公开发布（[#866](https://github.com/BotHarness/BotHarness/issues/866), [操作指南](docs/npm-prerelease.md)）。

- 补充 npm 版本已部分发布后 main 推进时的显式恢复流程，保留原审阅 source，并拒绝与公开版本字节冲突的产物（[#877](https://github.com/BotHarness/BotHarness/issues/877)、[操作指南](docs/npm-prerelease.md)）。

- 记录固定源码的 Discord @ 收件／回复预检查与尚缺的真实 App 验证；Discord 能力表继续保持未验证，运行行为不变（[#855](https://github.com/BotHarness/BotHarness/issues/855)，[integration guide](docs/dev/guides/im-provider-integration.md)）。

- 整理已验证的 Lark／Slack IM 接入边界与后续平台可复用的资格验证流程 ([#845](https://github.com/BotHarness/BotHarness/issues/845)).

- 新增 Lark / 飞书新手配置指南，含真实后台与已连接 Profile 的压缩 WebP 截图、带中英文字幕的分步视频，以及已验证单次安装、身份绑定、群授权和消息来源核验步骤（[#814](https://github.com/BotHarness/BotHarness/issues/814)、[指南](docs/lark-connection.md)）。

- 新增已核验的 [Assignment Report 批次指南](docs/dev/guides/assignment-report-harvest.md)，包含原生 harvest 证明、来源历史保留、Host 冷启动验收及 Human 来源导航核验（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。

- 新增已核验的 [Assignment 停止与恢复指南](docs/dev/guides/assignment-stop-recovery.md)，说明待处理审批、持久 stopped 状态及 Host 重启后的新工作流程（[#81](https://github.com/BotHarness/BotHarness/issues/81)）。

- 基于真实 Docker 验证补充当前 Computer 部署与镜像选型、持久 workspace 及导出恢复边界（[#205](https://github.com/BotHarness/BotHarness/issues/205)，[报告](docs/research/2026-10-04-computer-image-spike-qualification.md)）。

- 定义 Avatar Family（形象家族）和 Avatar Appearance（保存外形），将可编辑外形、共享活动事实与 renderer 瞬时姿态分别归属；运行时行为未改变（[Context](CONTEXT.md)、[ADR-0116](docs/adr/0116-editable-avatar-appearance-is-independent-of-activity.md)、[#743](https://github.com/BotHarness/BotHarness/issues/743)）。
- 在中英文 README 顶部加入压缩后的多 Bot 概念插画，明确标注插画，并保留真实产品截图（[#643](https://github.com/BotHarness/BotHarness/issues/643)）。

- 将早期里程碑 README 更新为双语产品截图介绍、当前源码预览配置与 Computer/Browser 授权（含 Auto-allow）与临时 fork IM 的明确交付边界（[#643](https://github.com/BotHarness/BotHarness/issues/643)）。

- 记录本地 Human 名称目标：插件内默认名、逐 Channel 的 roleplay 昵称，以及按稳定 ID 显示 Human／PersonaBot 当前名字的提及；运行时功能仍待后续切片（[ADR-0103](docs/adr/0103-local-human-names-label-one-identity-across-channels.md)、[#126](https://github.com/BotHarness/BotHarness/issues/126)、[设计](docs/architecture/botharness-architecture.md)）。

- 记录了已实测的 Lark 工作群提及与受校验话题回复契约、飞书/Lark 权限差异，并提供可复测沙盒和公开 E2E 证据；PersonaBot 入站接入仍属后续工作（[#78](https://github.com/BotHarness/BotHarness/issues/78)、[研究](docs/research/2026-09-20-feishu-message-edit-recall-events.md)）。

- 确定 Memory 及后续 Workspace／消息附件的原生文件打开菜单设计：明确操作所在 Host，附件作为可直接编辑的真实目标文件，不保留附件版本或因修改唤醒 Bot；附件迁移仍属后续切片（[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)、[#572](https://github.com/BotHarness/BotHarness/issues/572)）。
- 明确活动中心由运行总览与个人 Human Inbox 组成，后者覆盖 Channel 未读、提及及卡片内回应；Human 在群聊中的「@所有 Bot」沿用普通直接提及的投递语义。运行时行为未改变（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[#541](https://github.com/BotHarness/BotHarness/issues/541)、[#542](https://github.com/BotHarness/BotHarness/issues/542)、[ADR-0098](docs/adr/0098-activity-center-separates-overview-and-human-inbox.md)、[ADR-0099](docs/adr/0099-human-all-bot-mention-expands-to-direct-mentions.md)）。
- 明确部署本地的模型预设在应用到 PersonaBot 时生成独立快照，以及按实际模型统计的 token 用量在普通 Session 删除后保留；运行时功能将由后续切片实现（[#488](https://github.com/BotHarness/BotHarness/issues/488)、[#39](https://github.com/BotHarness/BotHarness/issues/39)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)、[ADR-0094](docs/adr/0094-retain-per-model-usage-after-session-deletion.md)）。
- 将 in-harness Client 的 Channel 连续阅读、名册移动、DSH shell 集成及 HMR 交互约束整理成独立文档；运行时行为不变（[指南](docs/architecture/client-interaction-contracts.md)、[#452](https://github.com/BotHarness/BotHarness/issues/452)）。

- 记录 Browser use 设计：profile 级托管的 Bot Browser，配 per-PersonaBot 的 Browser Access、按会话的 Browser Authorization、脱敏 Browser Audit 与窗口级 Bot Tab；运行时行为由 tracer 交付（[#459](https://github.com/BotHarness/BotHarness/issues/459)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)、[ADR-0091](docs/adr/0091-bot-tabs-are-window-scoped-work-surfaces.md)）。

- 记录跨设备 Memory 延续由 agent 原生 Git 与 Portability 承担；不新增第一方同步 Skill、Host 持有的远端或凭据处理，运行时行为不变（[ADR-0084](docs/adr/0084-memory-continuity-is-agent-git-plus-portability.md)、[#398](https://github.com/BotHarness/BotHarness/issues/398)）。

- 记录 Computer Target 设计：共享 Computer 由 profile 级选择位置，默认 `local`（运行 DSH 的本机），headless 宿主（如 VPS）用 `container`；该项在 Bot 设置里一次设定，per-PersonaBot 的 Computer Access 仍在 Channel sidebar。Bot Screen 先是窗口级工作界面（每 Bot 一个工作区；实测为顺序语义），每 Bot 独立显示作为实验性开启项，其成本压缩手册收录于多显示 research（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0081](docs/adr/0082-computer-target-is-profile-scoped-local-by-default.md)、[ADR-0082](docs/adr/0083-bot-screens-are-window-scoped-first-displays-experimental.md)）。

- 记录 Computer use 集成设计：采用官方 `ctx.computerUse` seam 与 BotHarness 自建 tool provider、精选工具面与渐进发现、PersonaBot 级 Computer Access（默认关、按会话作用域注入）、按会话的 Computer Authorization（含 profile 级自动允许开关）与脱敏 Computer Audit；运行时行为由 tracer 交付（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0079](docs/adr/0079-adopt-official-computer-use-seam-with-own-provider.md)、[ADR-0080](docs/adr/0080-computer-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 明确群聊补读语义：直接 @ 或到期汇总会从同群待处理消息中有界地选取上下文，并为最早待处理消息保留份额；只有实际进入成功完成的 Orchestrator 回合的消息才算已处理，运行时行为已由 #364 交付（[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)、[ADR-0074](docs/adr/0074-channel-attention-preference-belongs-to-the-personabot.md)、[ADR-0077](docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)、[#362](https://github.com/BotHarness/BotHarness/issues/362)）。

- 记录群组与 attention 设计：群成员以邀请为主并默认自动接受、四档 Channel attention（`all`/`digest`/`mentions`/`silent`）归 PersonaBot 所有（Human 可覆盖）、PersonaBot 自管 attention policy（安全闸门归 Host）、以 turn-time harvest 取代一事件一回合、Inbox 处理按 Source 类别而非平台分类（[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)、[ADR-0074](docs/adr/0074-channel-attention-preference-belongs-to-the-personabot.md)、[ADR-0075](docs/adr/0075-inbox-handling-classifies-by-source-not-platform.md)、[ADR-0076](docs/adr/0076-a-personabot-manages-its-own-attention-policy.md)、[ADR-0077](docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)、[#358](https://github.com/BotHarness/BotHarness/issues/358)）。

- 记录 Bot-to-Bot DM Channel、Human DM 中的 Bot 联系人 mention，以及 Bot 管理群聊邀请的后续协作设计；当前运行行为未改变（[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)、[#278](https://github.com/BotHarness/BotHarness/issues/278)）。

- 记录共享同一 GitHub 账号的 coding-agent task 如何认领 issue，并在 commit 与 PR 中保留可追溯的 task 标识（[#196](https://github.com/BotHarness/BotHarness/issues/196)）。

- 记录 Channel sidebar 为 Bot mode 的 scope 化右侧区域，采用统一注册、可折叠、按序排列的 entry seam，退役 PersonaBot navigation（[ADR-0053](docs/adr/0053-channel-sidebar-is-the-scoped-right-sidebar.md)、[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增 canonical Release Ledger、双语一致性检查与贡献指南（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。
- 记录规划中的 PersonaBot DM 导航，并将 application-defined Work 概念统一更名为 Assignment、Assignment Session、Assignment Agent 与 Assignment Directory；这是一项设计语言更新，不代表 UI 或 runtime 已经实现（[#109](https://github.com/BotHarness/BotHarness/pull/109)）。
- 发布双语 Development status 页面，将 DeepSeekBot 与 DSH Skill 的 release train 和 Changelog 明确分开（[#105](https://github.com/BotHarness/BotHarness/issues/105)）。
- 将 Memory 明确为 optional Git-backed Cordis Service，使 DM → Orchestrator → Assignment 主链不依赖 Persona 或 Memory（[ADR-0047](docs/adr/0047-memory-is-an-optional-git-backed-service.md)、[#74](https://github.com/BotHarness/BotHarness/issues/74)）。
- 通过真实原生 App／Bot 身份与错误服务器拒绝、新消息恢复和截图，完成开发源码 Discord @ 收件／回复首片资格验证；其他能力与产品 Provider 固定版本仍独立管理（[#855](https://github.com/BotHarness/BotHarness/issues/855), [验证](docs/dev/verification/discord-855-mention-reply.md)）。
- 把 DeepSeekBot 使用教程迁到官网（英文 [deepseekbot.botharness.ai/en/docs](https://deepseekbot.botharness.ai/en/docs/overview/)，中文 [/docs](https://deepseekbot.botharness.ai/docs/overview/)）；botharness.ai 上原来的每个教程地址都会跳到新站的同一篇，开发者文档仍留在 botharness.ai（[#914](https://github.com/BotHarness/BotHarness/pull/914)）。

## [Development] - 2026-09-20

汇总 DeepSeekBot 首个版本之前已经实现的基础能力与公开文档；这是开发历史，不代表已发布或可安装的版本。

### Added

- Human 可通过 DSH 应用菜单在 Host 上打开当前 Memory Repository、子目录及文件，显示文件位置、复制 Host 路径，或将完整当前文件下载到浏览器设备；普通文件选择仍使用内置阅读器（[#574](https://github.com/BotHarness/BotHarness/issues/574)、[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)）。

- 创建 PersonaBot 时可选择空白记忆仓库，或用 HTTPS/SSH Git 地址导入。Host 先检查 Git，再利用现有凭证在暂存目录克隆；克隆成功后才创建 Bot，失败不会留下半创建的 Bot（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。
- 新增持久的 PersonaBot identity、文件式 Memory 工具与 BOT mode 创建流程（[#22](https://github.com/BotHarness/BotHarness/pull/22)、[#98](https://github.com/BotHarness/BotHarness/pull/98)）。
- 新增 BOT mode Channel shell、roster sections、分 scope 排序与拖拽移动，并把陈列持久化到 Host（[#51](https://github.com/BotHarness/BotHarness/pull/51)、[#64](https://github.com/BotHarness/BotHarness/pull/64)、[#72](https://github.com/BotHarness/BotHarness/pull/72)、[#73](https://github.com/BotHarness/BotHarness/pull/73)、[#95](https://github.com/BotHarness/BotHarness/pull/95)）。

### Changed

- 让 plugin manifest、configuration path 与 client bridge 对齐已核验的 DSH contract（[#27](https://github.com/BotHarness/BotHarness/pull/27)）。

### Documentation

- 发布双语文档站、持续维护的 BotHarness 架构与产品术语，并为 plugin developer 提供稳定的 DSH/Cordis Context 与 Decision Tree（[#26](https://github.com/BotHarness/BotHarness/issues/26)、[#88](https://github.com/BotHarness/BotHarness/pull/88)、[#90](https://github.com/BotHarness/BotHarness/pull/90)、[#92](https://github.com/BotHarness/BotHarness/pull/92)）。
