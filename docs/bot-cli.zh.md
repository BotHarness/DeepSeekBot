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
deepseekbot skills list
deepseekbot skills show <skill-id>
```

每次创建只能指定一种来源。空白创建和 GitHub 导入必须传 `--name`；包导入时 `--name` 会覆盖 `.botharness/bot.json`（或文件名）中的名字。`--from-git` 接受完整 Git 地址（`https://`、`ssh://`、`git@host:path`）或 `owner/repo` 简写（即 `https://github.com/owner/repo.git`），Bot 市场条目可用其克隆地址走同一路径。`--from-dir` 会跳过 `.git` 下的文件，但存在时将其打包为历史记录。

`--memory-location <绝对路径>` 让空白 Bot 的记忆存放在 DSH 数据目录之外（例如另一块磁盘）：记忆仓库会建在新的 `<目录>/<bot-id>` 文件夹中，`dataDir` 返回该路径。路径必须是已存在文件夹的绝对路径，且这个 Bot 的文件夹不能已存在（`invalid-memory-dir`）；导入的 Bot 仍使用默认位置。创建对话框的 **进阶设置 → 记忆文件位置** 提供同样的选择。

空白 Bot 还可以用 `--core-memory <文本>` 或 `--core-memory-stdin` 写入根目录的 `MEMORY.md`（核心记忆）以代替默认模板，用 `--avatar-file <图片>` 从不超过 5 MB（5,000,000 字节）的 PNG、JPEG 或 WebP 源文件设置头像。CLI 会应用方向信息，按需降低质量和尺寸，统一转成不超过 1024 × 1024 像素、128 KiB 的 WebP（图片不符合要求时返回 `invalid-avatar`，文件无法读取时返回 `file-unreadable`）。`--persona-stdin` 和 `--core-memory-stdin` 只能有一个读取标准输入。Bot 也可以在聊天中用 `bot_create` 工具创建同样的空白 Bot，见下文“绕过模型调用 Harness Bot 工具”。

`--home` 指向目标 `DSH_HOME`；全新目录零点击可用。不传时使用环境中的 `DSH_HOME`。离线数据库命令须先停 Host，否则独占写租约返回 `lease-unavailable`。凭据文件命令可在线执行；以下在线命令走已认证的 Host RPC。

## 随安装包提供的工作流 Skill

```bash
deepseekbot skills list
deepseekbot skills show bot-management
deepseekbot skills show avatar-management
```

这些只读命令输出一个 JSON 文档，不需要模型、运行中的 Host、源码仓库或另行安装的 Skill，Human CLI 和 Tob 受限执行均可查询。`skills list` 返回精选 Skill 的 ID、说明和相关命令；`skills show <skill-id>` 在 `skill.body` 中返回完整 Markdown。两者均返回 `schemaVersion`、`packageName` 和 `packageVersion`，版本来自实际执行该 CLI 的安装包。支持 `--compact`，不接受目标、认证或变更参数。未知 ID 返回 `unknown-skill`；安装包元数据或内容缺失时返回 `skills-unavailable`。

Tob 先用 `capabilities` 发现当前可用操作，再读取相关 Skill 后准备提案。头像任务读取 `avatar-management`，其中包含源图片准备、自动转换、Bot／群组命令、指纹、审核和回读。安装包中的指导不增加命令权限或文件访问范围，仍由实时能力目录和现有 owner 判断可用性与授权。直接调用 Harness 的 `bot_create` 工具仍沿用原有 128 KiB 源文件契约；更大的源图片额度只适用于 CLI 路径。

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

创建返回 `bot`、`dm`、Host 的 Memory `dataDir`、完成／延后阶段 `steps` 和 `next`。模型预设经其 owner 应用，不会被误传为原生 Agent preset。已确定不存在的预设在创建前拒绝；创建后的模型失败保留 Bot，返回已知身份、完成阶段与 `outcome: created`。不带稳定 operation key 的创建／导入响应丢失时可能返回 `outcome: unknown`，先检查 Host 再决定是否重建，CLI 不自动重试修改。在线创建和已检查来源的导入可用下文的持久创建回执核对同一个身份。创建成功不证明模型可用：使用 `send` 和准确关联的持久回复验证。

`bot-attention` 支持 `--cursor` 及 Host 的 pending/processing/observed/deferred/needs-repair/handled 状态，分页上限 1–100。Session 摘要按创建时间倒序，限制 1–100（默认 50），返回 `total`；活动摘要限制 Session 明细并返回 `sessionCount`。这些是有界摘要，不是完整工具调用日志或流式草稿。

显式清理先用 `bot-delete-preview <bot-id>` 查看 owner 的当前范围与 `preview.token`，审核后将 `{"token":"<preview.token>"}` 从 stdin 交给 `bot-delete-confirm <bot-id> --confirmation-stdin --confirm`。默认保留 Memory，仅显式 `--erase-memory` 才选择擦除 owner 审核的目录，并在停止阶段删除这个 Bot 通过私密输入保存的密钥。检查 `deletion.phase`；未完成的清理可用 `bot-delete-retry <bot-id> --confirm` 继续。范围变化由 owner 拒绝；删除身份不是内容清除或全部数据擦除。

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
deepseekbot channel <group-channel>
deepseekbot group-create "Skill Lab" [--member <bot-id> ...] [--operation-key <stable-key>]
deepseekbot channel-rename <channel> --name "Skill Lab" [--expected-channel <channelFingerprint>]
deepseekbot channel-media-target <channel> --source-event <source-event-id> --attachment <attachment-id>
deepseekbot channel-media-download <channel> --source-event <source-event-id> --attachment <attachment-id> --out ./original.csv
deepseekbot group-avatar-set <channel> --avatar-file ./avatar.png [--expected-channel <channelFingerprint>]
deepseekbot group-avatar-set <channel> --clear [--expected-channel <channelFingerprint>]
deepseekbot group-invite <channel> --bot <bot-id> [--operation-key <stable-key>] [--expected-channel <channelFingerprint>]
deepseekbot group-invite-cancel <channel> --invitation <invitation-id> [--expected-channel <channelFingerprint>]
deepseekbot group-join-decide <channel> --request <request-id> --accept [--expected-channel <channelFingerprint>]
deepseekbot group-join-decide <channel> --request <request-id> --decline [--expected-channel <channelFingerprint>]
deepseekbot group-member-remove <channel> --bot <bot-id> [--expected-channel <channelFingerprint>]
deepseekbot group-send-review <channel> [--accept | --off]
deepseekbot group-wake-policies <channel>
deepseekbot group-wake-set <channel> --bot <bot-id> --mode digest --count 5 --interval 30 [--expected-channel <channelFingerprint>]
deepseekbot group-wake-set <channel> --bot <bot-id> --inherit [--expected-channel <channelFingerprint>]
deepseekbot group-delete <channel> --confirm
deepseekbot channel-timeline <channel> [--direction older|newer|around] [--cursor <cursor>] [--around <message-id>] [--limit <n>] [--older-limit <n>] [--newer-limit <n>]
deepseekbot channel-journal <channel> --through <revision> [--before <position>] [--limit <n>]
deepseekbot channel-mark-read <channel> --message-id <message-id>
deepseekbot channel-mark-all-read
deepseekbot channel-react <channel> --message-id <message-id> --emoji 👍 [--remove]
deepseekbot channel-search <channel> --query <text> [--cursor <cursor>] [--limit <n>]
deepseekbot channel-unread
deepseekbot channel-preferences <channel>
deepseekbot channel-mute <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-pin <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-hide <channel> [--off] [--expected-state <stateFingerprint>]
deepseekbot channel-human-name-set <channel> (--nickname <text> | --clear) [--expected-state <stateFingerprint>]
deepseekbot channel-retry <dm-channel> --message-id <human-message-id>
deepseekbot channel-bot-stop <channel> --bot <id>
deepseekbot channel-history
deepseekbot channel-history-sources <channel> [--before <cursor>]
deepseekbot channel-purge-preview <channel> --source-event <id> [--source-event <id> …]
deepseekbot channel-purge-preview <channel> --source-event <id> | jq '{token}' \
  | deepseekbot channel-purge-confirm <channel> --source-event <id> --confirm --confirmation-stdin
