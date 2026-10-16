# 用命令行创建 Bot

`deepseekbot create` 无需点击即可创建新的 PersonaBot：空白创建、从 Bot 包导入（目录或 zip，与[ Bot 打包导出](docs/bot-zip.md)形状相同）、或从 GitHub 导入。它为驱动 DSH 的外部编程智能体而建，因此输出以机器读取优先。

## 用法

```bash
deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                   [--core-memory <text> | --core-memory-stdin]
                   [--description <text>] [--role <tag> ...] [--avatar-file <image>]
                   [--preset <model-preset-id>] [--memory-location <absolute-dir>]
                   [--home <dsh-home>]
deepseekbot create --name <name> --from-git <url | owner/repo> [...]
deepseekbot create [--name <name>] --from-zip <file> [...]
deepseekbot create [--name <name>] --from-dir <directory> [...]
deepseekbot list [--home <dsh-home>]
deepseekbot show <id> [--home <dsh-home>]
deepseekbot model-presets [--home <dsh-home>]
deepseekbot model-preset-create --name <preset> --orchestrator-provider <p> --orchestrator-model <m>
                                [--orchestrator-effort <e>] --assignment-provider <p>
                                --assignment-model <m> [--assignment-effort <e>] [--home <dsh-home>]
deepseekbot model-preset-apply <id> --preset <preset-id> [--home <dsh-home>]
deepseekbot model-plan <id> [--home <dsh-home>]
deepseekbot pause <id> [--home <dsh-home>]
deepseekbot resume <id> [--home <dsh-home>]
deepseekbot update <id> [--name <name>] [--description <text>] [--role <tag> ...] [--home <dsh-home>]
deepseekbot human-name-set (--name <text> | --clear) [--home <dsh-home>]
deepseekbot channel-human-name-set <channel> (--nickname <text> | --clear) [--home <dsh-home>]
deepseekbot channels [--home <dsh-home>]
deepseekbot channel-messages <channel> [--limit <n>] [--before <id>] [--home <dsh-home>]
deepseekbot grants <id> [--home <dsh-home>]
deepseekbot grant-revoke <id> --grant <grant> [--home <dsh-home>]
deepseekbot grant-write-set <id> --grant <grant> (--enabled | --disabled) [--home <dsh-home>]
deepseekbot schedules <id> [--home <dsh-home>]
deepseekbot schedule-create <id> --title <t> --prompt <p> (--every <s> | --daily <HH:MM> |
                                --weekly <HH:MM> --weekdays <0-6,..> | --once-date <d> --once-time <t> |
                                --cron <expr>) [--timezone <tz>] [--enabled|--disabled] [--locked] [--home <dsh-home>]
deepseekbot schedule-update <id> --sid <schedule> [--title ...] [--prompt ...] [trigger ...] [--home <dsh-home>]
deepseekbot schedule-delete <id> --sid <schedule> [--confirm] [--home <dsh-home>]
deepseekbot schedule-history <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
deepseekbot pairings <id> [--home <dsh-home>]
deepseekbot search <words>
```

每次创建只能指定一种来源。空白创建和 GitHub 导入必须传 `--name`；包导入时 `--name` 会覆盖 `.botharness/bot.json`（或文件名）中的名字。`--from-git` 接受完整 Git 地址（`https://`、`ssh://`、`git@host:path`）或 `owner/repo` 简写（即 `https://github.com/owner/repo.git`），Bot 市场条目可用其克隆地址走同一路径。`--from-dir` 会跳过 `.git` 下的文件，但存在时将其打包为历史记录。

`--memory-location <绝对路径>` 让空白 Bot 的记忆存放在 DSH 数据目录之外（例如另一块磁盘）：记忆仓库会建在新的 `<目录>/<bot-id>` 文件夹中，`dataDir` 返回该路径。路径必须是已存在文件夹的绝对路径，且这个 Bot 的文件夹不能已存在（`invalid-memory-dir`）；导入的 Bot 仍使用默认位置。创建对话框的 **进阶设置 → 记忆文件位置** 提供同样的选择。

空白 Bot 还可以用 `--core-memory <文本>` 或 `--core-memory-stdin` 写入根目录的 `MEMORY.md`（核心记忆）以代替默认模板，用 `--avatar-file <图片>` 从不超过 128 KiB 的 PNG、JPEG 或 WebP 文件设置头像（否则返回 `invalid-avatar`，文件无法读取时返回 `file-unreadable`）。`--persona-stdin` 和 `--core-memory-stdin` 只能有一个读取标准输入。Bot 也可以在聊天中用 `bot_create` 工具创建同样的空白 Bot，见下文“绕过模型调用 Harness Bot 工具”。

`--home` 指向目标 `DSH_HOME`；全新目录零点击可用。不传时使用环境中的 `DSH_HOME`。离线数据库命令须先停 Host，否则独占写租约返回 `lease-unavailable`。凭据文件命令可在线执行；以下在线命令走已认证的 Host RPC。

## 在线 Host 命令

将 `DEEPSEEKBOT_HOST` 设为运行中 Host 的 loopback origin 或 tailnet HTTPS origin；`--host <origin>` 可覆盖它。当前启动令牌通过 `DEEPSEEKBOT_HOST_TOKEN` 或 `--token-file <私有文件>` 提供，不得把令牌值放入参数。每次调用重新登录，cookie 只留在内存；Host 重启后须使用新令牌。在线命令不打开 Profile 数据库。参见 [ADR-0159](adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md)。

### 在线创建与无浏览器调试

