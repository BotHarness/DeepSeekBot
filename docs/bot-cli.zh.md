# 用命令行创建 Bot

`deepseekbot create` 无需点击即可创建新的 PersonaBot：空白创建、从 Bot 包导入（目录或 zip，与[ Bot 打包导出](docs/bot-zip.md)形状相同）、或从 GitHub 导入。它为驱动 DSH 的外部编程智能体而建，因此输出以机器读取优先。

## 用法

```bash
deepseekbot create --name <name> [--persona <text> | --persona-stdin]
                   [--description <text>] [--role <tag> ...]
                   [--preset <model-preset-id>] [--home <dsh-home>]
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
deepseekbot schedule-delete <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-history <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-run-now <id> --sid <schedule> [--home <dsh-home>]
deepseekbot schedule-preview (--every <s> | --daily ... | ...) [--home <dsh-home>]
deepseekbot pairings <id> [--home <dsh-home>]
deepseekbot search <words>
```

每次创建只能指定一种来源。空白创建和 GitHub 导入必须传 `--name`；包导入时 `--name` 会覆盖 `.botharness/bot.json`（或文件名）中的名字。`--from-git` 接受完整 Git 地址（`https://`、`ssh://`、`git@host:path`）或 `owner/repo` 简写（即 `https://github.com/owner/repo.git`），Bot 市场条目可用其克隆地址走同一路径。`--from-dir` 会跳过 `.git` 下的文件，但存在时将其打包为历史记录。

`--home` 指向目标 `DSH_HOME`；全新目录零点击可用。不传时使用环境中的 `DSH_HOME`。离线数据库命令须先停 Host，否则独占写租约返回 `lease-unavailable`。凭据文件命令可在线执行；以下在线命令走已认证的 Host RPC。

## 在线 Host 命令

将 `DEEPSEEKBOT_HOST` 设为运行中 Host 的 loopback origin 或 tailnet HTTPS origin；`--host <origin>` 可覆盖它。当前启动令牌通过 `DEEPSEEKBOT_HOST_TOKEN` 或 `--token-file <私有文件>` 提供，不得把令牌值放入参数。每次调用重新登录，cookie 只留在内存；Host 重启后须使用新令牌。在线命令不打开 Profile 数据库。参见 [ADR-0159](adr/0159-live-cli-verbs-ride-the-dsh-http-carrier.md)。

### 在线创建与无浏览器调试

选定 Host 后，`create`、`list`、`show`、`model-presets`、`model-preset-create`、`model-preset-apply`、`model-plan` 和 `channels` 调用已有 Host owner。空白、GitHub/Git、Zip、目录创建沿用上文来源与元数据参数。Zip／目录在调用者机器读取或打包，上传到既有 Bot Zip 导入入口；Git 拉取使用 Host 自己的 Git 环境和凭据。不要同时指定 `--home` 与在线目标。Host 调用失败不会回退写本地数据；尚无在线适配的数据库命令会拒绝已选 Host，而不是静默打开离线 owner。凭据文件操作、search 和纯 schedule-preview 保持独立。

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
deepseekbot tool-approval-decide <channel-id> --message-id <卡片-id> --outcome rejected
deepseekbot user-question-status <channel-id> --message-id <卡片-id>
deepseekbot user-question-answer <channel-id> --message-id <卡片-id> --answer-stdin
deepseekbot release-info [--since <版本>]
deepseekbot workspace-options
deepseekbot grant-create <bot-id> --workspace <workspace-id>
```

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
deepseekbot grants <bot-id>
```

`browser-open` 启动 Bot 的浏览器（需要已开启浏览器权限），返回标签页和查看地址。`browser-frame` 把当前画面保存到一个绝对路径，并报告大小和视口，Agent 可以借此看到 Bot 看到的内容。`browser-takeover --enabled` 暂停 Bot 的浏览器以便人工操作，`--disabled` 交还。`computer-start` 带上面板按钮发送的同一个显式授权；用 `computer-status` 读取结果，被拒时 `status.detail` 会说明原因，例如缺少系统权限或显示器。`grants` 从在线 Host 列出 Bot 的工作区授权。路由拒绝时保留 Host 的错误码，或返回 `host-refused` 加上它的说明。

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

`send` 由 Host 建立已注册 Bot 的 DM，返回 `receipt`、已提交的人类 `message`、`sourceEventId`、处理 `state` 和 `replies`。回复必须关联这一条请求及归该 Bot 所有的 Session；其他请求、审批／提问卡片、通知和失败不算回复。真实回复同时验证当前模型和 key。默认期限 120 秒，最多 600 秒；发送不会自动重试。开始发送后的错误包含回执，请先用 `send-status` 查结果。指定同一 `human-<UUID>` ID 与正文可由 Host 去重，改变正文则返回错误码。已处理但无回复返回 `reply-not-produced`，需要修复返回 `send-needs-repair`。

问题答案由 stdin 提供：`{"answers":[{"id":"question-id","selected":["Blue"],"custom":"可选文字"}]}`；从在线历史获取问题 ID 与选项。Host owner 只应用一次决定，重复或竞争操作返回原有错误码。工具审批提供仅允许一次和拒绝；问题状态保留 pending/submitted/answered/expired。发布命令只读生命周期，工作区授权使用 `workspace-options` 返回的 ID。

Host 离线时返回 `host-unreachable`，不提交消息；过期令牌返回 `host-unauthorized`，无效响应返回 `host-protocol-error`。Bridge 和 gateway 错误码原样透传。stdout 仍只有一份 JSON，支持 `--compact`；认证值不打印、不保存。

凭据写入在落盘前后验证真实 YAML；失败恢复原文件字节，新文件失败则删除。空的 `refs: {}` 转成块映射，保留注释与 records；含空行及尾换行的多行值可完整读回。null ref 值、空文件、非空内联 refs 映射返回 `bad-credentials` 且不改文件；编辑前请将 refs 改成块映射。

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