```

`channel_send` 可选传入 `resolve_inbox_ids`，显式指定 1–200 个已观察的 Source Event 或 Message ID，仅在发送提交或成功 drop 后标记 done。不传时保留 Inbox 责任；held/refused 不结清。省略结清参数时，`inboxResolution.outcome` 为 `not-requested`，提示在本轮结束前显式结清已完成事项。drop 省略 `channel_id` 时使用入站 Channel。单独检查 `inboxResolution`：结清失败时用 `inbox_resolve` 修复，不要重发已提交的消息。CLI `bot-tool <bot> channel_send --args-stdin` 使用相同参数。

若本轮发起来源是启用复核的 Group，成员资格被撤销后不能把回复改道其他 Channel；`channel_send` 返回 `refused`，reason 为 `group-reply-source-revoked`。后续独立私聊请求不受影响。

`group-send-review <channel> --accept` 在本地 Group 启用发送复核；`--off` 关闭，无标志时读取状态。
该设置不修改唤醒策略。直接调用 `bot-tool <bot> channel_read --args-stdin`，从 `observationIds`
取得目标群的观察凭据，作为 `observation_id` 传给 `channel_send`。`held` 表示尚未发送：读取变化后，
携带 `draft_id`、新观察凭据和改写（或保持原文）的 `body` 再提交一次。`drop: true` 配合 `draft_id`
和空 `body` 放弃草稿，不会解决 Inbox 事项。`expired`、`refused`、`requires-review` 停止自动发送。
凭据不能跨 Bot owner 或 Group 使用。
主动让话使用同一条 `bot-tool <bot> channel_send --args-stdin`，传入
`{"channel_id":"...","body":"","drop":true,"draft_id":"...","observation_id":"...","yield_to_message_ids":["..."]}`。
先读同伴完整答复；`review.peerMessageIds` 标出已完整返回的同伴消息。成功返回
`dropped`、`reason: explicit-peer-yield` 和 `yieldedToMessageIds`，依据保留在草稿审计与
`bot-trace` 中。未观察、已变更、已清除、自己的消息、Human 消息或仅预览的引用返回
`peer-answer-not-observed`，不会放弃草稿或结清 Inbox。Host 不替模型判断答复是否充分；
独立补充与新直接问题仍走原发送路径，Inbox 只结清显式选择的已完成事项。
`held.review.content` 包含有限新增正文；`review.complete` 为 true 时，可直接把
`review.observationId` 作为 `observation_id` 复核，无需额外 `channel_read`。内容未完整返回时仍须读取缺失部分；省略的内容不会计作已观察。

`channel <group-channel>` 返回 `{channel, channelFingerprint, invitationPolicy:{autoAccept}, wakePolicies}`，拒绝非群频道。稳定创建／邀请参数及重试语义见 [Tob 建群与邀请](#tob-建群与邀请)，Human 在线命令也可使用。

与 Web 界面一样，重命名 Bot 私聊会同时重命名该 Bot。`group-avatar-set` 接受不超过 5 MB（5,000,000 字节）的 PNG、JPEG 或 WebP 源文件，统一转成不超过 1024 × 1024 像素、98,286 字节的 WebP，同时满足既有 96 KiB 图片限制和序列化 data URL 限制。邀请 ID 和入群申请 ID 位于群组的 `invitations` 和 `joinRequests` 中，`channels` 和每个群组命令都会返回。`group-wake-set` 设置成员 Bot 对普通群消息何时唤醒：`all`、`mentions`、`digest`（累计 `--count` 条消息或经过 `--interval` 秒后唤醒，默认 5 和 30）或 `silent`；`--inherit` 让该成员恢复其 Bot 的默认设置。`channel-timeline` 和 `channel-journal` 按聊天视图的方式分页读取消息；`channel-journal` 的 `--through` 取 `channel-timeline` 返回的 `revision`。`channel-retry` 在 Bot 回复失败后让它重新回答一条 Human 私聊消息。`channel-unread` 列出每个有未读的频道的 Bot 未读消息数，即侧边栏每行显示的数字。`channel-mute` 与侧边栏菜单一样把频道设为免打扰：该行变灰，未读消息不计入活动中心的未读总数；`--off` 取消免打扰。`channel-bot-stop` 停止 Bot 当前这一轮工作，与工作状态条上的“停止”按钮相同：Bot 回到空闲，Channel 里记录 Human 停止了它；Bot 没在工作时以 `not-working` 拒绝。Bot 已委派的 Assignment 继续运行。`channel-react` 给一条消息加上你的表情回应，带 `--remove` 则撤回，并返回该消息的 `reactions`；每条消息最多保留你的 20 个回应，表情必须是单个 emoji。Bot 通过 `channel_send` 的 `react_to` 和 `reaction` 回应，只回应时 `body` 留空；`bot-tool <bot> channel_send --args-stdin` 可以不经过模型执行它。`channel-search` 在你可见的消息中不区分大小写地匹配 `--query`，按时间从新到旧返回，并用返回的 `nextCursor` 翻页。

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

图片从文件路径读取：头像源文件可以是静态 PNG、JPEG 或 WebP，最大 5 MB（5,000,000 字节），解码后最多 4000 万像素。CLI 保留源文件，应用方向信息，在不放大的前提下缩至 1024 × 1024 像素以内，并压缩为 WebP（Bot 最大 128 KiB，群组最大 98,286 字节）。为满足限制可能继续降低质量和尺寸；CLI 没有交互裁切，应先准备好构图。动画、超限或无法解码的图片会被拒绝。横幅是 3:1 的 PNG；`--clear` 把头像恢复默认、把横幅恢复为按名字生成的场景。`bot-appearance-set` 接受与头像编辑器相同的像素配方，并据此重绘头像。`--source-class` 取 `assignment-report`（`--wake conditional|immediate`）、`group-ordinary`（`--wake immediate|digest|mentions|silent`，配合 `--digest-count` 和以秒计的 `--digest-interval`），或 `human-dm`、`bot-dm`、`group-mention`（`--delivery steer|turn`）。侧边栏命令使用 Channel id（私聊为 `dm-<bot-id>`）；`roster-pins-set` 和 `roster-hidden-set` 整体替换列表，不传 id 即清空；`roster-batch move` 不带 `--section` 时移到顶层。`roster-section-remove` 必须带 `--confirm`，分组里的 Channel 会移到顶层。设置了 `--host` 或 `DEEPSEEKBOT_HOST` 时，`human-name-set` 和 `channel-human-name-set` 走 Host；带 `--home` 时仍走离线路径。`part-library-export` 把部件 PNG 或整个部件库的 zip 写入 `--out`，并输出文件名和大小；`--part-stdin` 导出以 JSON 给出的已穿戴部件。

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

对于已核验的微信私聊连接器，update JSON 支持独立的 `dmMirror` 与 `dmForward` 布尔值，两者默认均为 `false`。先读取 `channel-bridges`，再携带当前 Grant／route revision 提交设置。同一 Binding 与会话的入口共享偏好；离线时仍可关闭，关闭停止未提交操作，不清除历史、不撤销正常回复权限。转发需要同一账户中已有的主动发送目标。例如，在其他字段不变的 update payload 中加入 `"dmMirror":true,"dmForward":false`，即可只开启本地镜像。

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
deepseekbot inbox --category replies --search budget --unread --sort mentions-first
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

`inbox --search <文字>` 在分页前搜索安全的 Activity 摘要、Channel 名称和 Bot slug（最多 200 字符）。`--unread` 仅保留未读的个人消息，不隐藏待处理事项。`--sort newest|oldest` 按时间排序；`--category replies --sort mentions-first` 将提及排在回复前。使用 `--cursor` 时须保持筛选条件不变。搜索、未读筛选和提及排序要求查询版本 1；旧 Host 返回 `host-query-unsupported`，不会静默返回部分结果。

`inbox` 返回 Human Inbox 的一页（`items` 和 `nextCursor`），可以像 Inbox 的标签页一样按 `--category`（`action`、`info`、`unread`、`replies`、`handled`）、`--bot` 或 `--channel` 筛选。`inbox-dismiss` 接收条目的 `id`，条目带有 `sourceEventId` 时把它作为 `--source-key` 传入；`inbox-ignore` 把一条仅供知悉的委派汇报标为已读。`inbox-snooze` 把需要处理、通知或回复里的条目隐藏到 `--until`（最多 30 天后），对应网页 Inbox 的「稍后提醒」；`--clear` 立即让它回来，`inbox --snoozed` 列出仍在延后的条目及其 `snoozedUntil`。`assignment-context` 读取 `assignment-report` 条目背后的汇报。`channel-assignments` 列出群组 Channel 的委派工作；`channel-assign` 把 Channel 移到侧栏的某个分组（`--unsectioned` 移出分组）。`session-ids` 列出 Bot 拥有的根会话，`session-owner` 说明某个会话属于哪个 Bot、以什么角色运行。`tool-approval-rules` 列出 Bot 的"始终允许"规则。撤销规则、工作区授权或私有 MCP 服务器都需要 `--confirm`，与 Web UI 的确认一致。指定了 Host 时，`grant-revoke` 和 `grant-write-set` 经由 Host 执行；使用 `--home` 时仍是离线维护命令。私有 MCP 服务器由 `ask-secret-accounts` 列出；Host 不认识的名称会以 `private-mcp-server-unavailable` 失败。

### Tob scheduled work

在 Tob 的可信 Human 私聊 Shell 中，同样七个定时任务命令调用既有 Bot Schedule owner。`schedules <bot>` 返回各任务的 `stateFingerprint`、触发器时区、下次运行时间与上次触发，以及任务集合的 `stateFingerprint`。日历触发器必须明确 IANA 时区；Bot 或时区有歧义时，先向 Human 澄清再写入。

`schedule-create` 必须用 `--expected-state` 传入读到的集合指纹，并提供稳定 `--operation-key`；`schedule-update`、`schedule-delete`、`schedule-run-now` 则传入选定任务的指纹。创建标识绑定 Bot 身份和完整输入；同标识、同输入重放只读回原任务，不重复写入或审批，Host 重启后仍有效。输入变化拒绝 `operation-key-conflict`；原任务删除后拒绝 `schedule-creation-deleted`，不会重新创建。创建结果不确定时先按同标识、同输入核对，再考虑新请求。

五种触发器及 UI 的名称、提示词、启停和锁定选项全部可用。审核展示准确 Bot／任务、旧状态和改动，审批后重验身份和状态；独立修改使旧请求拒绝 `stale-schedule`，正常触发／历史变化不会使编辑过期。锁定任务拒绝编辑、删除和立即运行；可通过独立审核的仅 `--unlocked` 操作解锁，再根据新状态审核具体修改，不能把解锁藏在编辑中。删除始终要求 `--confirm`，并删除历史。立即运行也是写入：结果不确定时先查 `schedule-history`，绝不能自动重试。

```bash
deepseekbot schedules writer
deepseekbot schedule-create writer --title Check --prompt "汇总任务" --daily 09:00 --timezone Asia/Tokyo --operation-key daily-check-001 --expected-state <集合指纹>
deepseekbot schedule-update writer --sid <id> --disabled --expected-state <任务指纹>
deepseekbot schedule-history writer --sid <id>
deepseekbot schedule-delete writer --sid <id> --expected-state <任务指纹> --confirm
```

这些受限要求补充下文的 Human CLI。预览仅证明时间计算；实际历史中的 Source Event／Session 与正确 Bot 的结果才证明执行。CLI 能力不会授予无人值守权限，也不能绕过原 Human 私聊来源与审批策略。

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

本地 Browser 进程已运行但尚无所属当前标签页时，`browser-observation` 返回 `viewerUrl: null`；进程就绪不等于画面就绪。`browser-frame` 区分已停止/无标签页的拒绝（404）与有界等待后首帧不可用的 `host-refused`（503）。

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
deepseekbot home-model-set --provider <provider-id> --model <model-id> [--orchestrator-effort <effort>] [--expected-revision <default-revision>]
deepseekbot model-preset-apply <bot-id> --preset <preset-id> [--expected-revision <plan-revision>] [--preset-revision <preset-revision>]
deepseekbot overview-usage --period week
deepseekbot overview-memory
deepseekbot activity-overview
deepseekbot channel-activity-today
deepseekbot bot-usage <bot-id> --start 2026-10-01 --end 2026-10-14 [--purpose assignment] [--model <m>] [--provider <p>]
deepseekbot bot-session-usage <bot-id>
deepseekbot bot-activity-history <bot-id> [--before 2026-10-14] [--weeks 26]
deepseekbot group-activity <group-channel>
```

连接在线 Host 时，`model-preset-create` 也支持 `--plan-stdin`，stdin 仅包含 `{"assignmentModels":[...]}`，创建预设时保留可选模型、推理强度和备注。创建与更新都通过移动端编辑器使用的同一 Host bridge 转发完整策略，不会悄悄缩减为默认模型。

`model-catalog` 列出 Host 能运行的模型和 Profile 默认模型，与模型选择器看到的一致。`model-plan-set` 用 stdin 中的 `{"orchestrator":{...},"assignmentDefault":{...},"assignmentModels":[...]}` 替换 Bot 的整个模型方案；`model-plan-assignments-set` 接受去掉 `orchestrator` 的同一对象。路由写作 `{"provider","model","reasoningEffort"?}`，Assignment 模型写作 `{"provider","model","allowedEfforts":[...],"defaultEffort","note"?}`。`model-plan-customize` 只修改 Bot 的 Orchestrator；原本继承全局时建立独立覆盖，Assignment 的固定配置或全局继承保持不变。`model-plan-inherit` 去掉 Bot 自己的模型，改为跟随 Profile 默认模型。`model-preset-update` 修改预设的名称或路由；没有给出的参数保持当前值，可选的 `--plan-stdin` `{"assignmentModels":[...]}` 替换它的 Assignment 模型。每条路由都由 Host 按模型目录校验。方案和预设的写入会核对版本：`--expected-revision` 显式指定版本；不指定时命令先读取当前版本，与 `memory-save` 的 `--expected-head` 相同。方案在此期间被改过时，返回 Host 的 `invalid-input`。

在线 Human CLI 的 `home-model-set` 支持 `--orchestrator-effort` 和 `--expected-revision`；后者对应 `model-catalog.defaultRevision`，省略时先读取当前默认模型 revision。`model-preset-apply` 可通过 `--expected-revision` 约束 Bot 计划、`--preset-revision` 约束预设；省略这些参数时保留原有 Human 行为。受限 Tob 调用必须明确传入对应 revision，不能借省略参数跳过已审核快照。