选定 Host 后，`create`、`list`、`show`、`model-presets`、`model-preset-create`、`model-preset-apply`、`model-plan` 和 `channels` 调用已有 Host owner。空白、GitHub/Git、Zip、目录创建沿用上文来源与元数据参数。Zip／目录在调用者机器读取或打包，上传到既有 Bot Zip 导入入口；Git 拉取使用 Host 自己的 Git 环境和凭据。不要同时指定 `--home` 与在线目标。Host 调用失败不会回退写本地数据；尚无在线适配的数据库命令会拒绝已选 Host，而不是静默打开离线 owner。凭据文件操作和 search 保持独立。`schedule*` 命令也走 Host，见[在线 Host 上的定时任务](#在线-host-上的定时任务)。

```bash
deepseekbot create --name QA --preset <preset-id>
deepseekbot create --from-zip ./shared.zip --name Imported --preset <preset-id>
deepseekbot create --name GitBot --from-git owner/repo --preset <preset-id>
deepseekbot model-plan <bot-id>
deepseekbot channels
deepseekbot bot-attention <bot-id> --limit 20 --state handled
deepseekbot bot-sessions <bot-id> --limit 20
deepseekbot bot-activity <bot-id> --limit 20
```

创建返回 `bot`、`dm`、Host 的 Memory `dataDir`、完成／延后阶段 `steps` 和 `next`。模型预设经其 owner 应用，不会被误传为原生 Agent preset。已确定不存在的预设在创建前拒绝；创建后的模型失败保留 Bot，返回已知身份、完成阶段与 `outcome: created`。创建／导入响应丢失时可能返回 `outcome: unknown`，先检查 Host 再决定是否重建，CLI 不自动重试修改。创建成功不证明模型可用：使用 `send` 和准确关联的持久回复验证。

`bot-attention` 支持 `--cursor` 及 Host 的 pending/processing/observed/deferred/needs-repair/handled 状态，分页上限 1–100。Session 摘要按创建时间倒序，限制 1–100（默认 50），返回 `total`；活动摘要限制 Session 明细并返回 `sessionCount`。这些是有界摘要，不是完整工具调用日志或流式草稿。

显式清理先用 `bot-delete-preview <bot-id>` 查看 owner 的当前范围与 `preview.token`，审核后将 `{"token":"<preview.token>"}` 从 stdin 交给 `bot-delete-confirm <bot-id> --confirmation-stdin`。此命令始终保留 Memory，并在停止阶段删除这个 Bot 通过私密输入保存的密钥。检查 `deletion.phase`；未完成的清理可用 `bot-delete-retry <bot-id>` 继续。范围变化由 owner 拒绝；删除身份不是内容清除或全部数据擦除。

私密信息（密钥）使用已认证的 Owner 身份，和 Web Chat 里的卡片是同一套：先用 `channel-messages` 读出卡片 ID 和 `privateInputRequest.fields`，再把字段 ID 到值的 JSON 从 stdin 交给 `ask-secret-submit <channel-id> --message-id <card-id> --values-stdin`。值不要出现在参数、shell 历史或普通消息里；任何命令都不会把原值读回来。`ask-secret-status`、`ask-secret-cancel` 处理待填写的卡片，`ask-secret-account-status`、`ask-secret-replace`、`ask-secret-revoke` 处理已配置的账号，`ask-secret-accounts <bot-id>` 列出某个 Bot 的账号（不含值和引用）。这些命令在所有 Profile 中可用：ADR-0189 之后密钥输入默认开启，不需要 Docker，见[普通 Profile 指南](dev/guides/private-input-ordinary.zh.md)。

在已构建 checkout 中运行 `node scripts/cli-smoke.mjs --preset <id> [--zip ./shared.zip] [--git owner/repo] [--cleanup]`，脚本通过业务 CLI 驱动选定 Host，为每种来源检查真实回复并返回本轮拥有的 ID。没有已有预设时可提供 `--provider <id> --model <id>`。成功时的 `--cleanup` 只经预览／确认删除本轮 Bot 身份，保留 Memory 与本轮新建的预设；失败保留资源供诊断。应使用一次性隔离 Profile。脚本不授权外部消息、不验证 UI 渲染。见 [ADR-0162](adr/0162-online-cli-management-keeps-explicit-host-authority.md)。

```bash
deepseekbot send <bot-id> --body "回复 QA_OK" --timeout 60
deepseekbot send <bot-id> --body-stdin --message-id human-<UUID>
deepseekbot send-status <bot-id> --message-id <回执中的消息-id>
deepseekbot channel-messages <channel-id> --host http://127.0.0.1:31917 --limit 20
deepseekbot tool-approval-status <channel-id> --message-id <卡片-id>
deepseekbot tool-approval-decide <channel-id> --message-id <卡片-id> --outcome allowed-once
deepseekbot tool-approval-decide <channel-id> --message-id <卡片-id> --outcome allowed-always-kind
deepseekbot tool-approval-decide <channel-id> --message-id <卡片-id> --outcome rejected
deepseekbot user-question-status <channel-id> --message-id <卡片-id>
deepseekbot user-question-answer <channel-id> --message-id <卡片-id> --answer-stdin
deepseekbot release-info [--since <版本>]
deepseekbot workspace-options
deepseekbot grant-create <bot-id> --workspace <workspace-id>
```

`tool-approval-status` 返回 `status`；卡片仍为 `pending` 时还返回 `expiresAt`，即网页卡片倒计时的截止时间。`--outcome allowed-always-kind` 对应 `secret_cli` 卡片上的“总是允许此类”：批准这一次，并为同一程序、账号和环境变量名保存一条规则；`tool-approval-rules` 会以 `secret-cli` 类型列出它。其他卡片会拒绝这个选项。

### Agent 控制

这些命令让 Agent 不经 Web 界面就能配置 Bot 的能力和 Host，走的是界面所用的同一套 Host 接口与检查：

```bash
deepseekbot browser-access-set <bot-id> --enabled
deepseekbot computer-access-set <bot-id> --disabled
deepseekbot access <bot-id>
deepseekbot access-set <bot-id> --mode danger-full-access --scope chat --acknowledge-risk
deepseekbot access-set <bot-id> --mode workspace-write
deepseekbot settings botharness-client
printf '{"assignmentConcurrencyLimit":3}' | deepseekbot settings-set botharness-client --patch-stdin
deepseekbot workspace-create /srv/bots/workspace
deepseekbot group-create "Skill Lab" --member <bot-id> --member <bot-id>
```

`access-set` 设置 `danger-full-access` 时必须带 `--acknowledge-risk`：完全访问下 Bot 可以执行任意命令，并且使用浏览器和 Computer 都不弹审批卡。`--scope chat` 同时作用于 Bot 自己的对话；`assignments` 只作用于新的 Assignment。`settings` 返回一个命名空间的 `{ns, revision, value}`；`settings-set` 从标准输入读取一个字段 JSON 对象，并基于该版本号应用，所以并发修改会失败而不是被覆盖。只有 Host 标记为可在线修改的字段才能这样改。`workspace-create` 接受绝对路径并返回 Host 工作区，其 id 供 `grant-create` 使用。

### 频道与群组

这些命令通过与 Web 界面相同的 Host 接口和检查来管理频道和群组。频道 ID 取自 `channels`：

```bash
deepseekbot channel-rename <channel> --name "Skill Lab"
deepseekbot channel-media-target <channel> --source-event <source-event-id> --attachment <attachment-id>
deepseekbot channel-media-download <channel> --source-event <source-event-id> --attachment <attachment-id> --out ./original.csv
deepseekbot group-avatar-set <channel> --avatar-file ./avatar.png
deepseekbot group-avatar-set <channel> --clear
deepseekbot group-invite <channel> --bot <bot-id>
deepseekbot group-invite-cancel <channel> --invitation <invitation-id>
deepseekbot group-join-decide <channel> --request <request-id> --accept
deepseekbot group-join-decide <channel> --request <request-id> --decline
deepseekbot group-member-remove <channel> --bot <bot-id>
deepseekbot group-wake-policies <channel>
deepseekbot group-wake-set <channel> --bot <bot-id> --mode digest --count 5 --interval 30
deepseekbot group-wake-set <channel> --bot <bot-id> --inherit
deepseekbot group-delete <channel> --confirm
deepseekbot channel-timeline <channel> [--direction older|newer|around] [--cursor <cursor>] [--around <message-id>] [--limit <n>] [--older-limit <n>] [--newer-limit <n>]
deepseekbot channel-journal <channel> --through <revision> [--before <position>] [--limit <n>]
deepseekbot channel-mark-read <channel> --message-id <message-id>
deepseekbot channel-mark-all-read
deepseekbot channel-react <channel> --message-id <message-id> --emoji 👍 [--remove]
deepseekbot channel-search <channel> --query <text> [--cursor <cursor>] [--limit <n>]
deepseekbot channel-unread
deepseekbot channel-mute <channel> [--off]
deepseekbot channel-retry <dm-channel> --message-id <human-message-id>
deepseekbot channel-bot-stop <channel> --bot <id>
deepseekbot channel-history
deepseekbot channel-history-sources <channel> [--before <cursor>]
deepseekbot channel-purge-preview <channel> --source-event <id> [--source-event <id> …]
deepseekbot channel-purge-preview <channel> --source-event <id> | jq '{token}' \
  | deepseekbot channel-purge-confirm <channel> --source-event <id> --confirm --confirmation-stdin
```

与 Web 界面一样，重命名 Bot 私聊会同时重命名该 Bot。`group-avatar-set` 读取不超过 96 KiB 的 PNG、JPEG 或 WebP 文件。邀请 ID 和入群申请 ID 位于群组的 `invitations` 和 `joinRequests` 中，`channels` 和每个群组命令都会返回。`group-wake-set` 设置成员 Bot 对普通群消息何时唤醒：`all`、`mentions`、`digest`（累计 `--count` 条消息或经过 `--interval` 秒后唤醒，默认 5 和 30）或 `silent`；`--inherit` 让该成员恢复其 Bot 的默认设置。`channel-timeline` 和 `channel-journal` 按聊天视图的方式分页读取消息；`channel-journal` 的 `--through` 取 `channel-timeline` 返回的 `revision`。`channel-retry` 在 Bot 回复失败后让它重新回答一条 Human 私聊消息。`channel-unread` 列出每个有未读的频道的 Bot 未读消息数，即侧边栏每行显示的数字。`channel-mute` 与侧边栏菜单一样把频道设为免打扰：该行变灰，未读消息不计入活动中心的未读总数；`--off` 取消免打扰。`channel-bot-stop` 停止 Bot 当前这一轮工作，与工作状态条上的“停止”按钮相同：Bot 回到空闲，Channel 里记录 Human 停止了它；Bot 没在工作时以 `not-working` 拒绝。Bot 已委派的 Assignment 继续运行。`channel-react` 给一条消息加上你的表情回应，带 `--remove` 则撤回，并返回该消息的 `reactions`；每条消息最多保留你的 20 个回应，表情必须是单个 emoji。Bot 通过 `channel_send` 的 `react_to` 和 `reaction` 回应，只回应时 `body` 留空；`bot-tool <bot> channel_send --args-stdin` 可以不经过模型执行它。`channel-search` 在你可见的消息中不区分大小写地匹配 `--query`，按时间从新到旧返回，并用返回的 `nextCursor` 翻页。

`group-delete` 和 `channel-purge-confirm` 无法撤销，必须带 `--confirm`。`channel-history` 列出已删除、内容仍可清除的群组。清除与历史页面一样分两步：`channel-purge-preview` 列出所选 Source Event 将删除的消息、Bot 受理记录、文件和后续效果，并返回短时有效的 `token`；`channel-purge-confirm` 从标准输入读取 `{"token": …}`，针对同一组 Source Event 执行，范围变化时以错误码拒绝。Source Event 从 `channel-history-sources` 中选取，它用返回的 `before` 游标分页。

`channel-media-target` 通过当前 Human Channel 授权取得受检来源媒体，返回其 canonical Host 文件目标。`channel-media-download` 使用与卡片相同的认证附件路径，将原件字节写入新的本地 `--out` 文件，并在 JSON 中返回大小、MIME 和 SHA-256；目标已存在时拒绝覆盖。两条命令只使用 Channel、Source Event 和 attachment，不选择 Bot，也不调用模型；来源撤销仍返回明确错误码。默认上限为 25 MiB。

### Bot 资料、侧边栏与部件库

这些命令设置 Bot 的外观和唤醒规则、整理侧边栏、管理自定义部件，走的是 Web 界面所用的同一组 Host 调用（[#1702](https://github.com/BotHarness/DeepSeekBot/issues/1702)）：

```bash
deepseekbot bot-avatar-set <bot-id> --file ./avatar.png
deepseekbot bot-banner-set <bot-id> --file ./banner.png
printf '{"scene":"…","seed":7}' | deepseekbot bot-banner-set <bot-id> --recipe-stdin
deepseekbot bot-banner-set <bot-id> --clear
deepseekbot bot-appearance-set <bot-id> --recipe-stdin < recipe.json
deepseekbot bot-primary-color-set <bot-id> --color '#3366ff'
deepseekbot bot-primary-color-set <bot-id> --automatic
deepseekbot bot-source-policies <bot-id>
deepseekbot bot-source-policy-set <bot-id> --source-class group-ordinary --wake digest --digest-count 5 --digest-interval 600
deepseekbot bot-source-policy-set <bot-id> --source-class human-dm --delivery turn
deepseekbot bot-source-policy-reset <bot-id> --source-class group-ordinary
deepseekbot bot-standing-limits-set <bot-id> --soul 4000 --core-memory 8000
deepseekbot developer-mode-set --enabled
deepseekbot roster
deepseekbot roster-section-create "Work bots"
deepseekbot roster-batch move <channel-id> <channel-id> --section <section-id>
deepseekbot roster-batch pin <channel-id>
deepseekbot roster-pins-set <channel-id> <channel-id>
deepseekbot roster-hidden-set
deepseekbot roster-section-rename <section-id> --name "Play"
deepseekbot roster-section-reorder <section-id> <section-id>
deepseekbot roster-top-reorder section:<section-id> channel:<channel-id>
deepseekbot roster-section-remove <section-id> --confirm
deepseekbot human-identity
deepseekbot human-name-set --name "Vain"
deepseekbot channel-human-name-set <channel-id> --nickname "Boss"
deepseekbot part-library
deepseekbot part-library-import --file ./parts.zip
deepseekbot part-library-import-image --file ./hat.png --slot <slot> --colors 4 --name Hat
deepseekbot part-library-add --part-stdin --name Bob < part.json
deepseekbot part-library-export --out /tmp/part-library.zip
deepseekbot part-library-export --part-id <part-id> --out /tmp/part.png
```

图片从文件路径读取：头像可以是 PNG、JPEG 或 WebP；横幅是 3:1 的 PNG；`--clear` 把头像恢复默认、把横幅恢复为按名字生成的场景。`bot-appearance-set` 接受与头像编辑器相同的像素配方，并据此重绘头像。`--source-class` 取 `assignment-report`（`--wake conditional|immediate`）、`group-ordinary`（`--wake immediate|digest|mentions|silent`，配合 `--digest-count` 和以秒计的 `--digest-interval`），或 `human-dm`、`bot-dm`、`group-mention`（`--delivery steer|turn`）。侧边栏命令使用 Channel id（私聊为 `dm-<bot-id>`）；`roster-pins-set` 和 `roster-hidden-set` 整体替换列表，不传 id 即清空；`roster-batch move` 不带 `--section` 时移到顶层。`roster-section-remove` 必须带 `--confirm`，分组里的 Channel 会移到顶层。设置了 `--host` 或 `DEEPSEEKBOT_HOST` 时，`human-name-set` 和 `channel-human-name-set` 走 Host；带 `--home` 时仍走离线路径。`part-library-export` 把部件 PNG 或整个部件库的 zip 写入 `--out`，并输出文件名和大小；`--part-stdin` 导出以 JSON 给出的已穿戴部件。

### 用命令行管理 IM 应用

```bash
printf '{"token":"…"}' | deepseekbot im-app-add discord --credentials-stdin
deepseekbot im-app-status discord
deepseekbot im-bind <bot-id> --app <app-id>
deepseekbot im-status <bot-id>
deepseekbot channel-ingests <channel>
deepseekbot channel-connect <channel> --bot <bot-id> --conversation <external-id>
deepseekbot im-unbind <bot-id> --app <app-id>
deepseekbot im-app-remove discord --app <app-id>
```

`im-app-add` 适用于基于 token 的平台（Discord、Slack、QQ、钉钉、企业微信、Matrix）；飞书和微信仍用 `im-authorize`。凭证只从标准输入读取，绝不打印；输出列出每个应用的 id、名称、连接状态和错误码。`im-bind` 把已连接的应用（`im-app-status` 里的 `id`，即 `im-status` 里的 `ref`）绑定到 Bot，`im-status` 显示每个绑定的 `reception`。`channel-connect` 通过该 Bot 的绑定，把外部群聊作为上下文接入 Channel；这个会话必须已被该绑定知晓，所以先在那里 @ 一次应用，再从 `channel-ingests` 的 `candidates` 里选 id。否则 Host 会以 `conversation-unavailable` 拒绝。

### 用命令行管理 IM 消息、审批和失败提醒

```bash
deepseekbot messaging-defaults discord
printf '{"expectedRevision":1,"collection":"mentions","wake":"digest","count":5,"intervalSeconds":30,"identityEnabled":true}' \
  | deepseekbot messaging-defaults-set discord --input-stdin
deepseekbot messaging-grants <bot-id>
deepseekbot messaging-targets <app-ref>
deepseekbot messaging-authorize <bot-id> --app <app-ref> --target <target-ref>
deepseekbot messaging-receive <bot-id> --grant <grant-id> --enabled
deepseekbot messaging-channel-target <bot-id> --grant <grant-id> --channel <channel-id|none>
printf '{"collection":"all","wake":"digest","count":5,"intervalSeconds":30}' \
  | deepseekbot messaging-group-policy <bot-id> --grant <grant-id> --input-stdin
printf '{"mode":"follow","expectedRevision":0,"wake":null}' \
  | deepseekbot messaging-thread-policy <bot-id> --source <source-event-id> --input-stdin
deepseekbot messaging-source <bot-id> --source <source-event-id>
printf '{"kind":"mute","grantId":"<grant-id>","expectedRevision":2,"muted":true}' \
  | deepseekbot messaging-conversation <bot-id> --input-stdin
deepseekbot messaging-send <bot-id> --grant <grant-id> --body-stdin [--request-id <id>]
deepseekbot messaging-reachable <bot-id> --binding <binding-id> [--cursor <cursor>]
deepseekbot messaging-post <bot-id> --binding <binding-id> --conversation <group-id> --body-stdin [--request-id <id>]
deepseekbot messaging-post-status <bot-id> --binding <binding-id> --conversation <group-id> --body-stdin --request-id <id>
deepseekbot messaging-post-limit <bot-id> --binding <binding-id> --limit <1-10000|none>
deepseekbot messaging-revoke <bot-id> --grant <grant-id> --confirm
printf '{"kind":"policy","restricted":true,"expectedRevision":0}' | deepseekbot sender-access <bot-id> --input-stdin
deepseekbot channel-bridges <channel-id>
printf '{"kind":"add","grantId":"<grant-id>","expectedGrantRevision":2,"name":"QA","enabled":true,"collection":"mentions"}' \
  | deepseekbot channel-bridge <channel-id> --input-stdin
deepseekbot approval-routes <bot-id>
deepseekbot approval-route <bot-id> --pairing <pairing-id|none>
deepseekbot approval-test <bot-id>
deepseekbot approval-retry <bot-id> --delivery <delivery-id>
deepseekbot failure-alerts <bot-id>
deepseekbot failure-alerts-set <bot-id> --enabled
deepseekbot failure-alerts-test <bot-id>
deepseekbot failure-alerts-retry <bot-id> --delivery <delivery-id>
```

这些命令调用的 Host bridge 方法，与 Bot 的 IM 设置、Channel 桥接列表以及审批和失败提醒卡片相同，所以 Host 会做同样的检查，并以同样的错误码拒绝。`messaging-grants` 列出 Bot 已授权的会话（授权 id、版本、接收状态、群聊和话题策略）以及各绑定的发帖上限，不输出目标摘要和应用指纹。结构化修改从 `--input-stdin` 读取一个 JSON 对象，格式与 Web UI 发送的一致，包括其中的 `expectedRevision`，因此并发修改会失败而不会被覆盖；`approval-route`、`failure-alerts-set` 和 `messaging-post-limit` 会自己读取当前版本。`messaging-send` 和 `messaging-post` 会打印所用的 `requestId`：用同一个 `--request-id` 重试会返回已有的帖子而不会重复发送，`messaging-post-status` 只读回结果、不会再发。与 Web UI 的确认对话框一致，`messaging-revoke`、屏蔽会话、删除桥接以及 `delete-*` 类发送者权限修改都需要 `--confirm`。只向你有权测试的 IM 会话发送消息。

### 用命令行操作浏览器和 Computer

```bash
deepseekbot browser-open <bot-id>
deepseekbot browser-frame <bot-id> --out /tmp/frame.jpg
deepseekbot browser-takeover <bot-id> --enabled
deepseekbot browser-takeover <bot-id> --disabled
deepseekbot browser-stop <bot-id>
deepseekbot computer-status
deepseekbot computer-start --target local
deepseekbot computer-stop
deepseekbot computer-frame --out /tmp/desktop.jpg
deepseekbot computer-takeover --enabled
echo '{"kind":"click","x":10,"y":20}' | deepseekbot computer-input --args-stdin
deepseekbot computer-takeover --disabled
deepseekbot grants <bot-id>
```

`browser-open` 启动 Bot 的浏览器（需要已开启浏览器权限），返回标签页和查看地址。`browser-frame` 把当前画面保存到一个绝对路径，并报告大小和视口，Agent 可以借此看到 Bot 看到的内容。`browser-takeover --enabled` 暂停 Bot 的浏览器以便人工操作，`--disabled` 交还。`computer-start` 带上面板按钮发送的同一个显式授权；用 `computer-status` 读取结果，被拒时 `status.detail` 会说明原因，例如缺少系统权限或显示器。`grants` 从在线 Host 列出 Bot 的工作区授权。路由拒绝时保留 Host 的错误码，或返回 `host-refused` 加上它的说明。

`computer-frame` 把 Computer 桌面（本机或容器）的当前画面保存到一个绝对路径，并报告大小、`mimeType`（`image/jpeg`；Host 无法编码 JPEG 时为 `image/png`）、`seq` 和目标。已配对的手机轮询的也是这一帧：`GET /api/computer/frame?after=<seq>` 会等到画面变化，画面不变时返回 204。`computer-input --args-stdin` 向这个桌面发送一次人工操作：`{"kind":"click","x":10,"y":20}`（可加 `"button":"right"`、`"count":2`）、`{"kind":"scroll","direction":"down","amount":3}`、`{"kind":"type","text":"hi"}` 或 `{"kind":"key","key":"return","modifiers":["meta"]}`。坐标是上一帧画面的像素。Computer 停止时两者都会以 `not-running` 拒绝。发送操作前要先执行 `computer-takeover --enabled`，否则会以 `not-paused` 拒绝。Computer 还没有产生画面时，`computer-frame` 以 `no-frame` 拒绝。`computer-takeover --enabled` 会等 Bot 正在进行的 Computer 调用结束（最多 10 秒）后再返回，暂停开始后才完成的调用结果不会交给 Bot。暂停期间 Bot 的所有 Computer 工具调用都会被拒绝，包括截图，所以你输密码时 Bot 不能移走焦点，也看不到屏幕。手机持续轮询画面或发送操作时暂停一直有效，最后一次之后 30 秒自动结束；`computer-takeover --disabled` 立即交还。

### Human Inbox、委派、会话与审批规则

```bash
deepseekbot inbox --category action --limit 20
deepseekbot inbox-status
deepseekbot inbox-dismiss <item-id> --source-key <source-event-id>
deepseekbot inbox-snooze <item-id> --source-key <source-event-id> --until 2026-10-15T09:00:00Z
deepseekbot inbox-snooze <item-id> --source-key <source-event-id> --clear
deepseekbot inbox --category action --snoozed
deepseekbot inbox-ignore <report-source-event-id>
deepseekbot assignment-context <bot-id> --session <session-id> --source <source-event-id>
deepseekbot channel-assignments <group-channel>
deepseekbot channel-assign <channel> --section <section-id> --index 0
deepseekbot session-ids
deepseekbot session-owner <session-id>
deepseekbot session-archive-set <bot-id> --session <session-id> --archived
deepseekbot tool-approval-rules <bot-id>
deepseekbot tool-approval-rule-revoke <bot-id> --rule <rule-id> --confirm
deepseekbot grant-revoke <bot-id> --grant <grant-id> --confirm
deepseekbot grant-write-set <bot-id> --grant <grant-id> --disabled
deepseekbot private-mcp-set <bot-id> --server <name> --enabled
deepseekbot private-mcp-remove <bot-id> --server <name> --confirm
```

`inbox` 返回 Human Inbox 的一页（`items` 和 `nextCursor`），可以像 Inbox 的标签页一样按 `--category`（`action`、`info`、`unread`、`replies`、`handled`）、`--bot` 或 `--channel` 筛选。`inbox-dismiss` 接收条目的 `id`，条目带有 `sourceEventId` 时把它作为 `--source-key` 传入；`inbox-ignore` 把一条仅供知悉的委派汇报标为已读。`inbox-snooze` 把需要处理、通知或回复里的条目隐藏到 `--until`（最多 30 天后），对应网页 Inbox 的「稍后提醒」；`--clear` 立即让它回来，`inbox --snoozed` 列出仍在延后的条目及其 `snoozedUntil`。`assignment-context` 读取 `assignment-report` 条目背后的汇报。`channel-assignments` 列出群组 Channel 的委派工作；`channel-assign` 把 Channel 移到侧栏的某个分组（`--unsectioned` 移出分组）。`session-ids` 列出 Bot 拥有的根会话，`session-owner` 说明某个会话属于哪个 Bot、以什么角色运行。`tool-approval-rules` 列出 Bot 的"始终允许"规则。撤销规则、工作区授权或私有 MCP 服务器都需要 `--confirm`，与 Web UI 的确认一致。指定了 Host 时，`grant-revoke` 和 `grant-write-set` 经由 Host 执行；使用 `--home` 时仍是离线维护命令。私有 MCP 服务器由 `ask-secret-accounts` 列出；Host 不认识的名称会以 `private-mcp-server-unavailable` 失败。

### 在线 Host 上的定时任务

```bash
deepseekbot schedules <bot-id>
deepseekbot schedule-create <bot-id> --title Standup --prompt "总结昨天" --daily 09:00 --timezone Asia/Tokyo
deepseekbot schedule-preview --cron "0 9 * * 1-5" --timezone Asia/Tokyo
deepseekbot schedule-update <bot-id> --sid <schedule-id> --every 3600 --disabled
deepseekbot schedule-run-now <bot-id> --sid <schedule-id>
deepseekbot schedule-history <bot-id> --sid <schedule-id>
deepseekbot schedule-delete <bot-id> --sid <schedule-id> --confirm
```

选定 Host 后，定时任务命令调用与「定时任务」面板相同的 Host 方法，由 Host 检查 Bot、触发器、时区和锁定状态；被拒时保留 Host 的错误码（`invalid-input`、`not-found`、`locked`、`inactive`）。`schedule-preview` 返回触发器和 Host 算出的接下来几次时刻。`schedule-run-now` 排入一次触发，由运行中的 Host 执行。`schedule-delete` 会连同该任务的历史一起删除，所以和面板上的确认一样，需要 `--confirm`。

### 浏览器和 Computer：观察、系统包、传输与日志

```bash
deepseekbot browser-observation <bot-id> [--tab <tab-id>] [--out /tmp/frame.png]
deepseekbot browser-takeover-audit <bot-id>
printf '%s' "<takeover-token>" | deepseekbot browser-takeover-recording --token-stdin
deepseekbot browser-profile-set <bot-id> --profile work
deepseekbot browser-packages
deepseekbot browser-install-packages --package libnss3 --package libgbm1 --confirm --wait
deepseekbot computer-install-packages --confirm --wait
deepseekbot computer-diagnostics
deepseekbot computer-logs [--bot <bot-id>] [--plugin <name>] [--entity <id>] [--since <ms>] [--limit 100]
deepseekbot computer-exports
deepseekbot computer-export [--dir /abs/exports] [--out /tmp/computer.tar]
deepseekbot computer-upload /abs/path/backup.tar [--name restore.tar]
deepseekbot computer-import restore.tar --confirm
deepseekbot computer-open-dir [--dir /abs/exports]
deepseekbot computer-webrtc [--probe]
deepseekbot browser-webrtc --viewer <id> [--probe]
```

`browser-observation` 返回浏览器面板轮询的同一份状态：浏览器是否在运行、标签页和当前标签页、接管状态、已保存的 profile 和目标。当前画面不会以 base64 打印，只汇总为 `{mimeType, bytes}`，给出 `--out` 时保存到该文件。`browser-takeover-audit` 按时间顺序列出 Bot 的接管事件。`browser-takeover-recording` 读取一次接管及其录下的输入；token 是接管链接里 `takeover=` 的值，从 stdin 传入。`browser-profile-set` 为 Bot 选择浏览器 profile（`default` 恢复默认），命名规则与面板相同。

机器缺少 Chrome 所需的系统库时，`browser-open` 以 `provision-missing-libs` 拒绝，并在说明里列出需要的包。`browser-packages` 报告 Host 能否安装这些包（`access`）以及上次安装的进度；`browser-install-packages` 安装指定的包，`computer-install-packages` 安装本机 Computer 报告缺少的包。两者都和面板上的安装按钮一样需要 `--confirm`，`--wait` 会轮询到安装结束。Host 没有管理员权限时以 `needs-administrator` 拒绝。

`computer-diagnostics` 返回 Computer 最近的诊断事件，`computer-logs` 返回 Host 的运行日志，可按插件、Bot（`--bot`）、实体、时间（`--since`，毫秒时间戳）和条数过滤。归档命令只适用于容器 Computer，否则返回 `container-only`。`computer-export` 把归档写入导出文件夹（或 `--dir`），带 `--out` 时立即下载；一次性下载 token 不会被打印。`computer-upload` 把本地 `.tar` 流式上传到导出文件夹，`computer-exports` 列出其中的归档，`computer-import <archive> --confirm` 会停止容器并用该归档恢复数据。`computer-open-dir` 在 Host 的文件管理器中打开导出文件夹。

`computer-webrtc` 读取手机能否通过 WebRTC 呼叫容器 Computer（`/api/computer/webrtc`）：容器公布的 tailnet 地址和 UDP 端口、空的 ICE 服务器列表和当前通话数；不可用时返回拒绝码和 `fallback: "websocket"`（`not-running`、`media-unavailable`、`tailnet-unavailable`、`tailnet-changed`）。`browser-webrtc --viewer <id>` 对查看器路径为 `/botharness-browser/viewer/<id>/` 的容器 Browser 做同样的事。`--probe` 会打开手机使用的信令连接（`/api/computer/webrtc/signaling`、`/api/browser/webrtc/signaling?viewer=<id>`），完成 Selkies 握手直到收到服务端 offer，并报告其中的 ICE-lite 标志和媒体候选地址；试连期间容器改走 WebRTC，结束后切回 WebSocket，所以桌面端查看器会重连一次。手机用设备凭据通过 `/botharness-device/api/…` 访问同样的路由。

Web 端的实时画面通道（`/api/remote.mux`）和查看器事件上报（`/api/computer/diagnostics/viewer`）保持仅限 UI；`browser-frame`、`browser-observation` 和 `computer-diagnostics` 为 Agent 提供同样的信息。

### 分层排查：经过模型与绕过模型

同一个任务跑两遍，就能定位出问题的那一层：

```bash
# A：经由 Bot，模型 → Harness → 工具 → 浏览器
deepseekbot send <bot-id> --body "打开 https://example.com，只回复页面主标题。"

# B：绕过模型，执行同一段浏览器工具代码，同样检查浏览器权限并记审计
deepseekbot browser-tools
printf '{"url":"https://example.com"}' | deepseekbot browser-tool <bot-id> browser_open --args-stdin
deepseekbot browser-tool <bot-id> browser_observe
deepseekbot browser-tool <bot-id> browser_screenshot --out /tmp/shot.jpg
```

B 失败，说明问题在浏览器本身（例如网站拒绝 headless Chrome），与模型无关。B 成功而 A 失败，就看 Bot 的工具调用是被拒绝了（Harness：权限或审批），还是根本没调用、或参数填错（模型）。`browser-tool` 从标准输入读取工具参数 JSON 对象，工具名带不带 `browser_` 前缀都可以，第一个图片结果保存到 `--out`。直接调用会以会话 `direct` 记入审计。

Computer 的用法相同。先启动它，再用一个有 Computer 权限的 Bot 调用经过筛选的工具：

```bash
deepseekbot computer-start --target local
deepseekbot computer-tools
deepseekbot computer-tool <bot-id> computer_list_windows
deepseekbot computer-tool <bot-id> computer_get_desktop_state --out /tmp/desktop.png
```

不在筛选目录里的工具、没有 Computer 权限的 Bot、未启动的 Computer，`computer-tool` 都会拒绝，提示与 Bot 收到的一致。

要看路径 A 中 Bot 实际做了什么，在 `send` 之后读取它的工具调用记录：

```bash
deepseekbot bot-trace <bot-id> --turns 1
```

每一轮列出模型调用的工具及截断后的参数、结果（`ok`、`error`、审批被拒时为 `denied`、`cancelled` 或 `pending`）、如有审批则附上审批决定，以及结果的开头部分。`secret_cli`、`secret_mcp_connect` 和 `ask_secret` 的参数与结果永远不会返回。`denied` 指向 Harness（权限或审批）；该调的工具没调或参数错，指向模型；同一个工具在路径 B 也失败而这里报 `error`，指向浏览器或 Computer 本身。`--session` 可读取该 Bot 的其他会话，例如某个 Assignment。

### 绕过模型调用 Harness Bot 工具

Bot 用来发言、读取 Inbox、管理 Channel 和计划的 Harness 工具，也可以用同样的方式以该 Bot 的身份直接调用，不经过模型：

```bash
deepseekbot bot-tools
deepseekbot bot-tool <bot-id> channel_list
printf '{"channel_id":"dm-<bot-id>","body":"direct hello"}' | deepseekbot bot-tool <bot-id> channel_send --args-stdin
deepseekbot bot-trace <bot-id> --session direct --turns 5
```

`bot-tools` 列出可直接调用的工具及其输入 schema。`bot-tool` 从标准输入读取参数 JSON 对象，执行与 Bot 回合中完全相同的工具代码，保留工具自身的参数校验、成员资格和权限检查，返回 `{slug, tool, sessionId: "direct", result}`。直接调用没有入站 Channel，回合中默认使用入站 Channel 的地方要显式传 `channel_id`。直接读取不会把 Inbox 条目标为已读；Bot 之间的发送会被拒绝，因为没有 Source Event 承载 Bot 因果链。失败时以非零退出并给出错误码：只能在 Bot 回合内运行的工具（创建或等待 Assignment、Subagent、提问与密钥卡片、切换 Memory 分支、申请工作区授权、交给模型的图片）返回 `tool-not-direct`，此外还有 `invalid-args`、`unknown-bot`、`bot-paused`，以及带工具原始消息的 `tool-failed`。每次调用都记入 Host 的近期直接调用记录，`bot-trace --session direct` 可读取，Host 重启后清空。

`bot_create` 以该 Bot 的身份创建一个空白 PersonaBot，与 Bot 在聊天中创建时相同：`display_name` 必填；`description`、`tags`、`avatar_path`（Bot 记忆仓库或工作区授权内 PNG、JPEG 或 WebP 文件的绝对路径）、`soul`、`core_memory` 和 `memory_location` 可选。返回 `bot_id`、`display_name`、`dm_channel_id`、`memory_dir` 和 `model`（新 Bot 使用 Host 默认模型时为 `host-default`，有自己的模型后为 `set`），同时打开新 Bot 的私聊，并在创建者 Bot 的 Human 私聊中留下一条提示。拒绝时返回错误码：`invalid-input`、`invalid-avatar`、`invalid-memory-dir`、`git-not-found` 和 `memory-unavailable`。直接运行时不经过 Bot 回合中的工具审批，因为运行命令的就是 Human 本人。

```bash
printf '{"display_name":"Tim","tags":["translator"],"soul":"# Tim\\nCalm and precise."}' | deepseekbot bot-tool <bot-id> bot_create --args-stdin
```

结合 `send` 与 `bot-trace` 即可定位问题：直接调用成功而同一请求经 `send` 失败，去 `bot-trace` 看模型的调用；直接调用也失败，问题在 Harness 或运行时。

`send` 由 Host 建立已注册 Bot 的 DM，返回 `receipt`、已提交的人类 `message`、`sourceEventId`、处理 `state` 和 `replies`。回复必须关联这一条请求及归该 Bot 所有的 Session；其他请求、审批／提问卡片、通知和失败不算回复。真实回复同时验证当前模型和 key。默认期限 120 秒，最多 600 秒；发送不会自动重试。开始发送后的错误包含回执，请先用 `send-status` 查结果。指定同一 `human-<UUID>` ID 与正文可由 Host 去重，改变正文则返回错误码。已处理但无回复返回 `reply-not-produced`，需要修复返回 `send-needs-repair`。

问题答案由 stdin 提供：`{"answers":[{"id":"question-id","selected":["Blue"],"custom":"可选文字"}]}`；从在线历史获取问题 ID 与选项。Host owner 只应用一次决定，重复或竞争操作返回原有错误码。工具审批提供仅允许一次和拒绝；问题状态保留 pending/submitted/answered/expired。`release-info` 只读生命周期，工作区授权使用 `workspace-options` 返回的 ID。

Host 离线时返回 `host-unreachable`，不提交消息；过期令牌返回 `host-unauthorized`，无效响应返回 `host-protocol-error`。Bridge 和 gateway 错误码原样透传。stdout 仍只有一份 JSON，支持 `--compact`；认证值不打印、不保存。

凭据写入在落盘前后验证真实 YAML；失败恢复原文件字节，新文件失败则删除。空的 `refs: {}` 转成块映射，保留注释与 records；含空行及尾换行的多行值可完整读回。null ref 值、空文件、非空内联 refs 映射返回 `bad-credentials` 且不改文件；编辑前请将 refs 改成块映射。

### 待办示例插件

这些命令对应待办示例插件（`@botharness/todo`，[ADR-0203](adr/0203-bot-mode-is-a-dockable-layout-that-plugins-extend-with-dock-panels.md)）。只有安装了该插件的 Host 才能使用，其他 Host 返回 `todo-plugin-missing`。

```bash
deepseekbot todos
deepseekbot todo-add --title "续签护照"
deepseekbot todo-update <todo-id> --done
deepseekbot todo-update <todo-id> --title "续签两本护照" --not-done
deepseekbot todo-remove <todo-id>
deepseekbot todo-tools
printf '{"title":"给植物浇水"}' | deepseekbot todo-tool <bot-id> todos_add --args-stdin
```

`todos` 返回 `{ok, todos}`，按创建时间从早到晚排列；每条待办包含 `id`、`title`、`done`、`createdAt`、`updatedAt` 和 `createdBy`（`{kind:"human"}` 或 `{kind:"bot", slug}`）。`todo-add`、`todo-update` 和 `todo-remove` 以 Human 身份修改列表，与之后的待办面板相同。`todo-tools` 列出 Bot 工具 `todos_list`、`todos_add`、`todos_update` 和 `todos_remove` 及其输入 schema；`todo-tool` 以指定 Bot 的身份直接运行其中一个工具，不经过模型，返回 `{ok, slug, tool, result}`。拒绝时带错误码：`invalid-input`（标题为空或过长、更新时没有要改的内容、未知工具）、`invalid-args`（工具参数不符合工具 schema）、`todo-not-found`、`todo-limit`（列表已有 1,000 条待办）和 `unknown-bot`。

### 自动审批（审批模板）

PersonaBot 可以选择一个审批模板（[ADR-0207](adr/0207-an-approval-template-lets-a-reviewer-session-answer-tool-approvals.md)）。选中后，审批员会先按模板回答此 Bot 的审批，再决定是否发卡片：越出沙箱的 Shell 命令、文件工具、打开附件、`secret_cli` 和 `secret_mcp_connect` 调用，以及电脑和浏览器授权。对密钥工具，审批员只看到程序、参数、账号和占位符名称，看不到任何密钥值或环境变量值；对授权，它看到设备和 Session。`cautious` 把密钥工具和两种授权都交给 Human；`get-work-done` 允许已知程序配合它自己服务的账号，并在任务需要时允许浏览器授权。任何修改审批策略的调用仍然以卡片交给 Human。

模板是整个 Profile 共用的模板库。内置两个只读模板：`cautious` 和 `get-work-done`。其余每个模板都是一个 Markdown 文件 `$DSH_HOME/botharness/approval-templates/<name>.md`，设置页（设置 → 自动审批）和下面的命令读写的是同一个文件。名称只用小写字母、数字和短横线；内容最多 32 KiB，第一个 `#` 标题和第一行正文分别作为标题和简介。

```bash
deepseekbot approval-template list [--bot <bot-id>]
deepseekbot approval-template show cautious
deepseekbot approval-template create night-shift --file night-shift.md
cat night-shift.md | deepseekbot approval-template create night-shift --text-stdin
deepseekbot approval-template create my-cautious --from cautious
deepseekbot approval-template edit night-shift --file night-shift.md
deepseekbot approval-template delete night-shift
deepseekbot approval-template-set <bot-id> night-shift
deepseekbot approval-template-set <bot-id> off
```

`list` 返回 `{templates}`，每个模板含 `name`、`title`、`description`、`builtIn` 和 `usedBy`（选用它的 Bot）；加 `--bot` 时还返回该 Bot 当前选中的 `selected`，未选为 `null`。`show` 返回 `{template}`，含完整 Markdown `text`。`create` 和 `edit` 返回 `{template}`；`create --from` 复制另一个模板的内容，内置模板就是这样改的。`delete` 返回 `{template, clearedBots}`：所有选用了它的 Bot 都会清空选择，审批改回卡片。`approval-template-set` 返回 `{bot}`，其中是新的 `approvalTemplate`。`approval-templates` 和 `approval-template-show` 仍可用，分别等同于 `list` 和 `show`。

防止自我提权：Bot 在自己的 Shell 里运行这些命令时，新建模板、或编辑没有任何 Bot 在用的模板，都不需要卡片，所以 Bot 可以替你起草模板。选择模板，以及编辑或删除某个 Bot 正在使用的模板，一定会变成发给 Human 的审批卡片，已保存的规则和审批员都不能替你回答；你拒绝后，文件保持不变。拒绝时带错误码：`invalid-input`（名称不合法、内容为空或过大、要选择的模板不存在）、`template-exists`、`template-read-only`（内置模板）、`unknown-template` 和 `unknown-bot`。

审批员拒绝的每次调用都会成为 Human Inbox 里的一条 `auto-rejection`。它的 `autoRejection` 含会话、工具、参数、模板和理由。`inbox-allow-once` 就是收件箱里的“仍然允许这一次”：只放行那一次完全相同的调用。Bot 会收到通知并可以重试，同一会话里同一工具、参数完全相同的下一次调用不经审核直接运行。之后的调用仍按模板审核。

```bash
deepseekbot inbox --category action --kind auto-rejection
deepseekbot inbox-allow-once autoreject:<source-event-id>
```

`inbox-allow-once` 返回 `{accepted, channelId, messageId}`，其中 `messageId` 是 Human 在 Channel 里的放行消息。已经放行过的条目，或 Bot 已不在该 Channel 时，返回错误码 `auto-rejection-unavailable`。

**熔断。** 同一会话连续 3 次被拒绝，或累计 20 次被拒绝后，此会话的自动审批暂停：之后每个请求都发卡片，Channel 里会出现一条提示。Human 在此会话里给出的下一次批准（卡片上或收件箱里）会恢复自动审批并重新计数。阈值固定。熔断状态和尚未使用的“允许这一次”只保存在 Host 内存里，所以 Host 重启后自动审批会重新计数并恢复，Bot 还没用掉的放行会失效，收件箱条目仍算已处理。

### 审批员模型

默认情况下，每个 Bot 的审批员用这个 Bot 自己的模型。一个 Profile 级设置可以改成所有 Bot 共用一个审批员模型，比如一个便宜又快的模型。

```bash
deepseekbot approval-reviewer-model
deepseekbot approval-reviewer-model-set deepseek/<model> [--effort <effort>]
deepseekbot approval-reviewer-model-set bot
```

两个命令都返回 `{follows, model}`：`follows` 为 `bot`（跟随每个 Bot 自己的模型，`model` 为 `null`）、`model`（所有审批都用指定模型）或 `invalid`（设置文件读不出来）。指定模型时还会返回 `available`，为 `false` 时附带 `unavailableReason`。不在模型目录里、或服务商没有可用密钥的模型仍会保存，但之后每次审批都会改发普通的人类审批卡片，并在 `logs.db` 里写入 `fallback=model-unavailable` 和原因；审批员绝不会自己换用别的模型。`logs.db` 里每条 `approval-review` 记录都写明这次用的 `model` 和 `reviewSession`。Bot 在自己的 Shell 里运行 `approval-reviewer-model-set` 时，这次调用一定会变成发给人类的审批卡片，已保存的规则和审批员都不能替你回答。拒绝时带错误码：`usage`（没有 `<provider>/<model>`，或对 `bot` 加了 `--effort`）和 `invalid-input`。

### 模型、用量与活动

```bash
deepseekbot model-catalog
printf '%s' "$PLAN_JSON" | deepseekbot model-plan-set <bot-id> --plan-stdin
deepseekbot model-plan-customize <bot-id> --orchestrator-provider deepseek --orchestrator-model deepseek-reasoner
printf '%s' "$ASSIGNMENTS_JSON" | deepseekbot model-plan-assignments-set <bot-id> --plan-stdin
deepseekbot model-plan-inherit <bot-id>
deepseekbot model-preset-update <preset-id> --name Nightly --orchestrator-effort high
deepseekbot overview-usage --period week
deepseekbot overview-memory
deepseekbot activity-overview
deepseekbot channel-activity-today
deepseekbot bot-usage <bot-id> --start 2026-10-01 --end 2026-10-14 [--purpose assignment] [--model <m>] [--provider <p>]
deepseekbot bot-session-usage <bot-id>
deepseekbot bot-activity-history <bot-id> [--before 2026-10-14] [--weeks 26]
deepseekbot group-activity <group-channel>
```

`model-catalog` 列出 Host 能运行的模型和 Profile 默认模型，与模型选择器看到的一致。`model-plan-set` 用 stdin 中的 `{"orchestrator":{...},"assignmentDefault":{...},"assignmentModels":[...]}` 替换 Bot 的整个模型方案；`model-plan-assignments-set` 接受去掉 `orchestrator` 的同一对象。路由写作 `{"provider","model","reasoningEffort"?}`，Assignment 模型写作 `{"provider","model","allowedEfforts":[...],"defaultEffort","note"?}`。`model-plan-customize` 只修改已有方案的 Bot 的 Orchestrator。`model-plan-inherit` 去掉 Bot 自己的模型，改为跟随 Profile 默认模型。`model-preset-update` 修改预设的名称或路由；没有给出的参数保持当前值，可选的 `--plan-stdin` `{"assignmentModels":[...]}` 替换它的 Assignment 模型。每条路由都由 Host 按模型目录校验。方案和预设的写入会核对版本：`--expected-revision` 显式指定版本；不指定时命令先读取当前版本，与 `memory-save` 的 `--expected-head` 相同。方案在此期间被改过时，返回 Host 的 `invalid-input`。

`overview-usage`（`--period today|week|month|quarter`，`month` 为近 28 天，`quarter` 为近 84 天，默认 `today`）和 `overview-memory` 返回总览页上每个 Bot 的数据行；把返回的 `nextCursor` 作为 `--after` 传回可以继续读取。`activity-overview` 显示每个 Bot 正在做什么，`channel-activity-today` 显示每个 Channel 今天的消息。`bot-*` 读取命令按 Bot ID 定位，通过它的私聊读取 Profile 面板：`bot-usage` 需要不晚于今天、跨度小于 182 天的 `--start`/`--end`，`bot-session-usage` 按会话和 Assignment 汇总用量，`bot-activity-history` 返回活动日历（`--weeks` 为 1–104）。`group-activity` 接受群组 Channel ID。

### 市场、版本更新、使用统计、Git 与配对审核

这些命令调用的 Host 方法与市场页面、更新卡片、使用统计提示、Git 提示和 IM 配对面板相同：

```bash
deepseekbot marketplace-list [--query <关键词>] [--topic <主题>] [--sort updated|stars] [--cursor <next-cursor>]
deepseekbot marketplace-topics
deepseekbot marketplace-detail <owner/repo>
deepseekbot marketplace-submit https://github.com/<owner>/<repo>
deepseekbot marketplace-report <owner/repo> [--reason <说明>]
deepseekbot release-check
deepseekbot release-prompt 1.2.0-beta.1 --confirm
deepseekbot release-channel
deepseekbot release-channel-set beta --confirm
deepseekbot release-channel-set stable --confirm
deepseekbot release-install <version> --confirm
deepseekbot release-restart --confirm
deepseekbot telemetry-status
deepseekbot telemetry-set --enabled | --disabled
deepseekbot git-status
deepseekbot git-install
deepseekbot pairing-list <bot-id>
deepseekbot pairing-review <bot-id> <pairing-id> --decision approve --role <role-id>
deepseekbot pairing-review <bot-id> <pairing-id> --decision approve --capability approve [--capability answer ...]
deepseekbot pairing-review <bot-id> <pairing-id> --decision reject
deepseekbot pairing-review <bot-id> <pairing-id> --decision revoke --confirm
```

`release-channel` 读取当前 Host Profile 保存的选择。默认是 `stable`，即使运行中的是预发布版本。
`release-channel-set beta|stable --confirm` 只保存选择，不安装、重启、降级、撤销已暂存更新，
也不改变手机报名或统计设置。正式版检查只接受非预发布的 `latest`；Beta 额外考虑 `beta`，不使用 `next`。
注册表候选不是手机与电脑组合通过验证的证明。退出 Beta 不保证存在兼容的正式替代版本；
请保留已安装版本，等待验证后的升级，或由维护者指导恢复。
未加入时显式安装预发布版本返回 `release-beta-not-enabled`；更新变更期间切换返回 `release-busy`；
无法持久化返回 `release-storage-unavailable`。失败时非零退出。
参见 [Beta 选择验证步骤](agents/release-beta-choice.md)；真实 QA 是独立门槛。

`release-prompt <version> --confirm` 消耗当前 Beta Profile 对所选候选版本的自动设置页提醒，
不会安装或重启。`claimed` 表示已先保存记录；重复或更旧版本返回 `suppressed` / `already-prompted`。
其他抑制原因为 `not-beta`、`busy`、`changed`、`no-update`。存储、版本参数或活动检查失败时，
以非零退出并返回 `release-<原因>`。只读检查请用 `release-check`，它不消耗提醒。
提交后丢失响应不会自动重试，手动检查仍可使用。参见 [Beta 提醒验证步骤](agents/release-beta-prompt.md)。

`marketplace-submit` 和 `marketplace-report` 会像网页一样先完成 Host 下发的工作量证明，因此可能需要几秒；市场本身的拒绝（`repository-missing-topic`、`rate-limited` 等）作为错误码返回。举报说明最多 500 个字符。`release-check` 返回更新状态（`current`、`available`、`restart-required`、`development` 或 `unavailable`）。`release-install` 和 `release-restart` 必须带 `--confirm`；安装或重启失败时以非零退出，错误码为 `release-<原因>`，例如 `release-network` 或 `release-not-pending`。只在自己负责的 Host 上请求变更。`pairing-list` 列出 Bot 的配对请求和角色；`pairing-review` 自行读取当前版本号，期间被改动过的请求会被拒绝而不是被覆盖。对话类请求用一个 `--role` 批准，管理类请求用 `--capability` 批准。

有正在运行的 Agent、Agent 排队输入或正在运行／停止中的 Job 时，发布操作返回 `release-busy`。安装或重启尚未完成时拒绝另一次重启，重启期间也拒绝安装。`release-activity-unavailable` 表示无法确认空闲状态，应恢复活动状态服务后重试，不要绕过检查；`--confirm` 不会强制执行。拒绝不会安排自动重试。异步预检结束后、延迟重启实际调用启动器前都会再次检查。这是 DSH 管理的活动准入检查，不是操作系统全局空闲检测，也不是覆盖下载和 Host 关闭全过程的新任务禁入锁。参见[安全发布请求](agents/release-busy-guard.md)。

## IM 应用授权

复用上文的在线 Host 认证。`im-apps` 查询兼容的飞书／微信授权流程，不暴露账号凭据。隔离开发启动器可用 `--im-provider` 安装已资格验证的 Provider。

```bash
deepseekbot im-apps
deepseekbot im-authorize weixin
deepseekbot pairing-status <attempt-id>
deepseekbot pairing-status <attempt-id> --wait --timeout 120
deepseekbot im-authorize feishu
deepseekbot im-credentials <attempt-id> --credentials-stdin < /private/app-credentials.json
deepseekbot im-verify <attempt-id> --verification-stdin < /private/phone-code.txt
deepseekbot im-cancel <attempt-id>
```

飞书凭据 stdin 是只含 `appId`、`appSecret`、`domain` 的 JSON；domain 为 `feishu` 或 `lark`，appId 以 `cli_` 开头。输入文件须保持私有，也可从密码管理器直接送入 stdin。微信返回非敏感的 `authorization.qrDataUrl` PNG 和 `next` 提示：展示该 data URL，用手机扫码确认，再查询原 `attemptId`。状态为 `needs_verification` 时，将手机收到的 4–8 位验证码送入 stdin。凭据及验证码均不得放在命令参数或聊天记录中。

Provider 拥有授权 attempt 与原生账号。attempt 最长十分钟，Host 重启也会丢失；Provider 二维码可能更早失效，以返回状态和 expiresAt 为准。`--wait` 遇到 `ready`、`credentials` 或 `needs_verification` 即返回；报 `authorization-timeout` 后应继续查同一 attempt。完成输出含原生账号引用、指纹和实际连接状态。`setup-expired` 需要新 attempt；终态返回 `authorization-expired`、`authorization-failed` 或 `authorization-cancelled`。取消确认不会撤销已授权的原生账号。启动失败却没有 attempt ID 时，结果未知；先检查 Provider 状态再重试。

IM 应用授权不选择 PersonaBot，也不创建会话 Grant。`pairing-status` 查询这个 Provider attempt；`pairings <bot-id>` 列出 Bot 的管理员配对请求。Provider 的本地访问限制可能严于 CLI 的 tailnet carrier。参见 [ADR-0161](adr/0161-cli-im-authorization-keeps-provider-attempt-authority.md)。

## 机器契约

`send` 等到请求处理完成后才返回已提交回复，使串行命令不会追加到尚未结束的上一轮。对同一 Bot 的并发发送仍遵循 Host 的 DM 投递策略；已处理但没有归属该请求的回复会如实报错。用已授权模型的隔离 QA Bot 复跑 soak：先 `pnpm build`，再执行 `node scripts/e2e-cli-live.mjs --launch <私有-launch.json> --bot <id> --rounds 8 --interval-seconds 30 --output <私有报告.json>`；将间隔设为 `0` 可验证紧接的串行发送。

标准输出恰好是一个 JSON 文档。成功时退出码为 0：

```json
{
  "bot": { "id": "bot-…", "name": "…" },
  "dm": { "channelId": "dm-bot-…" },
  "dataDir": "<dsh-home>/botharness/bots/bot-…/memory",
  "steps": [{ "name": "create-bot", "status": "ok" }],
  "next": ["Open DM dm-bot-… in the DSH web client …"]
}
```

失败时退出码非零并输出 `{"error": {"code", "message"}}`，错误码保持稳定（`usage`、`secret-in-argv`、`bad-zip`、`bad-bundle`、`bad-ref`、`bad-credentials`、`unknown-preset`、 `unknown-bot`、`unknown-channel`、`unknown-schedule`、`duplicate-preset`、`git-not-found`、`git-clone-failed`、`git-clone-timeout`、`memory-unavailable`、`memory-conflict`、`memory-unknown-commit`、`not-found`、`invalid-grant`、`locked`、`inactive`、`limit-reached`、`lease-unavailable`、`invalid-input`）。人类可读的信息只写到 stderr，因此两种情况下标准输出都可解析。标准输出 JSON 默认美化打印；`--compact` 压成一行。`search` 按词在 CLI 实际分发的动词表里找命令。

## 身份

Bot 名字只是标签，身份是 id。每次创建都会生成新的 Bot，重复使用名字会返回第二个 Bot，且退出码仍为 0。

## 密钥

切勿把密钥放在命令行参数里：任何 `--api-key` / `--token` / `--secret` / `--password` 形式的开关都是硬错误（`secret-in-argv`）。模型密钥和令牌走环境变量（例如 `DEEPSEEK_API_KEY`、`GITHUB_TOKEN`）或标准输入管道（`--persona-stdin`）；结果 JSON 永不包含密钥内容。

`secret-put <NAME>` 只从标准输入读值，写入 `$DSH_HOME/.credentials.yaml` 顶层 `refs:` 下的对应条目，其余字节原样保留；写前备份、写后回读校验。`secret-list` 只报告名字、来源与是否可写，永不返回值。`secret-unset <NAME>` 删除条目。损坏的存储文件与过宽的文件权限按错误码失败（`bad-credentials`）。见 ADR-0158。

## 模型

不传 `--preset` 时创建依然成功，`model` 步骤会报告 `no-model-yet`：请在 Bot 模式设置中授权模型，再给 Bot 发消息验证实时回复。传入 `--preset <model-preset-id>` 会在创建时应用该预设；未知 id 会在生成 Bot 之前以 `unknown-preset` 失败。

模型动词管理创建之后的同一批记录：`model-presets` 列出该 Profile 的预设，`model-preset-create` 用显式 provider/model 路由新建预设，`model-preset-apply` 把预设应用到 Bot，`model-plan` 查看生效中的方案。路由离线做形状加 provider 存在性检查（未知 provider 直接失败）；目录活性与就绪检查仍在 Host 侧，`model-plan` 的就绪状态报 deferred。见 ADR-0157。

## 生命周期与人类命名

`pause`/`resume` 开关 Bot 的执行；`update` 改名改标签（`--name`、`--description`、`--role`，遵守 profile 标签/简介长度限制）。`human-name-set` 写人类显示名（`--clear` 重置），`channel-human-name-set` 写分 channel 人类昵称，用词与 CONTEXT.md 一致。未知 Bot/Channel 按错误码失败（`unknown-bot`、`unknown-channel`）。

## Channel、授权、计划与配对

`channels` 列出 Channel，`channel-messages` 读一页消息（从新到旧，`--limit`、`--before` 分页）。`grants` 列出 Bot 的 workspace 授权，`grant-revoke`/`grant-write-set` 管理它们；新建授权需要 Host 的 workspace 注册表，仍是 Host 侧动作。`schedules` 列出 Bot 的计划；`schedule-create` 要 `--title`、`--prompt` 和唯一一种触发器（`--every` 秒数、`--daily`/`--weekly` 时间加 `--weekdays`、`--once-date` 加 `--once-time`、`--cron`），日历触发器必须传 `--timezone`；`schedule-update`/`schedule-delete`/`schedule-history` 用 `--sid` 指定计划；`schedule-run-now` 记录一次手动触发，Host 启动后执行；`schedule-preview` 不指定 Bot、只渲染触发器的未来时刻。`pairings` 列出 Bot 的 IM 配对请求。不存在的计划报 `unknown-schedule`；删除返回 `removed`。

## Memory

`memory-snapshot`、`memory-file --path`、`memory-history [--limit]`、`memory-diff --sha` 读取 Bot 记忆库；`memory-save --path (--body | --body-stdin)` 写一个文件并提交。`--expected-head` 默认取当前 HEAD（要做 compare-and-swap 请显式传）；`--edit-id` 默认生成新的 UUID，重复提交幂等。HEAD 过期或无变化的写入报 `memory-conflict`，不存在的文件读回 `null`，非法 sha 报 `invalid-input`。

选定在线 Host 时，上述命令改为通过 Host 的 Memory 模块执行，而不是读写本地存储，此时 `memory-save` 必须带 `--expected-head`。在线 Host 还提供 Memory 面板的其余功能：

```bash
deepseekbot memory-graph <bot-id> [--offset <n>]
deepseekbot memory-commit-diff <bot-id> --sha <commit>
deepseekbot memory-changes <bot-id>
deepseekbot memory-working-diff <bot-id> --path <file> --kind staged|unstaged|untracked|current
deepseekbot memory-file-target <bot-id> --path <file>
deepseekbot memory-versions <bot-id>
deepseekbot memory-version-name <bot-id> --sha <commit> --name <version>
deepseekbot memory-version-unname <bot-id> --tag <version>
deepseekbot memory-checkpoints <bot-id>
deepseekbot memory-restore <bot-id> --checkpoint <id> --expected-current <id>
deepseekbot memory-restore-commit <bot-id> --sha <commit> --expected-head <commit> [--name <version>]
deepseekbot memory-repair <bot-id> --expected-head <commit>
```

写入和恢复都必须指明预期的 head 或检查点，所以并发修改会以 `memory-conflict` 失败，而不会被覆盖；`--restore-id` 和 `--repair-id` 默认是新的 UUID，使重试保持幂等。恢复前会先记录一个检查点，可以用 `memory-checkpoints` 查看。

把 Bot 的记忆仓库移到别的文件夹，或移回默认位置：

```bash
deepseekbot memory-move <bot-id> --memory-location <absolute-dir>
deepseekbot memory-move <bot-id> --default-location
```

仓库会移到 `<absolute-dir>/<bot-id>`；该文件夹必须已存在，且其中还没有这个 Bot。移动前会先归档 Bot 的主会话，下一轮对话会在新文件夹里开启新的主会话；聊天记录、记忆提交和任务都会保留。Bot 正在工作时返回 `bot-busy`，文件夹不存在或已被占用时返回 `invalid-memory-dir`，记忆修复未完成时返回 `memory-conflict`。跨磁盘移动时会先复制、核对 HEAD 与原仓库一致，再删除旧文件夹；结果里若有 `leftover`，表示该旧文件夹未能删除。