`overview-usage`（`--period today|week|month|quarter`，`month` 为近 28 天，`quarter` 为近 84 天，默认 `today`）和 `overview-memory` 返回总览页上每个 Bot 的数据行；把返回的 `nextCursor` 作为 `--after` 传回可以继续读取。`activity-overview` 显示每个 Bot 正在做什么，`channel-activity-today` 显示每个 Channel 今天的消息。`bot-*` 读取命令按 Bot ID 定位，通过它的私聊读取 Profile 面板：`bot-usage` 需要不晚于今天、跨度小于 182 天的 `--start`/`--end`，`bot-session-usage` 按会话和 Assignment 汇总用量，`bot-activity-history` 返回活动日历（`--weeks` 为 1–104）。`group-activity` 接受群组 Channel ID。

`bot-activity-history` 的模型行在混有未报告调用时保留已上报的 `totalTokens` 下界，并标记 `partial: true`；完全未报告时保持 `null`。严格的 `bot-usage` 查询继续保留原来的未知总计语义。

### 市场、版本更新、使用统计、Git 与配对审核

这些命令调用的 Host 方法与市场页面、更新卡片、使用统计提示、Git 提示和 IM 配对面板相同：

```bash
deepseekbot marketplace-list [--query <关键词>] [--topic <主题>] [--sort updated|stars] [--cursor <next-cursor>]
deepseekbot marketplace-topics
deepseekbot marketplace-detail <owner/repo>
deepseekbot marketplace-submit https://github.com/<owner>/<repo>
deepseekbot marketplace-report <owner/repo> [--reason <说明>]
deepseekbot release-check
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

`release-info` 包含可选的 Host 所有 `identity`：带源码 revision／dirty 的 `development`、带版本的 `release`，或带元数据／组合原因的 `unknown`。旧 Host 缺少该字段，不代表发布身份已经核实。源码内部版本占位仍为 `0.0.0`，关于页面显示源码身份。`release-check` 可返回 `unknown`，此时安装／重启以 `release-identity-invalid` 拒绝。已安装／待生效版本与运行版本分开，直到新 Host 返回精确目标版本。

`marketplace-submit` 和 `marketplace-report` 会像网页一样先完成 Host 下发的工作量证明，因此可能需要几秒；市场本身的拒绝（`repository-missing-topic`、`rate-limited` 等）作为错误码返回。举报说明最多 500 个字符。`release-check` 返回更新状态（`current`、`available`、`restart-required`、`development`、`unknown` 或 `unavailable`）。`release-install` 和 `release-restart` 必须带 `--confirm`；安装或重启失败时以非零退出，错误码为 `release-<原因>`，例如 `release-network` 或 `release-not-pending`。重启会中断所有正在运行的 Bot 回合，只在自己负责的 Host 上执行。`pairing-list` 列出 Bot 的配对请求和角色；`pairing-review` 自行读取当前版本号，期间被改动过的请求会被拒绝而不是被覆盖。对话类请求用一个 `--role` 批准，管理类请求用 `--capability` 批准。

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

Bot 名字只是标签，身份是 id。不带 operation key 时，每次创建都会生成新的 Bot，重复使用名字会返回第二个 Bot，且退出码仍为 0；稳定的在线 operation key 则核对并返回原身份。

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

## Home 与 Tob

`deepseekbot home-dashboard [--period 24h|7d|30d]` 不依赖模型，与已认证 Client 读取相同的 Home 卡片，不创建 Bot 或发送消息。默认范围为精确的过去 24 小时，`from` 包含、`to` 不包含，均为 ISO 时间戳。Attention、正在工作的 Bot、用量、最近活动分别保留不可用状态；待处理请求与未读消息分别计数。正在工作要求真实执行中的会话；最近频道按已提交消息时间排序，任务按其 Assignment owner 的更新时间排序，访问页面或修改频道资料不会改变排序。

滚动用量读取既有 Usage owner 的匿名回执，回执新增精确事件时间和可空的已上报总量。索引查询最多处理 50,001 条标量回执（50,000 条加截断探测），不读取 Session 日志；部分数据的数字只是已上报下限，`null` 表示未知。Generation 102 在已有历史统计时记录升级覆盖边界，不能把旧日桶当作精确小时统计。既有非模型核对可根据实际可信事件补全回执，不重复增加日统计；历史缺失仍为未知。普通历史丢失保留统计，显式清除 Bot 用量继续由原 owner 删除。`freshness` 单独保留重建／降级状态；Host 原有启动核对有自己的生命周期，不属于 Home 查询。`overview-usage` 的按日语义不变，此 Human 命令不会自动授予 Tob 受限 Shell 权限。Home 在进入或显式刷新时读取快照，不生成后台模型报告。

`deepseekbot tob-home` 幂等准备受保护的本地 Tob、Memory、管理 Workspace 与 DM，返回标识及权威 Attention 摘要，不发送消息。`deepseekbot home-model-set --provider <id> --model <id>` 修改原生 Host 默认模型，保留其他 Bot 的独立计划。

Tob 通过普通原生 bash／pwsh Tool 调用 `deepseekbot`；专用的 `tob_assignment_limit_read`、`tob_assignment_limit_set` Tool 及直接运行入口已移除。既有 Assignment Tools 不变。受限 CLI 流程支持下方列出的 Bot 创建／资料／生命周期、建群／邀请、群设置／成员移除、取消邀请／入群决定、频道个人偏好、模型、运行、隐私、Git 和更新操作；这是明确的允许清单，不代表开放全部 Human CLI 命令或其他 Bot 的数据。

在具备权限的 Tob Shell 执行中：

Tob 的受信任系统说明随插件打包，只注入受保护的 Tob Orchestrator；升级不会覆盖用户修改过的人格或记忆。用户只需问“你能做什么？”，Tob 会先发现当前安装版本的 CLI 能力，再用用户的语言解释可完成的事情，并提出一个具体的下一步。能力询问只读，不提交变更或审批；后续明确的修改请求仍走现有权限与审批校验。

npm Bundle 自带 core CLI 模块和产品 CLI 入口。Tob 使用 Host 注入当前 Shell 的受管执行入口，不依赖全局安装的 `deepseekbot`、源码目录或手动复制的 skill。发布校验会拒绝缺少 CLI 入口的包；运行时缺失入口则报告安装问题，不回退到其他管理通道。

```bash
deepseekbot capabilities
deepseekbot settings botharness-client
# 使用读取结果中的旧值和 revision，而不是直接照抄下面的示例数值。
printf '%s' '{"assignmentConcurrencyLimit":3}' | deepseekbot settings-set botharness-client --patch-stdin --expected-revision 12 --previous-value '{"assignmentConcurrencyLimit":8}'
```

`capabilities`（以及受限模式的 `--help`）列出支持的命令、字段、必需的审核输入和带代码的拒绝原因。读取返回 `{scope, ns, revision, value}`，`value` 只包含授权字段。写入将解析后的命名空间、旧值、新值和 revision 交给现有 Host 审批策略；审批前后和执行时重验真实 Tob root Orchestrator 与准确的已准入 Human DM 来源，随后读回 native Settings 的值。群聊／外部 IM、Bot 来源、Assignment Sessions 和调用方自报身份均不能授予此权限。

Host 将短期 loopback endpoint 与受限 token 注入这次 Shell 的子进程环境。它是短期 bearer capability，不是 Human 管理员凭据，也不构成同一 OS 用户之间的隔离边界；不要打印或持久化它。Shell 完成、取消或释放后立即撤销。不支持的命令／参数、不完整的受限上下文、指定其他 Host／token／离线 home 的尝试均会拒绝，不回退到 Human 或离线访问。`stale-setting` 要求重新读取并提案；`agent-write-uncertain`、`setting-outcome-uncertain` 和 `setting-readback-mismatch` 要求重试前先读回。上下文过期后必须发起新的 Shell 执行。

即使 Tob 正在处理 Memory 整理回合，发到其受保护私有 DM 的新 Human 消息也会建立新的执行范围。Host 将本次真实送达身份与完整已接收上下文分开固定；Memory、群聊、外部 IM 和 Bot 输入均不能建立或继承该身份。后续任何已接收输入都会撤销捕获的执行范围，只有另一条新送达的受保护 DM Human 消息可以重新建立。当前 Source Event、Message、接收 Bot 的准入记录、Session 归属和内容清除检查继续生效。澄清问题只有在原有私有问题绑定与实际 Human 回答成立、期间无其他上下文时才能续接；恢复的历史问题或自动化发起的问题不会授予管理权限。

已认证 Human 的 `settings-set` 保持原行为，新增成对的 `--expected-revision` 与 `--previous-value` 参数，用于提交已审核的 patch；后者为与 patch 字段一致的 JSON 对象。同时省略这两个参数仍使用原有先读再写流程。Tob 的删除／归档仍返回 `protected-bot`。

[UI／CLI 覆盖清单](agents/cli-ui-coverage.md) 区分既有 Human 命令和 Tob 受限访问，并跟踪后续缺口。身份与生命周期边界见 [ADR-0224](adr/0224-tob-management-uses-scoped-native-shell-cli.md)。

### Bot ZIP 文件列表与导出

```bash
deepseekbot bot-zip-files <bot-id> --host <url>
deepseekbot bot-zip-export <bot-id> --include SOUL.md --out ./selected.zip --expected-state <stateFingerprint> --host <url>
deepseekbot bot-zip-export <bot-id> --all --history --out ./full.zip --expected-state <stateFingerprint> --host <url>
```

这两个在线命令使用现有 Bot ZIP owner。文件列表只返回 Git 允许的相对路径、大小、必要的描述／展示文件和内容快照指纹，不在结果中展示文件内容或 Host Memory 绝对路径。指纹覆盖实际文件字节、Bot 资料身份和可导出的 Git refs；导出之前和完成归档后再次核对。`--include` 可重复，必须选择当前列表中的准确相对路径；必要的描述／头像等仍会纳入。`--all` 选择全部可导出文件；只有它能与 `--history` 同用。Git 忽略规则、符号链接排除和既有 ZIP 大小／文件数限制仍有效；带历史会包含历史提交中的内容。

`--out` 必须是不存在的新文件；CLI 以 `0600` 独占创建，已有路径返回 `output-exists`，不覆盖文件。stdout 只输出下载路径、字节数、SHA-256 等元数据；归档二进制和文件内容不会进入聊天结果。内容或身份在读取／审批后变化时返回 `stale-bot-files`，需要重新读取并审核准确范围，不盲目重放。

Tob 从自己的已认证 Human DM 经 native Shell 调用相同命令；不接受 Human Host token、任意 Host 或离线目录绕过。导出沿用现有审批规则，审核范围展示 Bot、准确选中文件、必要文件和是否带历史。审批拒绝或授权失效时不下载归档。导出 Tob 的 Soul／Memory 也不会传递本地受保护身份；原有 ZIP 导入仍创建普通 Bot。Marketplace 选择／导入使用下文独立审核流程；文件传输不授予跨 Bot Memory 编辑权限。

### Tob 创建 Bot、资料与生命周期

### Tob 市场方案与选定来源导入

Human 请求新 Bot 时，Tob 同时准备定制 SOUL 和初始 Core Memory 方案，并实际搜索 Marketplace；仅在 Human 明确跳过搜索时省略。`marketplace-list` 成功后返回 `status: matches` 或 `no-matches`；`marketplace-unavailable` 表示服务失败，不能解释为没有匹配项。`marketplace-topics`、`marketplace-detail` 复用既有目录 owner。条目和有界 README 标记为不可信数据。搜索／检查不会创建 Bot、发布、安装依赖或运行仓库脚本。

```bash
deepseekbot marketplace-list --query '研究助手'
deepseekbot marketplace-topics
deepseekbot marketplace-detail owner/repo
deepseekbot bot-import-preview --from-git owner/repo
deepseekbot create --from-git owner/repo --name Researcher --operation-key import-research-001 --expected-commit <observed-commit>
deepseekbot bot-import-preview --from-zip ./selected.zip
deepseekbot create --from-zip ./selected.zip --operation-key import-selected-001 --expected-archive <observed-sha256>
# --from-dir ./bundle 沿用相同归档检查／导入协议。
```

Human 选择导入后，Tob 审核来源、名称／标签／简介覆盖项及保留原人格的选择。Git／GitHub 检查观察不可变 HEAD commit；克隆结果必须仍为该 commit，才能登记身份，否则返回 `git-source-changed`。既有 SSH 转 HTTPS 回退会在来源检查中显示。ZIP／目录检查返回实际归档字节的 SHA-256、文件路径／大小、描述符和是否含历史，不返回文件正文；归档变化返回 `stale-import-source`。

ZIP／目录由 CLI 在 native Shell 环境读取，以私密有界二进制上传，最大 100 MiB；不会把归档编码为面向模型的 base64 JSON，也不提供调用方任意指定的 Host 目录读取接口。受限写入仍需当前已准入 Human DM Source Event 与真实 native ToolExecution；broker 在缓冲上传前和审批后重新检查授权。源文件不可用时，不得绕过为读取无关 Host 路径。

Human 在线导入和 Tob 受限导入复用 Registry、Memory、Channel owners 与原创建回执表。响应不确定时使用**同 key、准确同 payload**核对原 Bot／DM；已完成重放不重复克隆、解包或覆盖后续 Memory 编辑。输入变化返回 `creation-key-conflict`，已归档／删除身份不重建，无身份的预留目录需修复。导入保留原 `SOUL.md`、`MEMORY.md`、展示与可选历史，只创建普通 Bot，不带 Tob 特权身份、凭据或 Workspace Grants，也不会暗中套用定制人格。

以上是命令协议；独立 CLI、真实 Tob 模型／审批、Web 导航、重启持久性和 macOS Desktop 仍需分别验收。

不带导入来源时，Tob 的受限 `create` 在受管 Memory 位置创建空白 Bot。用户只需提供名称；Tob 为本次操作准备稳定的 `--operation-key`。可选 `--description`、重复的 `--role` 标签、`--avatar-file`、`--persona`／`--persona-stdin` 和 `--core-memory`／`--core-memory-stdin` 复用现有创建校验。仅一个内容参数可读取 stdin。初始人格和记忆写入 `SOUL.md`、`MEMORY.md`，不复制其他 Workspace Grants 或凭据。

```bash
deepseekbot create --name Translator --operation-key create-translator-001 --persona 'Translate clearly.' --core-memory 'Prefer concise explanations.'
deepseekbot show <bot-id>
deepseekbot update <bot-id> --expected-profile <profileFingerprint> --name Translator --description 'Translation assistant' --role translator
deepseekbot pause <bot-id> --expected-profile <profileFingerprint>
deepseekbot resume <bot-id> --expected-profile <profileFingerprint>
```

Host 先通过持久创建回执保留一个身份，再创建 Memory Repository 和 DM。响应丢失后重复**同一个 operation key 和同一份 payload**：已完成的回执返回原 Bot 与 DM，部分完成的操作沿用预留身份进行核对。受限模式已完成的重试走权限检查后的读取，不再申请一次创建审批。相同 key 配不同 payload 返回 `creation-key-conflict`；身份已归档或删除返回 `creation-identity-unavailable`，不会因重放而重建。`creation-memory-conflict` 表示预留目录已经存在但 Registry 身份未落地，应保留现场修复，不要删除目录或换 key 再建。回执不构成文件系统与数据库之间的原子事务，也不承诺自动修复该中断状态。

已认证 Human 的在线 `create` 同样支持 `--operation-key`，使用受管 Memory，不可同时传 `--preset` 或自定义 Memory 位置；模型计划和 Memory 迁移另行操作。Git／Zip／目录导入可配合下文已检查来源指纹使用同一回执。不传 key 保留原行为。修改其他 Bot 既有 Memory 仍为独立能力。

受限 `show` 返回 `{bot, profileFingerprint}`。每次执行 `update`、`pause`、`resume`、`bot-avatar-set`、`bot-banner-set`、`bot-appearance-set` 或 `bot-primary-color-set` 前，先读取目标，再用 `--expected-profile` 传入该指纹。展示命令保留既有文件／recipe／清除／颜色参数。指纹覆盖完整 Registry record，因此任何已记录资料字段的并发变更都会使审核快照失效。Host 在审批后、调用原 owner 前重新检查，完成后返回规范资料及新指纹。遇到 `stale-setting` 重新读取，不静默覆盖。资料更新仅包含名称、简介和标签，不包含 Workspace Grants、凭据或模型配置。Human 的在线 `update` 同样必须传入 `show` 返回的 `--expected-profile`，复用原 Host owner；不会静默刷新已过期的指纹。`--description ''` 清空简介，`--role ''` 清空全部标签。

```bash
deepseekbot bot-delete-preview <bot-id>
deepseekbot bot-delete-memory-folder <bot-id>
printf '%s' '{"token":"<preview.token>"}' | deepseekbot bot-delete-confirm <bot-id> --confirmation-stdin --confirm
# 仅在明确审核擦除 owner 展示的 Memory 目录后：
printf '%s' '{"token":"<preview.token>"}' | deepseekbot bot-delete-confirm <bot-id> --confirmation-stdin --confirm --erase-memory
deepseekbot bot-delete-retry <bot-id> --confirm
```

删除默认保留 Memory。仅在 `preview.eraseAvailable` 允许时，`--erase-memory` 才选择擦除 owner 审核过的准确目录；不接受调用方另选路径。`bot-delete-memory-folder` 返回经校验的 `{target:{path,relativePath,kind}}` 供检查，不提供任意文件系统访问。预览 token、依赖范围和路径所有权检查仍具权威性。重试沿用已接受的保留／擦除选择，不得改变选择。受限 confirm 与 retry 每次都需 Human 新作决定，full access、已记住规则和自动审批不能替代。Human 的这两个命令也新增必需的 `--confirm`，已有清理脚本需更新。Tob 自身不能归档或删除（`protected-bot`）；名称、人格文本和导入内容都不能赋予其权限。

详见 [ADR-0225](adr/0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md) 与[覆盖清单](agents/cli-ui-coverage.md#2089-bot-management-scope)。直接 CLI、真实 Tob 对话、Web 导航和 macOS Desktop 是独立验收入口，命令契约不代表这些验证已通过。

### Tob 建群与邀请

[#2090](https://github.com/BotHarness/DeepSeekBot/issues/2090) 的首个切片允许 Tob 从已准入的 Human DM 建群并加入现有 Bot。管理操作审批通过后，受邀 Bot 按既有默认值 `autoAcceptGroupInvites=true` 立即入群，无需另作邀请决定。受限 CLI 复用现有 Channel owner，不新增模型 Tool。Tob 管理其他 Bot，自身不能作为初始成员或邀请目标。

```bash
deepseekbot channels --limit 25
deepseekbot channel <channel-id>
deepseekbot group-create "研究小组" --member <bot-a> --member <bot-b> --operation-key group-research-001
deepseekbot group-create "计划" --operation-key group-planning-001
deepseekbot group-invite <channel-id> --bot <bot-c> --operation-key invite-research-001 --expected-channel <channelFingerprint>
```

受限 `channels` 返回有界频道元数据，不返回消息正文；`--limit` 为 1–100，默认 50，将返回的 `nextCursor` 传入 `--cursor` 继续读取。`channel <group-channel-id>` 返回 `{channel, channelFingerprint, invitationPolicy:{autoAccept}, wakePolicies}`，拒绝非群频道。受限投影最多保留 100 个成员、最近 100 条邀请和最近 100 条入群申请，并报告被省略的数量。这些读取不会让 Tob 加入群聊，也不把群消息变成管理指令来源。

`group-create` 支持空群，或用重复的 `--member` 指定现有可用 Bot。明确指定的初始成员直接加入，与现有 Human／UI 创建行为一致。之后的 `group-invite` 复用现有邀请 owner。默认 `autoAcceptGroupInvites=true` 时，同一事务记录已接受邀请（`respondedBy: "profile-policy"`）和成员关系，不唤醒受邀 Bot 单独决定。本片不新增设置或 UI 开关。仅当 Human 已主动关闭自动接受时，才沿用待处理邀请的原有决定流程；Tob 保留这一选择并报告实际状态。

受限建群／邀请写入必须提供稳定的 `--operation-key`：长度 8–128，以字母或数字开头，只含字母、数字、点、下划线、冒号或连字符；邀请还必须传入前一次读取的 `--expected-channel` 指纹。审核快照绑定当前频道元数据、成员、邀请策略及目标 Bot 身份；消息到达和未读计数不会使其过期。审批和执行重新检查已准入 Human DM 与当前目标状态。审核期间相关设置发生变化时，应重新读取并提案，不能悄悄刷新已批准的快照。

带 key 的结果包含 `receipt`，字段为 `operationKey`、`kind`、`channelId`、可选 `invitationId` 及完成 `status`，同时返回规范频道状态及适用的邀请。持久操作回执预留频道或邀请身份。响应不确定时，使用**相同命令、key 和 payload**重试以核对原操作，不要换新 key。已完成的受限重放读回原结果，不再次请求变更审批。输入变化、目标不可用或 Bot 身份代次变化均拒绝；重放不会重建已删除群或重复邀请。Shell／Host 重启后仍须具备当前权限；回执不保留已过期的 Shell capability。

`stale-channel` 或 `stale-profile` 要求重新读取并审核；`operation-key-conflict` 表示该 key 已绑定不同输入。`channel-operation-unavailable`、`unknown-channel`、`unknown-bot` 和 `archived-bot` 拒绝不可用身份；`protected-bot` 拒绝以 Tob 为目标。不可用邀请返回 `group-invite-unavailable`。这些失败不允许回退到其他命令或另造身份。

已认证 Human 的在线 `group-create` 和 `group-invite` 也支持稳定 operation key；邀请支持 `--expected-channel` 绑定已读取状态。这些审核／重试参数对 Human 命令可选，对受限 Tob 必需。原有不带 key 的 Human 操作保持既有 owner 行为。

后续切片加入下节所述的群名称／头像、成员唤醒设置、移除成员、取消待处理邀请和决定待处理入群申请；个人免打扰／置顶／昵称／显隐见下方个人偏好切片；删除群、附件和外部成员管理仍不在受限允许清单内。部分已有上文的 Human CLI 命令，不等于已向 Tob 开放。#2090 保留未完成范围，不因本切片关闭。详见 [ADR-0226](adr/0226-group-management-receipts-preserve-channel-authority.md) 和[覆盖清单](agents/cli-ui-coverage.md#2090-group-management-scope)。直接 CLI、真实 Tob 审批／读回、Web 成员／历史和 macOS Desktop 分别验收。

### Tob 群设置与成员移除

从已准入的 Human DM，Tob 可经现有审批修改群名称、头像和成员的普通群消息唤醒策略，或将 Bot 移出群聊。它沿用相同 Channel owner、权限和持久数据，不新增模型 Tool、数据库迁移或 UI。受限 `channel-rename` 仅接受群频道，不能通过此命令重命名 Bot 私聊。

```bash
deepseekbot group-wake-policies <channel-id>
deepseekbot channel-rename <channel-id> --name "产品研究" --expected-channel <channelFingerprint>
deepseekbot group-avatar-set <channel-id> --avatar-file ./avatar.png --expected-channel <channelFingerprint>
deepseekbot group-avatar-set <channel-id> --clear --expected-channel <channelFingerprint>
deepseekbot group-wake-set <channel-id> --bot <bot-id> --mode digest --count 5 --interval 30 --expected-channel <channelFingerprint>
deepseekbot group-wake-set <channel-id> --bot <bot-id> --inherit --expected-channel <channelFingerprint>
deepseekbot group-member-remove <channel-id> --bot <bot-id> --expected-channel <channelFingerprint>
```

`group-wake-policies` 返回当前群快照、`channelFingerprint`，以及每个成员的 `{botSlug, inherited, policy}`。指纹包含有效唤醒策略，包括从 Bot 继承的默认值；默认值变化也会使旧审核过期。消息到达和未读变化不会使审核过期。受限头像读取／审批仅展示存在状态、类型、大小及摘要，不展开图像数据。

这些写入都必须传入刚读取的 `--expected-channel`；每次成功修改后重新读取，再准备下一次修改。群名为非空文本，最多 120 个字符；头像使用上述有界 PNG／JPEG／WebP 或 `--clear`。唤醒模式为 `all`、`mentions`、`digest`、`silent`；`--count` 为 1–100，`--interval` 为 1–3600 秒，默认 5／30；`--inherit` 移除该群覆盖并恢复 Bot 默认值。移除成员保留 Bot 身份、Memory、其他频道与该群历史；若被移除的是群 owner，清除其群管理身份，群改由 Human 管理。可移除已归档的现有成员；修改唤醒策略要求目标 Bot 活跃。

审批绑定旧状态、准确目标及新值，执行前重验当前 Human 的群访问权限和目标 Bot 身份。已拒绝／过期审批、Human 已离群、非群目标、目标非成员、身份被替换均拒绝，不绕过检查；Tob 仍不能入群。`stale-channel`／`stale-profile` 要求重新读取和审核，不自动覆盖并发修改。

这些编辑不接受 `--operation-key`，不新增重放回执。结果不确定时，先用 `channel`／`group-wake-policies` 核对实际状态，不能盲目重试；仍需修改时按最新快照重新提案。原建群／邀请回执和默认自动入群行为不变。已认证 Human 的对应在线命令可选 `--expected-channel`，省略时保留现有行为；这不放宽 Tob 的必需输入。#2090 仍保留未交付范围；命令说明不是 Web、真实模型或 macOS 验收通过的证据。

### Tob 取消邀请与入群决定

Tob 可从已准入的 Human DM，经现有审批取消一条**待处理**群邀请，或接受／拒绝一条**待处理**入群申请。先用 `channel <channel-id>` 读取准确的邀请／申请 ID、状态及 `channelFingerprint`，再提出对应操作：

```bash
deepseekbot channel <channel-id>
deepseekbot group-invite-cancel <channel-id> --invitation <invitation-id> --expected-channel <channelFingerprint>
deepseekbot group-join-decide <channel-id> --request <request-id> --accept --expected-channel <channelFingerprint>
deepseekbot group-join-decide <channel-id> --request <request-id> --decline --expected-channel <channelFingerprint>
```

受限命令必须提供已读取的 `--expected-channel`；入群决定必须且只能选择 `--accept` 或 `--decline`。审批绑定当前群快照、准确的待处理记录、目标 Bot 身份代次和所选决定。执行前重验已准入 Human DM、当前 Human 群成员资格、指纹、目标身份和记录仍待处理。拒绝／过期审批、Human 已离群、并发决定、目标被替换或已失效均不能继续变更，也不自动更新已批准的输入。

`unknown-invitation`／`unknown-join-request` 拒绝不存在的记录，`invitation-not-pending`／`join-request-not-pending` 拒绝已结束的目标；`stale-channel`／`stale-profile` 要求重新读取并审核。这些拒绝不允许自动换目标或改用其他动作。

默认 `autoAcceptGroupInvites=true` 不变：受邀 Bot 通常已经立即入群，不能用取消邀请撤销已接受的邀请，也不会因此移除现有成员。取消仅适用于尚待处理的邀请，例如 Human 先前关闭自动接受后产生的邀请。需要移除已入群 Bot 时，另行使用经审核的 `group-member-remove`；不要把取消失败回退成移除。

接受申请由原 Channel owner 持久保存成员关系与接受状态，拒绝则不增加成员；既有决定通知只记录一次。Tob 不加入群，也不把群内容当作管理授权来源。此切片复用原状态与通知流程，不增加模型 Tool、数据库迁移或操作回执。

已认证 Human 的同名在线命令可选 `--expected-channel`；`group-join-decide` 省略时保留既有的同向已完成决定幂等读回。Tob 的受限入口仅接受待处理记录，不能通过省略指纹或重复终态决定绕过新审核。结果不确定时先读回准确记录的状态与成员关系；若仍待处理且需要继续，再基于新快照提案，不盲目重试。个人偏好见下一节；整群删除与外部成员能力仍另行交付，#2090 不因本片关闭。

### Tob 频道个人偏好

Tob 可从已准入的 Human DM，经现有审批修改当前 Human 对某个频道的免打扰、置顶、隐藏状态或 **Human Channel nickname（频道内我的昵称）**。先读取个人偏好快照，再把返回的 `stateFingerprint` 作为 `--expected-state` 传给对应写入：

```bash
deepseekbot channel-preferences <channel-id>
deepseekbot channel-mute <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-mute <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-pin <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-pin <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-hide <channel-id> --expected-state <stateFingerprint>
deepseekbot channel-hide <channel-id> --off --expected-state <stateFingerprint>
deepseekbot channel-human-name-set <channel-id> --nickname "老板" --expected-state <stateFingerprint>
deepseekbot channel-human-name-set <channel-id> --clear --expected-state <stateFingerprint>
```

`channel-preferences` 返回 `{channel:{id,type,name,botSlug?}, scope:"human-channel", humanId, muted, pinned, hidden, nickname, stateFingerprint}`。目标必须是当前本地 Human 参与的普通 Bot DM 或 Group Channel；没有昵称覆盖时 `nickname` 为 `null`。

这是当前 Host Profile 内稳定 Human 身份与准确频道的偏好，不是按显示名匹配用户，也不是某个浏览器标签页或设备的本地布局。连接同一 Host Profile 的客户端读取同一份规范偏好。昵称改变的是 Human 在该频道的称呼，不改 Bot 名称、频道名称或 Human ID。昵称会去除首尾空白，最多 128 个字符，不能包含控制字符或换行；`--clear` 恢复继承 Human 默认显示名。

不带 `--off` 的免打扰／置顶／隐藏命令设为开启，带 `--off` 则关闭。隐藏只影响频道列表展示，不删除频道、消息或成员关系；仍可用准确 ID 读取 `channel-preferences` 并执行 `channel-hide --off` 恢复。单频道置顶／隐藏操作保留其他频道的已有偏好，不用整体替换列表的命令代替。免打扰不等于停止 Bot 或更改群成员唤醒策略。

指纹绑定目标频道身份代次、本地 Human 身份、该频道四项个人偏好，以及 Bot DM 的 Bot 身份代次。其他频道的修改不会使本快照过期，也不会被本次单频道操作覆盖。

受限写入必须携带观察到的 `--expected-state`；`stale-channel-preferences` 要求重新读取并审核。审批绑定旧值、目标和新值；执行时重验当前 Human 的频道权限与快照。并发修改、权限撤销或过期／拒绝审批不得被静默覆盖。成功后返回规范读回状态；继续修改前重新读取，结果不确定时先核对实际状态，不盲目重试。Tob 仍通过现有受限 Shell CLI 与审批路径执行，不新增专用 Tool。

免打扰、置顶、显隐沿用 `RosterStore`，频道内 Human 昵称沿用 `ChannelStore`；没有第二份偏好库。已认证 Human 的在线写入可选 `--expected-state`，Tob 必需；已有离线昵称命令不是受限 Tob 的绕过路径。这些命令只扩展个人偏好范围，不授予整体布局、所有设置或删除群能力。直接 CLI、真实 Tob 审批／读回、Web 和 macOS Desktop 仍需分别验收。

### Tob 模型与运行设置

在 Tob 具备权限的 Shell 执行中使用 `deepseekbot capabilities` 查看当前命令。下列命令复用已有 Host owner；写入仍须满足已准入 Human DM 和现有审核策略。

```bash
deepseekbot list
deepseekbot model-catalog
deepseekbot model-plan <bot-id>
deepseekbot model-presets
deepseekbot settings

deepseekbot home-model-set --provider <provider-id> --model <model-id> [--orchestrator-effort <effort>] --expected-revision <default-revision>
deepseekbot model-plan-customize <bot-id> --orchestrator-provider <provider-id> --orchestrator-model <model-id> --expected-revision <plan-revision>
deepseekbot model-plan-inherit <bot-id> --expected-revision <plan-revision>
# 完整计划 JSON：orchestrator、assignmentDefault、assignmentModels。
deepseekbot model-plan-set <bot-id> --plan-stdin --expected-revision <plan-revision> < plan.json
# 仅 Assignment 的 JSON 省略 orchestrator；Bot 必须已经有独立计划。
deepseekbot model-plan-assignments-set <bot-id> --plan-stdin --expected-revision <plan-revision> < assignments.json
deepseekbot model-preset-apply <bot-id> --preset <preset-id> --expected-revision <plan-revision> --preset-revision <preset-revision>
```

`model-catalog` 返回可用模型及 `default`／`defaultRevision`；读取 model-plan 返回 Bot 计划的 revision。修改 Host 默认模型保留其他 Bot 的独立配置。Customize 修改 Orchestrator 并保留 Assignment 选择；inherit 让 Bot 恢复跟随 Host 默认值。Host 在准备操作和执行前均检查模型可用性：不可用路由返回 `model-unavailable`，已审核 revision 发生变化返回 `stale-setting`。需要修复的旧计划返回 `legacy-model-repair-required`，不会静默重写。凭据配置仍使用原生私密输入和既有凭据界面；Tob 只获取目录／就绪状态，不获取密钥值。

预设的创建、读取、更新和应用复用既有 preset owner。受限 `model-preset-create --name <name>` 与 `model-preset-update <preset-id> --name <name> --expected-revision <revision>` 必须显式提供 `--orchestrator-provider`、`--orchestrator-model`、`--assignment-provider`、`--assignment-model`；可选 effort 参数和包含 `{"assignmentModels":[...]}` 的 `--plan-stdin` 沿用既有格式。受限更新要求完整的目标名称与模型路由，Human 命令仍可局部更新。应用预设同时校验 Bot 和 preset revision。当前没有预设删除 owner 或命令，本片不新增删除操作，也不宣称完整 preset CRUD。

`settings` 列出支持的命名空间；`settings botharness-client` 返回以下实时运行及消息显示字段：

| 字段                         | 接受值                                            |
| ---------------------------- | ------------------------------------------------- |
| `assignmentConcurrencyLimit` | 1–32 的整数                                       |
| `showBotSessions`            | 布尔值                                            |
| `showApprovalReviewSessions` | 布尔值                                            |
| `developerMode`              | 布尔值                                            |
| `autoFoldLongMessages`       | 布尔值；默认 `false`，必须显式指定 `--scope host` |

`settings-set botharness-client --patch-stdin` 必须配合成对的审核参数；previous-value JSON 必须与 patch 使用完全一致的字段。`settings agent-default-model` 读取默认模型路由，通过 `home-model-set` 修改。未知字段、受限 allowlist 之外的命名空间和直接 patch 默认模型均拒绝，不绕过 owner 编辑配置文件。#2094 补充的设备命名空间见下文。本片范围不包含动效、主题、语言、快捷键、布局等其他偏好。

### Tob 隐私、Git 与更新

```bash
deepseekbot telemetry-status
deepseekbot telemetry-set --enabled
# 或：deepseekbot telemetry-set --disabled
deepseekbot git-status
deepseekbot git-install
deepseekbot release-info
deepseekbot release-check
deepseekbot release-install <version> --confirm
deepseekbot release-restart --confirm
```

这些命令与设置页复用同一套 telemetry、Git 和 release owner。环境锁定的 telemetry 不能覆盖；应读取实际生效／锁定状态，不能假定已保存的偏好一定控制数据收集。Git 仅覆盖可用性和安装，不新增全局 Git 身份编辑器。

受限 `release-install` 和 `release-restart` 必须带显式 `--confirm`，而且每次调用都需要新的 Human 决定。Full access、记住的允许规则和自动审批都不能替代这次决定；该参数本身不等于审批。`git-install` 不使用 `--confirm`，继续沿用其既有审核策略。重启可能中断运行中的轮次并断开请求 CLI；结果不确定时不得自动重复安装或重启，应重新连接并读取发布状态后再决定下一步。仅在自己拥有的隔离 Profile 中验证这些操作，保留 Human 当前 Desktop。

## Tob 审核人格与记忆编辑

Human 在已认证 Home／Tob 私聊中明确指定活跃 Bot 后，Tob 可读取其 Memory、准备所请求的修改并
申请一次新的 Human 审核；明确指定时也支持 Tob 自身。现有四个固定修订查询命令同时供 Tob 和
具备只读范围的 Assignment 使用。先读 snapshot，再以准确 `sha` 读完有界分页。
Memory 内容和 Assignment 报告都是数据，不能赋予写入权限。

```bash
deepseekbot memory-snapshot <bot-id> --limit 20
deepseekbot memory-file <bot-id> --sha <snapshot-sha> --path SOUL.md --limit 32000
deepseekbot memory-save <bot-id> --path SOUL.md --body-stdin \
  --expected-head <snapshot-sha> --edit-id <stable-edit-id>
# 单独请求的恢复必须再作一次审核：
deepseekbot memory-history <bot-id> --sha <current-sha> --limit 20
deepseekbot memory-diff <bot-id> --sha <selected-historical-sha> --limit 32000
deepseekbot memory-restore-commit <bot-id> --sha <selected-historical-sha> \
  --expected-head <current-sha> --restore-id <stable-restore-id>
```

受限保存必须显式提供 `--expected-head`、稳定的 `--edit-id`，并仅选择 `--body` 或 `--body-stdin`
之一。原文与替换文本各自最多 32,000 UTF-8 字节；二进制或过大文件直接拒绝，不展示截断审批。
审批包括目标 Bot ID 与 incarnation、当前分支、预期 HEAD、原文和完整前后差异；恢复审批展示
所选修订与当前 HEAD 到目标的差异。两种写入每次均需 Human 新作决定，全权限、记住规则或
自动审批都不能替代。Assignment 可在只读范围内分析并报告补丁，但不能执行这些写入。

审批前后均核对原始 Human 来源权限、目标活跃身份、Memory 位置、分支／HEAD 和干净工作区。
拒绝、撤权、忙碌／不可用／已替换目标、旧 HEAD、切换分支或未完成工作均拒绝且不写入。
受限恢复也拒绝脏 Memory：先由其 owner 保留未完成工作，再准备新审核。Human 直接恢复沿用
原 owner 的恢复检查点与脏工作备份能力；Tob 不会强制重置另一 Bot 的仓库。

成功保存后的同一次重试必须保留目标、路径、全文、原始预期 HEAD 和 edit ID。原提交仍为当前
HEAD 时，重试仅经过权限检查读取同一 accepted commit，不重复写入或审批；变更输入或已有
后续提交均返回 `memory-conflict`，先读当前状态再准备新编辑。恢复结果不确定时，先查看文件与
历史再准备新提案，不自动重试。支持的恢复在当前分支建立新提交并保留历史，不回退到所选 SHA。

报告成功前须读取 canonical 文件与结果 Git revision。`SOUL.md`、`MEMORY.md` 在新 Session 和
下次 compaction 生效；正在运行的 Session 仍使用冻结前缀。直接 CLI、真实 Tob、Web 渲染和
macOS Desktop 应分别验证。

Tob 在自己的 prepared turn 内自编辑，还须准确匹配该 turn 的 owner Orchestrator、干净分支和
已 accepted 的 HEAD。初始化提交尚 pending 的首个 turn 因此可能安全拒绝；待正常 turn 完成后
重新读取基线。Assignment 或其他活跃 Orchestrator 不能借用此内部 owner 上下文。

## Tob Assignment Memory 只读查询

Human 在 Tob 私聊明确要求比较选定 Bot 的 Memory 时，Tob 先运行 `deepseekbot capabilities`，
再通过当前 Shell 的受限 CLI 创建只读比较 Assignment。Session 仍归 Tob；工作目录只使用一个
Tob 已授权且有效的 Workspace Grant，拒绝整个 Bot 数据目录或 Memory Repository。

```bash
deepseekbot assignment-memory-create "比较选定 Bot 的 Memory，并引用来源" \
  --grant <Tob-workspace-grant-id> --member <bot-a-id> --member <bot-b-id> \
  --operation-key <stable-operation-key>
```

创建沿用现有审核策略。响应不确定时保留操作键和完全相同的参数，Host 返回同一个 Assignment。
可用 `--key` 保留 Continuity Key；已有占用者时创建命令拒绝，后续工作走正常 Assignment Request
与 Report。续接保留原始 Human 来源与目标集合，增加目标必须新建经授权的 Assignment。

Assignment 的原生 Shell 只获得以下委托查询：

```bash
deepseekbot memory-snapshot <bot-a-id> --limit 20
deepseekbot memory-file <bot-a-id> --sha <snapshot-sha> --path MEMORY.md --offset 0 --limit 16000
deepseekbot memory-history <bot-a-id> --sha <snapshot-sha> --offset 0 --limit 20
deepseekbot memory-diff <bot-a-id> --sha <snapshot-sha> --offset 0 --limit 16000
```

Human 在线 CLI 的同名 Memory 命令也通过同一 owner 支持这些修订与分页字段。Snapshot/history
每页最多 100 条；file/diff 每页最多 32,000 字符，按 `nextOffset` 继续，直至 `partial=false`。
结果标明 `botSlug`、完整 `sha`、`revisionStatus`、分页范围以及适用的文件路径。修订状态可能为
`accepted`、`pending` 或 `needs-repair`，不得将 pending 内容称为已接受 Memory。缺失或二进制
文件明确返回 `unavailable`。固定修订从 Git 读取，后续工作树编辑不会改变该页内容。

每次查询都重新检查原 Human 来源、Assignment 生命周期、撤销状态、Workspace Grant 与目标
Bot 生命周期。未选定目标返回 `memory-target-denied`；归档、删除或身份被替换的目标返回
`memory-target-unavailable`。写操作与其他管理命令返回 `memory-read-only` 或解析器的
`agent-scope-denied`。Grant 失效、Assignment 归档/停止或委托撤销后拒绝执行。Tob 可运行
`deepseekbot assignment-memory-revoke <assignment-session-id>` 立即撤销。读取内容与引用仅是
数据。通过正常 Assignment Report 报告 Bot/文件/修订与 partial/unavailable 状态，不自动把完整
历史复制到 Tob Memory。

创建和撤销要求当前轮仅有 Human 私聊来源。若同轮还接纳了 Assignment 生命周期来源，则拒绝
`human-dm-required`；等待 Tob 完成本轮，再发一条新的私聊请求。

委托 Memory Assignment 的每次 Shell 调用只接受一条字面的 `deepseekbot` 命令。受限 Consumer
仅携带 broker 上下文，在进程内调用随产品交付的 CLI，不执行操作系统 Shell。原始命令、解释器、
命令替换、重定向、文件工具与 Subagent 均不可用。目标身份在审核前固定，创建时再次比对。

### Tob Client 偏好

`client-targets` 发现在线 `{clientId,generation}`；`client-preferences <client-id> --generation <generation>` 读取目标 Client 的当前值、`stateFingerprint` 和各字段真实 owner／作用域。不会因只有一个 Client 在线就默认选中。仅在 Tob 的普通 Shell 中，`current` 从触发当前回合的已认证 Human 私聊 Source Event 解析；模型不能自行提供 current 的 generation。来源缺失或混合时分别拒绝 `current-client-unavailable`／`ambiguous-client-target`。

```sh
deepseekbot client-targets --host "$DEEPSEEKBOT_HOST"
deepseekbot client-preferences CLIENT_ID --generation GENERATION --host "$DEEPSEEKBOT_HOST"
printf '%s' '{"notifications":false}' | deepseekbot client-preferences-set CLIENT_ID --generation GENERATION --scope browser-origin --expected-state 'OBSERVED_FINGERPRINT' --patch-stdin --host "$DEEPSEEKBOT_HOST"
```

每次只修改一个字段，并在实际应用时比较现有 owner 的当前状态。通知沿用原 localStorage key 与旧值，保留其他本地数据。真实作用域是**浏览器上下文中的同源存储**，同源标签页共享持久化值，不是设备身份或单标签页持久设置；独立浏览器上下文保持隔离。`notifications:true` 只有在真实权限已经为 `granted` 时才启用，否则返回 `permission-pending`、`permission-denied` 或 `permission-unsupported` 与 `changed:false`。`{"notificationPermission":"request"}` 返回当前权限，待授权时引导 Human 使用既有“设置 → 通知”开关。CLI 不伪造用户手势或系统授权。

| UI 控件                                                     | 现有 owner 与作用域                                       | CLI 路径                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 浅色／深色／跟随系统                                        | 原生 `ui-theme.preference`，Host／Profile 用户设置        | `settings ui-theme`，然后经审核的 `settings-set ui-theme --scope host`                                                                |
| 中文／英文                                                  | 原生 `locale.preference`，Host／Profile 用户设置          | `settings locale`，然后经审核的 `settings-set locale --scope host`                                                                    |
| 动效：system／reduce／full                                  | `botharness-client.motionPreference`，Host／Profile       | `settings`／`settings-set botharness-client --scope host`                                                                             |
| Bot 图标：mascot／simple／blob／bot                         | `botharness-client.botIcon`，Host／Profile                | 同一 settings 路径                                                                                                                    |
| 发送键：enter／shift-enter／mod-enter                       | `botharness-client.sendKey`，Host／Profile                | 同一 settings 路径                                                                                                                    |
| 自动折叠长消息（默认关闭）                                  | `botharness-client.autoFoldLongMessages`，Host／Profile   | 同一 settings 路径；经审核的 `settings-set botharness-client --scope host`                                                            |
| 自动接受群邀请                                              | `botharness-client.autoAcceptGroupInvites`，Host／Profile | 同一 settings 路径                                                                                                                    |
| Human 默认名称                                              | 现有 Human identity owner，本地 Human／Profile            | `human-name`；受限命令 `human-name-set (--name TEXT                                                                                   | --clear) --expected-state FINGERPRINT` |
| IM 默认收集、唤醒、阈值、身份启用、微信输入状态及新会话策略 | 现有 messaging owner，Host／Profile 内按平台              | `messaging-defaults PLATFORM`；`messaging-defaults-set PLATFORM --input-stdin`，使用观察到的 `expectedRevision` 与既有完整输入 schema |
| 桌面通知                                                    | 选中 Client 的现有同源浏览器 owner；权限归 Human／OS      | `client-preferences`／`client-preferences-set`                                                                                        |

原生 DSH `0.2.0-rc.2` 的**主题和语言均保存在 Host 用户设置文档中**，不会因 UI 位于 Client 就变为本地设置。其修改影响所有已连接 Client，Tob 必须显式传 `--scope host`。先读取 revision 与旧字段值，向 Human 说明共享影响，再沿用 `--expected-revision`、`--previous-value`、`--patch-stdin` 的审核。`client-preferences-set` 对主题／语言拒绝 `host-scope-required`，不创建第二份本地覆盖。Human 若要求只改当前 Client，Tob 必须先澄清作用域，才能提出共享修改；其他字段与并发 UI 编辑继续受原生 revision 保护。

补充覆盖清单仍把本地文件打开方式、输入框 footer 和 DM trace 展示记录为本切片不可用；`client-preferences-set` 对这些字段拒绝 `unsupported-client-preference`。连接的 Web Client 不具备的原生通知控制保持 unsupported，存储成功不证明系统通知已送达。布局与快捷键属于独立切片。

`no-connected-client`、`unknown-client-target`、`client-target-stale`、`client-target-replaced` 区分无在线目标、未知目标、过期租约与已替换实例。刷新保留标签页 id，但替换 generation。未派发请求超时返回 `client-unresponsive`；已派发写入未确认完成返回 `client-outcome-uncertain`，必须重新读取 owner 进行核对，不能盲目重试。待执行命令有界、仅存于进程内，Host 重启后不重放；偏好继续由选中 Client 的现有 owner 持久化。

通知 owner 在读回／比较前刷新真实同源存储，并通过 storage 事件同步其他标签页。浏览器支持 Web Locks 时，UI 与 CLI 都通过同一个 owner 锁写入；CLI 在锁内再次核对状态和 Host 来源授权。缺少 Web Locks 时受限修改拒绝 client-concurrency-unavailable，普通 UI 仍可使用。原生连接 Provider 的认证 HTTP 请求共享 OperatorPeer；私有 mount／tab-owner proof 提供 Client 实例隔离，不能把 Peer id 当作浏览器身份。

### 指定 Client 的布局

`client-layout CLIENT_ID --generation GENERATION` 读取已挂载的 Bot 模式 Workspace owner：当前 `channelId`、稳定面板 ID 与可用性、全局与停放几何、控制项顺序／显示、间距、各 Channel 分割树及 SHA-256 `stateFingerprint`。窄屏没有该 owner 时明确拒绝；不会为了修改而切换 Channel。仅 Tob 的已认证 Human 私聊来源可以使用 `current`。

通过 `client-layout-set CLIENT_ID --generation GENERATION --scope browser-origin --expected-state FINGERPRINT --patch-stdin` 提交一条 JSON 修改：

| `type`          | 字段                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `gap`           | 整数 `gap`：0–16                                                                         |
| `rail-order`    | 不重复的稳定面板 ID 数组 `order`                                                         |
| `rail-location` | `before`：left、right 或发现的 Dockview 列组 ID                                          |
| `control`       | `panel`、`visible`；Channel 子面板须传 `channelId`                                       |
| `visibility`    | `panel`、`open`；Channel 子面板须传 `channelId`                                          |
| `move`          | `panel`、`target`、`direction`（left/right/above/below）；Channel 子面板须传 `channelId` |
| `size`          | 全局 `panel`、`width`、`height`：0.05–1 的比例                                           |
| `child-resize`  | `channelId`、二进制分割 `path`（根为空字符串）、`ratio`：0.2–0.8                         |
| `child-axis`    | `channelId`、`path`、`axis`（horizontal/vertical）                                       |

Channel 移动以叶节点为目标，`messages` 是固定内容叶；隐藏子面板保留分割树及百分比。全局移动要求源与目标在可见的独立面板组；不支持的组合拓扑、隐藏目标与不适用的 Bot 子面板均返回明确拒绝。应用时必须仍处于指定 Channel。既有 v1–v8 迁移及备份继续由布局 owner 负责。不可读／更高版本存储拒绝并要求恢复；保存失败返回 `client-outcome-uncertain`，再次修改前须重新读取。同源标签页共享持久化，精确运行代次选择实际执行的 owner。原生重启、实体几何与 UI 证据仍须单独验证。

同源其他标签页替换布局存储后，旧 owner 拒绝 `stale-client-layout` 并停止保存，重载后再操作，保留其他标签页已接受的状态。

### 指定 Client 的快捷键

`client-shortcuts CLIENT_ID --generation GENERATION` 发现可定制的稳定面板命令 ID、七个 `botharness.navigation.*` 动作 ID、当前有效绑定、固定命令、原生配置 revision 和精确 `web|desktop:macos|windows|linux` profile。Alt+1…0 的 Channel 选择保持固定，不随控制栏顺序重新编号。

通过 `client-shortcuts-set CLIENT_ID --generation GENERATION --scope client-profile --expected-state FINGERPRINT --patch-stdin` 提交 `{ "profile":"web:macos", "id":"DISCOVERED_ID", "type":"set", "binding":{"code":"KeyJ","modifiers":["primary","alt","shift"]} }`。使用不带 `binding` 的 `"type":"disable"` 显式禁用，或 `"type":"reset"` 仅恢复该动作。原生面板组合保留已有的可选 `secondCode`；导航动作沿用单键及 primary／Alt／Shift 限制。

必须匹配目标 profile。面板修改把读取到的原生 revision 交给 Settings、提示文字与按键派发共用的原生 owner；导航修改复用现有 owner 和存储键，将旧覆盖迁入保留其他 profile 的记录，null 禁用重载后仍有效。保留键或冲突返回 `outcome:refused`、原因、冲突稳定 ID 及未变更的有效目录，不抢占已有绑定，也不重置全部配置。导航保存失败保留已接受绑定并明确拒绝，原生 revision／冲突拒绝继续由原生 owner 分类。调用原生保存前重新核对授权、Client 生命周期和已审阅状态；原生 owner 在串行队列中、写入前再次比较 revision。请求交给原生 owner 后不能取消保存：回复丢失、Client 生命周期结束或写入失败返回 `client-outcome-uncertain`。重新发现在线 Client 并读取 `client-shortcuts` 后再提出修改，不得自动重放写入。实体按键、输入框／弹窗／IME、Web 重载与 macOS 重启须分别验证。

### Tob 授权、审批与连接器策略

在合格的 Tob Human-DM Shell 中，已有策略命令返回 `{value, stateFingerprint, result?}`。先读对应 owner，再用 `--expected-state` 携带指纹提交修改。每次策略写入（包括缩小权限）都必须由 Human 新作决定；Full access、记住规则与自动审核模型不能代替。审批卡展示准确目标、旧状态和变更。执行时重验来源与策略，完成后返回规范读回。指纹过期返回 `stale-policy`，必须重新读取再提议；`policy-outcome-uncertain` 或 `agent-write-uncertain` 不得盲目重试。

| 先读                                                                                            | Tob 可使用的已有写入                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grants <bot>`                                                                                  | `grant-create --workspace <id>`；`grant-write-set --grant <id>` 配合 `--enabled` 或 `--disabled`；`grant-revoke --grant <id> --confirm`                               |
| `access <bot>`                                                                                  | `access-set --mode` 配合 `workspace-write` 或 `danger-full-access`；可选 `--scope chat` 或 `--scope assignments` 以及 `--acknowledge-risk`；Browser/Computer 访问开关 |
| `approval-templates`                                                                            | `approval-template-set <bot> <name>` 或 `off`；模板创建／编辑经 `--text-stdin`，复制经 `--from`，删除带 `--confirm`                                                   |
| `tool-approval-rules <bot>`                                                                     | `tool-approval-rule-revoke <bot> --rule <id> --confirm`                                                                                                               |
| `approval-reviewer-model`                                                                       | `approval-reviewer-model-set <provider/model>` 或 `bot`；可选 `--effort <effort>`                                                                                     |
| `messaging-defaults <platform>`                                                                 | `messaging-defaults-set <platform> --input-stdin`                                                                                                                     |
| `messaging-grants <bot>`、`pairing-list <bot>`、`approval-routes <bot>`、`failure-alerts <bot>` | 既有配对决定、授权／撤销、接收、Channel 目标、群组／线程接收和唤醒策略、会话／发送者策略、主动发送限制、审批路由和失败提醒                                            |
| `channel-bridges <channel>`                                                                     | `channel-bridge <channel> --input-stdin [--confirm]`                                                                                                                  |

`workspace-options`、`approval-template-show`、`messaging-targets` 与 `im-apps` 用于只读发现，准确参数见 `capabilities`。Provider 缺失仍是缺失，不能伪装成本地成功。`access` 包含 Browser/Computer 能力开关；改变开关不启动运行时、不配对 Human 浏览器，也不授予系统权限。`workspace-write` 的实际 scope 沿用已有 owner。

Browser/Computer 原生 UI 字段继续走 `settings` 与 `settings-set --patch-stdin --expected-revision <n> --previous-value <json>`，且强制 Human 审阅。`botharness-browser` 只开放 `target`、`localDriver`、`containerDriver`；`botharness-computer` 只开放 `target`、`idleStopMinutes`（1–1440）、`exportDir`（空值／默认或绝对路径）、`autoAllowActions`。Provider 可用、运行时就绪与系统授权分别检查。

应用 token、凭据和验证码保留在已认证 Human 的原有 CLI stdin／私密输入流程（`im-app-add`、`im-credentials`、`im-verify`）及原生配置 UI。Tob 可通过 `im-apps` 检查应用／配置能力，但不能通过此 broker 提交秘密或猜测 Provider 配置接口。外部发送、测试／重试投递及 `tool-approval-decide` 不在策略 allowlist；能列出其他 Bot 的审批不等于有权回答。

对当前可用的合格飞书／微信 Provider，Tob 可在 Human 新作决定后执行 `im-authorize <platform> --expected-state <im-apps stateFingerprint>`，只收到所属的不透明收据、平台、状态和有效期。`pairing-status <receipt-id>` 查询原 Provider 尝试；`im-cancel <receipt-id> --expected-state <状态指纹>` 在审核后重验状态并取消。未知收据、owner／平台变化、过期与旧审核均拒绝；已完成配置的原生账号不会被取消命令删除。结果不确定不自动重试；同平台已有待处理尝试时先继续或取消。

在 **Bot 设置 → 应用**，选择对应平台／有效期行的 **继续配置**，选择 Bot 后进入既有私密表单。Human 专用 owner 查询与 Client 接续只 poll 同一个原生尝试，不再次 `setup.start`；二维码、凭据和验证码仍仅在已认证表单内处理。Tob 不收到原生 attempt id、二维码、token、Provider 指令文字或原始错误。Human CLI 的 `im-setup-receipts`、`im-setup-resume <receipt-id>` 检查同一 owner／接续路径且不输出私密配置产物；Tob broker 不开放这两个命令。引用只在当前进程内有效，随原 Provider 尝试过期或 Host 重启消失；配置与原生凭据权威仍属于 Provider。

Human CLI 补齐 Browser 控制路由：`browser-profile-pair`／`browser-profile-forget` 无 Bot 参数；`browser-daily-connect`、`browser-daily-grant`、`browser-daily-return`、`browser-borrow-pair`、`browser-borrow-return` 带一个 Bot 参数。均需 `--confirm`，复用已有配对／控制 owner，保留 Human 浏览器与系统授权步骤；这些命令不授予 Tob 受限策略权限。直接 CLI、真实 Tob 审批／拒绝／读回、Web 显示、macOS Desktop 与真实外部投递分别验收。

## 已配对设备

`deepseekbot devices` 返回 Host、当前路由诊断和已配对设备，不含凭据。每台设备的 `identity` 指纹覆盖稳定 id、名称、配对时间和撤销状态。`device-routes` 读取同一管理模块，不修改 Tailscale、不发布隧道；`ready: false`、`serve-missing`、`serve-other-target`、Tailscale 停止或未安装均保留为明确结果。

```sh
deepseekbot devices
deepseekbot device-routes
deepseekbot device-offer --out /private/local-folder/new-pairing.json
deepseekbot device-offer-status <receipt-id>
deepseekbot device-revoke <device-id> --expected-device <devices返回的identity> --confirm
```

直接创建邀请时，命令以独占方式新建权限为 0600 的本地文件，仅在该文件写入配对链接和过期时间。请选择受保护的本地目录，切勿把文件粘贴到聊天或 Session。普通 JSON 只返回收据、过期时间、可达性及交接状态；已有文件不会被覆盖。文件内是五分钟有效的一次性邀请，不含操作员 token 或设备凭据。Windows 原生私有文件 ACL 仍需单独验证，请在那里使用人工 Devices 界面。

在 Tob 的已认证私信内，通过普通 Shell 调用同名命令，复用现有受限代理。`device-offer` 不接受 `--out`：审批后只返回安全收据，请人工打开「设置 → 设备 → 配对手机」。人工对话框会复用最新且仍待配对的邀请，链接仅进入人工界面。创建邀请和撤销设备沿用现有审批策略并重新验证人工来源；受限 CLI 拒绝本地文件输出、Host 凭据和权限覆盖。这些命令不代表任意执行授权。

收据状态包括 `pending`、`redeemed`（附设备 id）、`expired`、`unknown`。邀请和有界收据历史仅在当前进程保留：重启、容量淘汰或超出保留窗口会返回 `unknown`，不能据此认定已配对；重试前用 `devices` 核对。已配对设备继续由现有持久化模块管理，跨 Host 重启保留。

撤销必须携带已审阅的身份指纹和明确确认。Host 在撤销前重新核对身份；变化返回 `stale-device`，设备不存在返回 `device-unknown`，身份匹配且已撤销返回 `alreadyRevoked`。撤销会关闭设备的现有流，并由同一监听器上的设备网关拒绝后续请求。直接 CLI 使用现有认证管理路由，Tob 则在原有来源和审批校验后调用同一管理模块。授权协议测试客户端仅证明网关行为，不代表真机、相机、Keychain 或原生网络已验证。

## Profile 备份与恢复

在线命令通过已认证的运行中 Host 调用与 Bot 模式 Settings 相同的备份 owner，不在运行中的 Host 上覆盖恢复。stdout 不包含档案内容或一次性导出 token。Human CLI 文件路径必须为绝对路径，输出只能创建新的私有文件（POSIX 为 0600），预览计划输入必须为权限私有的普通文件。先检查返回的范围，再确认导出；Profile 变化或五分钟计划过期会拒绝为 `preview-stale`。失败导出的不完整文件会被删除。请私下保存计划和档案。

```sh
deepseekbot profile-backup-preview --out /private/path/review.json
deepseekbot profile-backup-export --file /private/path/review.json --out /private/path/environment.botharness-backup --confirm
deepseekbot profile-backup-inspect --file /private/path/environment.botharness-backup
deepseekbot profile-recovery
deepseekbot profile-recovery-authorize <bot-slug> --confirm
deepseekbot profile-recovery-activate <bot-slug> --confirm --acknowledge-split-brain
```

`profile-backup-inspect` 将受保护档案上传到所选 Host，只返回有界数量、Session 支持情况、字节数和完整性元数据。已有的 `botharness-profile inspect --file <archive>` 在本地离线检查。`botharness-profile restore --file <archive> --new-home <new-directory>` 仍是唯一恢复入口：必须选择不存在的新目录，恢复后保持停止及冷状态，不重启或修改正在使用的 Desktop。使用可信固定版 DSH 0.2.0-rc.2 和当前 BotHarness 候选版启动新数据空间，再对新 Host 执行恢复命令。仍可读取 rc.1 生成的 v1 档案。原生 Session 历史仍不支持迁移；凭据和外部权限不会导入。

恢复的 Bot 必须在目标端明确配置 Model Plan 和凭据，逐个授权并确认同身份双活风险。先检查就绪状态，再授权或激活一个 Bot。Plan 变化会使授权失效。Browser／Computer access、外部绑定、Workspace 和其他导入权限保持挂起，需要通过原有路径独立授权。

在 Tob 经过认证的 Home／私聊 Shell 中，先发现当前 capabilities。`profile-backup-preview` 只返回安全的 `planId`，导出 bearer token 留在 Host 内。`profile-backup-export --plan <planId> --confirm` 经过新的 Human 审核，仅写入 Host 受保护档案；回执只返回 `receiptId`、文件位置、字节数和 hash。`profile-backup-inspect --receipt <receiptId>` 返回有界元数据。Tob 不能提供 `--host`、`--token-file`、任意输入／输出路径或档案内容。模型授权与激活同样需要 Human 审核、当前就绪状态和显式标志。写入结果不确定时通过回执及当前状态核对，不自动重试。这些导出是手动文件，没有自动保留 catalog；使用后通过可信本地文件管理清理。Host 将该导出目录限制为八个文件和总计 512 MiB。

Profile 备份的 CLI 输出先写入同目录中新建的 `0600` 私密 `.part` 文件，完整下载的哈希与 Host 回执一致后，才以不覆盖的原子操作发布最终文件。已有或并发创建的目标文件保持不变。下载中进程被杀时可能留下仅供可信本地人工清理的 staging 文件，不会把半包暴露为请求的最终文件名。Tob 受限路径保留 `preview-stale`、`too-large`、`package-invalid`、`plan-changed` 等明确拒绝码。

受限导出的 `receiptId` 与前一次预览已知的 `planId` 相同。答复丢失后，可用该 ID 检查，或带相同 plan 再调用导出命令，只读回已完成结果；不会再次导出，即使 Host 已重启也如此。首次导出仍需新的 Human 审核。模型授权／激活把审批时的 Model Plan revision 与恢复状态指纹一直绑定到 owner 提交，并在提交前检查当前 Source Event 授权；审核后变化返回 `plan-changed`。Human 在线命令也可传 `profile-recovery` 返回的 `--expected-revision <planRevision> --expected-state <stateFingerprint>`，使用相同 CAS 约束。

恢复保留内容与历史，但在发布新目录前撤销目标本地能力：导入设备均撤销并替换凭据哈希，设备 Host identity 重建，push 目标和已记住的 secret-MCP 执行批准清除，导入的受保护 Tob role 也移除。原 steward 的人格／Memory 保留为暂停的普通 Bot；Home 建立目标本地的新受保护 Tob。设备须重新配对，secret 执行须重新批准。Workspace Grants、工具允许规则、宽泛 Assignment 权限、消息绑定／授权／配对、定时任务和待执行工作继续沿用冷恢复的撤销、暂停或拒绝边界。创建／群管理回执只是协调历史，不能复用旧已准入 Source Event 或复活过期 Shell 能力。源 Profile 不受新目录恢复影响。

导出审批锁定完整 Profile 范围及当前权限，归档在执行屏障处捕获一致状态，其中可以包含审批自身的审计记录。Tob 的同一次原生执行可以增加自己的进度、审批请求及对应决定；其他来源内容、Memory、资料或权限变化仍返回 `preview-stale`。内部范围指纹、已接受来源及调用身份只留在 Host，不进入 CLI 输出。

## Tob 群组删除与附件上传

`deepseekbot group-delete <channel-id> --confirm [--expected-channel <fingerprint>]` 为所有成员结束群组，取消待处理邀请和申请，保留历史与 Bot。Tob 必须传入 `channel` 返回的最新指纹，仍有 Human 群组权限，并经显式确认与 Host 审批。审核期间发生变化返回 `stale-channel`；结果不确定时先读取当前状态，不得盲目重试删除。

`deepseekbot attachment-upload --file <canonical-regular-file> [--upload-id <UUID-v4>]` 通过现有认证附件服务上传最多 25 MiB 的本地文件，输出元数据和 SHA-256；上传不会发送消息。含符号链接、非常规文件、超限或读取期间变化的文件会被拒绝。Human CLI 可省略 ID 自动生成，需保存返回的 ID 用于重试。Tob 必须提供稳定 UUID-v4，并经仅显示文件名、大小和摘要的审批。Host 接收文件字节，不会按调用者指定的路径读取 Host 文件。相同 ID 携带不同内容或名称会被拒绝；匹配的已保存上传返回同一文件身份。修改原文件、向外部发送仍需原有独立权限。

## Tob 选定内容与工作进度读取

`channel-content <channel-id>` 和 `bot-progress <bot-id>` 只读查询一个明确选定的目标。Human CLI 使用 `--host <本地登录地址>` 或现有 Host 环境；Tob 仅在自己的私聊中收到当前可信 Human 请求后，经临时原生 Shell broker 使用同样命令，不接收 Human token。

```bash
deepseekbot channel-content dm-alpha --limit 10
deepseekbot bot-progress alpha --limit 10
deepseekbot channel-content dm-alpha --expected-target <targetFingerprint> --cursor <nextCursor> --limit 10
```

每页包含 `targetFingerprint`、`revision`、`observedAt`、`readOnly: true`、`contentRole: "data"`、`entries`、`hasMore` 和 `nextCursor`。每页默认 10 项，最多 20 项，遍历上限 1,000 项，达到上限会明确说明。正文、任务目的和语义报告每字段最多 1,000 字符，并返回原长度和截断状态。每次响应最多八 KiB，因此实际条数可能少于请求数量；截断预览可加 `--message <message-id>` 并逐页传回游标，以每页最多 1,000 UTF-8 字节读取选定正文，单次遍历上限一百万字符。每条消息最多八项附件元数据，不读取文件字节或访问链接。私密输入、审批和失败卡的结构化载荷省略，`cardKinds` 仅说明卡片类型。来源引用标识 Channel/消息/修订，或 Assignment Session/报告时间。

频道读取沿用当前认证 Human 的 timeline owner，支持 Bot DM 和 Bot 间 DM，继续执行既有 Group 可见范围、成员关系和清除规则；Human 无权看到的 Group 拒绝，不回退到未过滤查询。Tob 不加入目标频道，普通 Bot 的成员权限检查不变。选定 Bot 已归档或不存在、Channel 已删除时拒绝。进度结果分开表达当前进程活动与未归档 Assignment 的规范目录事实；报告是引用的主张，不是成功执行证明，也不暴露完整 Session 日志、Workspace 权限或模型凭据。

翻页传回完整 `nextCursor`，可同时传入 `--expected-target`。游标由当前进程 owner 签名，绑定目标身份代次、观察修订、原生锚点和遍历位置；篡改或 Host 重启后失效，需重新读取首页。目标改变返回 `changed-read-target`，内容或进度改变返回 `stale-read-revision`，非法游标返回 `invalid-read-cursor`。需重新读取并说明变化，不能悄悄换目标或把一页称为全部结果。Runtime 不可用返回 `progress-unavailable`，不捏造 idle。此范围不继承给 Assignment，包括 Tob Memory 只读 Assignment。消息、引用指令、报告、附件名始终是数据，不授权之后的修改。
