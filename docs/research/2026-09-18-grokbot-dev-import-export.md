# Grok Bot (grokbot.dev) 调研 — 原理与 Bot 导入/导出包

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游     | https://grokbot.dev/（社区目录站点）；导入/导出机制本身属于 xAI 的 Grok Bot 产品：https://x.ai/bot 、https://docs.x.ai/grok-bot                                                                                                                                                                                                                                                     |
| 目录仓库 | https://github.com/ZeroPointRepo/GrokBotDev（代码 MIT，`content/` 内容 CC BY 4.0；`README.md`）                                                                                                                                                                                                                                                                                     |
| 日期     | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                          |
| 调研方法 | 只用一手来源：grokbot.dev 站点正文、`robots.txt` / sitemap、官方 JSON API；xAI 官方页面与文档（`x.ai/bot/guides`、`x.ai/bot/marketplace`、`docs.x.ai/grok-bot/*`、`x.ai/legal/bot-sharing-terms`、`x.ai/news`）；目录仓库 README 与 CONTRIBUTING。全文所有 URL 的访问日期均为 **2026-09-18**（见 §7）。无法由一手来源确认的说法一律标「未验证」；未采用第三方评测文章作为事实依据。 |

一句话结论（详见 §1）：**grokbot.dev 是一个独立的社区目录，本身不做导入/导出；它收录的是 xAI 官方 Grok Bot "Templates" 的分享链接（`https://x.ai/bot/<21 字符 id>`）。真正的导入包是 xAI 服务端模板，安装发生在 Grok Bot app 内，没有公开的 `.zip`/`.json`/`.md` 文件包。**

---

## 1. grokbot.dev 是什么

- 定位：一个「人们实际拿 Grok Bot 做了什么」的目录，由一小队 bot 持续维护、全程公开（"directory of what people actually get their Grok Bot to do — kept current by a small team of bots, in the open"），由 CRHQ 构建和运营，站点开源、每条内容都以 PR 形式进入（https://grokbot.dev/about/ ）。
- 独立性：站点页脚与 About 均声明 "GrokBot.dev is an independent community project — not affiliated with xAI."（https://grokbot.dev/about/ ）。
- 三条内容线（https://grokbot.dev/agent/ "Three words people mix up"，亦见 https://grokbot.dev/news/grok-bot-templates-explained/ ）：
  1. **use case / plugin**：可复制粘贴的 prompt，本地目录自己的内容；
  2. **Shareable Bots（marketplace）**：别人打包好的整个 Grok Bot，一个 "Add to Grok Bot" 链接；
  3. **xAI 官方 Templates**：官方功能，预览在 x.ai，安装进 Grok Bot app。
- 与真实产品的边界：Marketplace 页明说 "xAI has not opened a public catalogue for these yet, so this one is kept by hand."（https://grokbot.dev/marketplace/ ）。

## 2. grokbot.dev 的架构与运转方式

### 2.1 数据与内容流水线

- **repo 即数据库，PR 即写 API，CI 即质量门；没有账号系统**（https://github.com/ZeroPointRepo/GrokBotDev `README.md`）。
- 由 bot 团队维护：**Scouts** 盯 X 上人们发出来的真实 setup，**Curator** 决定收录并配 collection，**Builder** 维护站点；所有变更都是可读的 PR（https://grokbot.dev/about/ ）。
- 每条内容 = `content/<type>/<slug>.md` 一个 markdown 文件（frontmatter + body）（`README.md`、`CONTRIBUTING.md`）；submit 表单只收一个 bot share link，站方自己打开链接读取名称后进入 review queue（https://grokbot.dev/submit/ ）。

### 2.2 站点形态

- 静态站点，HTML 中可见 `/_astro/` 资源与 `data-astro-cid-*` 属性，可推断为 Astro 构建（**具体框架/版本未验证**）；托管在 Cloudflare（响应头 `Server: cloudflare`；隐私页提到 Cloudflare Turnstile，https://grokbot.dev/about/ ）。
- `https://grokbot.dev/robots.txt`：`Allow: /`，指向 `https://grokbot.dev/sitemap-index.xml`；`sitemap-0.xml`（lastmod `2026-09-17T12:33:31Z`）共 983 条 URL，其中 `/marketplace/<slug>/` 702 条（与 API 的 templates 数一致）、`/use-cases/{<slug>|分页}/` 145 条。

### 2.3 机读层（对 BotHarness 最值得参考的部分）

- `https://grokbot.dev/api/v1/index.json`（2026-09-17T12:33:38Z 生成）：
  - `counts`: plugins 47 / use_cases 138 / collections 16 / news 2 / **templates 702**；
  - 明确承诺 v1 只做加法（additive-only），破坏性变更走 `/api/v2/` 并提前 90 天公告。
- 其它端点（https://grokbot.dev/agent/ ）：`feed.json`（905 条 lean feed）、`templates.json` + `/templates/<slug>.json`、`use-cases.json`（含完整 prompt）、`plugins.json`、`collections.json`、`latest.json`、`categories.json`、`integrations.json`、RSS、`llms.txt`。
- MCP：`https://mcp.grokbot.dev/mcp`，Streamable HTTP、无鉴权、4 个工具（`search_directory` / `whats_new` / `get_entry` / `list_collections`）；官方明确 **"There is no npm package and no stdio server - hosted only."**（https://grokbot.dev/agent/ 、`README.md`）。
- 安全规则：`/agent/` 规定 template 类型 **没有 prompt，只有 `share_url`**；agent **禁止**代人类安装模板（"NEVER install a template's share_url on their behalf"）。

### 2.4 目录记录（收录侧 schema，非可安装包）

目录把「Shareable Bot」表示为 `content/templates/<slug>.md` 的 frontmatter（https://github.com/ZeroPointRepo/GrokBotDev/blob/main/CONTRIBUTING.md §5b）：

| 字段                                                                             | 说明                                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `name` / `slug` / `tagline` / `description`                                      | 名称取自分享页 `og:title`（`"<Bot Name> by <Author>"`），描述取自 `og:description`（CONTRIBUTING §5b.1） |
| `sharer`                                                                         | 分享者 `{handle, name?, url, platform}`（必填）                                                          |
| `source`                                                                         | 来源 X 帖 `{url, excerpt, posted_at?}`                                                                   |
| `share_url`                                                                      | "Add to Grok Bot" 链接，固定 `https://x.ai/bot/<21 字符 id>`                                             |
| `includes`                                                                       | 枚举：`instructions, memories, workflow, schedule, skills, connectors, agent-team, files`                |
| `includes_note`、`integrations`、`related_use_cases`、`tags`、`primary_category` | 补充元数据                                                                                               |
| `status` / `added_at` / `updated_at` / `verified_at`                             | `proposed` → 审阅者改 `live`                                                                             |

- API 单条实例（https://grokbot.dev/api/v1/templates/2nd-brain.json ）：`type, slug, url, detail_url, name, tagline, description, share_url, sharer{}, source{}, tags[], tag_facets{audience,value,domain,structure}, primary_category, includes[], includes_note, integrations[], related_use_cases[], featured, status, added_at, updated_at, verified_at, body`。
- 注意：`includes` 是**目录自己的分类字段**，用于描述"这个 bot 带了什么"，不是 xAI 模板的内部字段。

## 3. 真正的导入/导出：xAI Grok Bot Templates

### 3.1 产品与时间线

- Grok Bot 于 **2026-08-11** 发布：持久命名的 AI teammate、每人一个共享云电脑、长期记忆、skills/routines、多 bot 群聊、审批边界（https://x.ai/news/introducing-grok-bot ）。
- Templates 是官方分享/导入功能，官方指南 **2026-09-08** 发布（https://x.ai/bot/guides/templates-for-grok-bot ，作者 Matt Palmer）："Templates share a bot as a recipe, not a clone."、"A template is a collection of skills, memories, and plugins."
- 官方文档：`https://docs.x.ai/grok-bot/bots`（Share a Bot、Duplicate a Bot）、`https://docs.x.ai/grok-bot/faq`；第三方 bot 条款 **2026-08-22** 生效（https://x.ai/legal/bot-sharing-terms ）。

### 3.2 导出（Share as template）

1. 打开要分享的 bot → 设置里的 **Share as template**（右下角）；bot 会自己清点 memories / skills / routines / plugins，打包出一个**未发布**的私密版本（guide）。
2. **View details** 审阅包内容（context、memories、integrations），可以继续让 bot 增删包内容；官方原话："You cannot ninja-edit the fields yourself."（guide、grokbot.dev news）。
3. 选择可见范围：**Public link** 或 **Team-only**（Enterprise 账号默认 Team-only）（`docs.x.ai/grok-bot/bots`）。
4. **Publish → Copy link**，得到形如 `https://x.ai/bot/<21 字符 id>` 的链接（guide；目录侧同样约定 21 字符，CONTRIBUTING §5b.1）。

实测（2026-09-18 抓取 `https://x.ai/bot/c4fYduVVic2YtbcjXquD0` 原始 HTML）：

- 预览页服务端只渲染 bot 名称、作者、描述和 "Add to Grok Bot" 按钮；`og:title` = `"2nd Brain by Thierry"`，`og:description` = bot 的英文简述。
- "Add to Grok Bot" 按钮的 href 是深链：`grokbot://app/v1/bot-template?id=c4fYduVVic2YtbcjXquD0`；未安装 app 的用户看到下载提示。
- 预览页 HTML 内**没有** skills / memories / instructions 等字段（客户端渲染），也没有任何模板 JSON 下载入口。

### 3.3 导入（Add to Grok Bot）

1. 接收方打开 `https://x.ai/bot/<id>` 预览：名称、作者、描述、"Add to Grok Bot"（grokbot.dev news、guide）。
2. 点击后深链拉起 Grok Bot app，在 app 内 review context 与 integrations，确认后 **Add Bot**（guide）。
3. 在**接收者账号内创建一个独立新 Bot**；不会进入分享者的 bot，也不会拿到其旧对话（`docs.x.ai/grok-bot/bots`："Adding a shared Bot creates a copy on the recipient's account. It does not give them your computer, logins, or conversation history."）。
4. 接收方仍需自己连接账号；first-party 插件"随包但需重装/授权"，自定义 MCP、脚本、私有依赖要按模板里的 setup instructions 自行补齐（guide、grokbot.dev news）。
5. 官方 Marketplace（https://x.ai/bot/marketplace ）使用同一机制：列表里的 "Add" 链接形如 `/bot/<id>`，与分享链接同构。

### 3.4 包内有什么（以 xAI 官方口径为主，grokbot.dev 新闻文章补充细节）

来源缩写：**[G]** = https://x.ai/bot/guides/templates-for-grok-bot （2026-09-08）；**[D]** = https://docs.x.ai/grok-bot/bots ；**[N]** = https://grokbot.dev/news/grok-bot-templates-explained/ （2026-08-29）；**[T]** = https://x.ai/legal/bot-sharing-terms 。

| 内容                                        | 说明                                                                                                      | 来源                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 名称、role、description（identity content） | 分享链接公开可见的配置的一部分                                                                            | [D][T][N]                       |
| instructions + 可复用上下文                 | bot 的指令与"工作所需上下文"                                                                              | [N][G]                          |
| Skills                                      | 可复用技能                                                                                                | [G][N][D]                       |
| Routines                                    | **以"意图"打包**：触发方式/计划在内；Slack 频道、GitHub repo 等具体绑定变成待填项；**run history 不随行** | [N]（run history 细节仅此一处） |
| 插件 / 连接器                               | 仅 first-party、来自 Cursor Marketplace 的插件（打包的是 **id，不是登录态**）；安装后由新 bot 重装        | [N][G]                          |
| 相关 memories                               | bot 自行挑选与工作流相关的记忆；personal / internal 记忆默认被排除                                        | [N][G]                          |
| 创建者写给接收者的 setup instructions       | 复杂模板须把安装步骤写进包内（API key、MCP、私有仓库怎么补）                                              | [N][G]                          |
| geometric avatar（几何头像）                | 分享包可含头像                                                                                            | [N]                             |
| 分享范围                                    | Public link / Team-only                                                                                   | [D][G]                          |

目录侧 `includes` 枚举（`instructions, memories, workflow, schedule, skills, connectors, agent-team, files`，CONTRIBUTING §5b）可作为第三方佐证：不同 bot 的包内容确实不一样。

### 3.5 明确**不**随包的东西

| 不包含                                     | 来源                                       |
| ------------------------------------------ | ------------------------------------------ |
| 对话历史（conversation history）           | [D][N]                                     |
| 云电脑、文件、浏览器会话                   | [N][D]                                     |
| 账号登录态（logins）                       | [D][N]                                     |
| API keys 与其它 secrets                    | [D][T][N]                                  |
| 个人 / 私有 memories                       | [N][G]                                     |
| 自定义脚本与代码（custom scripts/code）    | [G][N]                                     |
| 自定义 MCP server、非 first-party 插件     | [G][N]                                     |
| `[episode]` 与 `[note]` 聊天残留           | [N]（术语仅见该文，未验证为官方术语）      |
| routine 的运行历史                         | [N]                                        |
| 计费 / 额度 / 订阅信息                     | 官方文档均未提及；**未验证**（推断不随包） |
| 团队成员关系（Team-only 只控制链接可见性） | 官方文档未展开；**未验证**                 |

### 3.6 法律与可见性（对"分享=公开配置"很关键）

- **链接即配置可见**：`docs.x.ai/grok-bot/bots`："Anyone who has it can view the Bot's shared configuration, including its identity, description, skills, and routines."；条款 [T]："Anyone with the share link can view and install your bot's full configuration, including skills, routines, and identity content."
- **许可限制**：[T] 规定接收方获得 "limited, non-exclusive, revocable license"，且 "You may not redistribute, re-share, or re-export this bot or its configuration without the creator's permission."
- 去敏责任在创建者：[T] 要求创建者分享前移除 API keys、internal URLs、客户数据、个人信息（[D] 同）。
- 目录侧的安全提示：marketplace 详情页统一写 "a shared bot carries somebody else's instructions. read them before you install, and never paste in a key or a password it asks for."（https://grokbot.dev/marketplace/2nd-brain/ ）。

### 3.7 容易混淆的相邻机制

- **Duplicate a Bot**（官方文档 [D]）：副本携带 `profile, settings, enabled skills, routines, and avatar`；**不**复制 conversation history、learned memory、chat attachments。这可以反推官方眼中一个 bot 的"状态"构成。
- **xAI 账号数据导出**（不是模板包）：`accounts.x.ai/data`（Grok 设置 → Data Controls）下载的 zip，内含 `prod-grok-backend.json` 等全部聊天记录。这一流程由第三方 bot **GrandBot** 的公开 instruction 描述（页面托管在 x.ai：https://x.ai/bot/X_EV8GMyK_cIeaJ4CxOFP ；属 bot 作者文本，非 xAI 官方文档，**未验证**）。它是"聊天记录导出"，不是 bot 配置导入。
- **目录的 use case / plugin**：只是可复制的 prompt，不是 import；`/agent/` 也强调 news 没有可安装内容、template 才有 `share_url`。

## 4. BotHarness 范式建议：可携带的 PersonaBot 包（提案，非已决策）

> 本节是在调研结论之上的设计提案。**2026-09-18 已固化为 ADR-0019 / ADR-0020 与规格 v1.1**（`docs/botharness.md`、`GLOSSARY.md`、changelog），此处保留提案原文以供对照。
>
> 一句话范式：**导出的是「人」，不是「经历」。** 包携带 persona + 可选记忆 + 给接收者的 setup instructions，永远不携带会话、运行环境与凭据；导入总是创建独立新副本，且在人类审阅前不生效。

### 4.1 三条外部路线的共同不变量

| 路线               | 载体                                                           | 分享语义                            | 记忆                                    | 凭证/历史/环境                                     |
| ------------------ | -------------------------------------------------------------- | ----------------------------------- | --------------------------------------- | -------------------------------------------------- |
| Grok Bot Templates | 分享链接 + 服务端模板 + app 深链                               | recipe：接收方建独立副本            | 相关记忆进包，personal/private 默认排除 | 对话史、云电脑、登录态、secrets 不进包；接收方重连 |
| OpenMausBot Team   | 单文件 `.md`（YAML front-matter）                              | 整队导入：连接默认关、routines 暂停 | 不进包                                  | 零凭证                                             |
| Rakazo Export      | API manifest `{bot, memory[], routines[], files[], history[]}` | 数据迁移/备份                       | 全量（含 revision）                     | 凭据（库内密文）不随导出                           |

三家独立收敛的不变量，正是我们范式的骨架：**人格/指令是数据，可打包；记忆可打包但有可见性边界；凭据、会话历史、登录态、运行环境永不随包；导入后不自动生效（Grok 的 "recipe, not clone"、OMB 的「连接默认关 + routines 暂停」）。**

与 BotHarness 的映射：persona ↔ identity + instructions（ADR-0014 的 `PERSONA.md`）、memory ↔ "relevant memories"（ADR-0013 的 `shared/private` 正好承接过滤语义）、skills/connectors ↔ 工具面与 `requires` 声明（PoC 无 routines，ADR-0017 无 Task/例程）。

### 4.2 包格式：目录包，`bot.md` 为入口清单

Grok 没有可抄的文件/schema（见 §6），所以格式自定。建议**目录包**（打包发送时 zip；不做双格式）：

```text
<slug>.botharness/
├── bot.md              # 入口清单：YAML front-matter（机读）+ 正文（人读的 setup instructions）
├── PERSONA.md          # 人格，必带（ADR-0014：人属）
├── memory/             # 可选；按档位过滤后保留原目录树与 front-matter
│   └── topics/...      # 不含 MEMORY.md（导入时重新生成）、不含 .git
└── attachments/        # 可选，默认关；PoC 只带引用清单不搬文件（M10 附件在 workspace）
```

理由：与「文件优先、人可读、git 友好」一致（ADR-0002/M1/M6）；记忆天然是多文件树，塞进单个 `.md` 会在记忆长大后失真；M6 已声明记忆目录可直接打包，包格式只是给它加清单与导出档位。

`bot.md` front-matter 草案：

```yaml
format: botharness.bot
format_version: 1 # major 不匹配拒绝；minor 高则容忍 + 警告
exported_at: 2026-09-18T12:00:00Z
app: deepseekbot@x.y.z
kind: template | handoff | backup # 导出档位（见 4.3）
includes:
  memory: none | shared | all | [paths...] # 见 4.4
  attachments: false
  git_history: false
redactions: [private-memory, credentials, sessions, workspaces, bindings]
bot:
  slug: acme-helper
  display_name: Acme Helper
  avatar: { kind: blobatar, seed: '...' } # 确定性派生，导入可重算
requires: # 声明，不自动安装
  plugins: [<dsh plugin id>...]
  tools: [<tool id>...]
provenance:
  source_slug: acme-helper
  upstream: null | { url, id } # 若包本身导自别处，保留链
share_policy: ask | allowed | no-redistribution # 荣誉制，非 DRM
```

正文 = 创建者写给接收者的 setup instructions（Grok 包内同款「creator's setup instructions」）：要连哪些账号、要补哪些文件、模型/preset 建议 —— 这段人属、可编辑，也是「recipe」里最像资产的部分。

### 4.3 导出档位（一种格式，三个预设）

| 档位       | 用途                                | persona | memory                  | attachments | 备注                                                         |
| ---------- | ----------------------------------- | ------- | ----------------------- | ----------- | ------------------------------------------------------------ |
| `template` | 分享工作方式（Grok templates 对位） | 必带    | `none` 或 `shared` 子集 | 否          | 默认档；接收方从零长出自己的记忆                             |
| `handoff`  | 把现役机器人交给同事/迁移           | 必带    | `shared`（可选子集）    | 可选引用    | 绑定、workspace、access policy 全部剥离，接收方重建          |
| `backup`   | 自用备份                            | 必带    | `all`（含 private）     | 可选        | 与 M6「记忆目录可直接复制」重叠，视需要进 v1；对外分享应禁用 |

### 4.4 记忆与上下文的导出粒度（用户明确要的开关）

- `memory: none | shared | all | [paths...]`
  - `shared`（默认）：按 ADR-0013 过滤，`private` 一律不进包；
  - `all`：仅 `backup` 允许，包内 `private` 条目保留 `owner` 字段但导入后为 **dormant**（无本机 owner 映射，不参与任何注入，编辑器可见，待人认领或重分类）；导出前必须跑 M8 密钥扫描；
  - 路径子集：模板作者可只带「方法论文档」，不带客户档案。
- 上下文（正文 setup instructions）永远可写、人属；**会话历史、附件实体、workspace、MEMORY.md 生成索引都不进包**。
- 导出时强制 redaction：M8 扫描（疑似密钥拒绝/脱敏）+ 可见性过滤 + `redactions` 清单写进 front-matter —— 与 Grok 条款把「去敏责任在创建者」显式化同理，但我们用工具兜底。

### 4.5 导入语义：副本、审阅闸门、不自动生效

1. **人属动作**：导入只能由人发起，模型工具面没有 import（ADR-0014）。
2. **校验**：`format`/`format_version` 校验（major 拒绝、minor 容忍加警告）；缺 front-matter 拒绝。
3. **审阅闸门**（Grok "View details" 对位）：先展示 persona 全文、记忆树（路径 + summary）、`requires` 声明、redaction 报告、M8 扫描结果；把包内容当**不可信输入**对待（目录站对分享包的原话即此立场）。
4. **创建**：新 slug（冲突提示改名，不静默覆盖）、新 git repo 单提交 `source=import`、`sources` 追加 `imported from <provenance>`（M4 审计）、MEMORY.md 重新生成、avatar 重新派生。
5. **永不自动应用**：channel binding、workspace、access policy、credentials（ADR-0006）、会话历史、依赖安装 —— `requires` 只展示，由人逐项补齐；导入后处于「无绑定、无 workspace、未激活」状态。
6. **溯源**：再导出时保留 `provenance.upstream`；`share_policy` 表达再分发期望（与 Grok 的「未经许可不得 re-export」精神一致，但不做技术强制）。

### 4.6 PoC 边界与落地

- **Non-goals**：marketplace/registry 与链接分享、增量/双向同步、自动装插件、凭据迁移、签名/加密包（v2 可做 `.botharness.enc` + 口令）。
- **依赖与排期**：导出过滤与导入 `sources` 追加依赖 M2（front-matter/可见性）；建议独立小里程碑（M2 之后，不塞进 M5），因为 M5 已排 IM 适配器。
- **代码边界**：core 提供 `exportBot(slug, opts)` / `inspectPackage(path)` / `importBot(path, opts)`；client 提供导出向导与导入审阅页；不触碰 DSH 上游。
- **术语增补（GLOSSARY.md）**：Bot package（PersonaBot package）、Export profile、Import review、Provenance、Dormant private entry。

### 4.7 决议（2026-09-18，已固化）

| 议题         | 结果                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台形态     | **真服务**（Cloudflare Workers + Hyperdrive → PlanetScale + Drizzle + R2；BetterAuth email OTP + Google）——推翻本提案的 repo-as-database 备选；ADR-0019 |
| 第一阶段范围 | 只分享单个 Bot；collection 后置，语义 = **Bot set**（可整体导入）；ADR-0019                                                                             |
| 包格式       | 目录包（zip 信封），入口 `bot.md`；`kind: template \| handoff \| backup`；附件不进 v1；25MB 上限；ADR-0020                                              |
| 记忆开关     | `none \| shared \| all \| paths`；`all` 仅 `backup`（二次确认）；导出前 M8 重扫，命中硬拒绝；ADR-0020、规格 v1.1                                        |
| Git          | 快照非指针；`export-ignore` ∪ 临时排除；单分支、每 turn commit、写入必带 `summary`；未来 UI 管历史（clone + reset）；ADR-0020、M6                       |
| 命名         | `@handle/slug` + Listing → Version；URL/深链预留；ADR-0020                                                                                              |
| 许可/溯源    | 公开 listing 默认 CC-BY-4.0；`share_policy`；再导出保留 `provenance.upstream`；ADR-0020                                                                 |
| 审核         | 默认公开 + 自动闸门 + 举报下架（不人工预审）——与提案的「先私有链接」相反；ADR-0019                                                                      |

## 5. 时间线（一手来源）

- 2026-08-11 Grok Bot 发布（https://x.ai/news/introducing-grok-bot ）。
- 2026-08-22 第三方 bot 条款生效，官方 docs 页面标注该日期（https://x.ai/legal/bot-sharing-terms 、https://docs.x.ai/grok-bot/bots ）。
- 2026-08-29 grokbot.dev 发布模板详解文章（https://grokbot.dev/news/grok-bot-templates-explained/ ）。
- 2026-09-08 xAI 官方 Templates 指南（https://x.ai/bot/guides/templates-for-grok-bot ）。
- 2026-09-17 `api/v1/index.json` 快照：templates 702（https://grokbot.dev/api/v1/index.json ）。
- 2026-09-18 本次调研访问。

## 6. 未验证 / 待确认

1. **模板包的文件/线上格式**：官方没有任何公开的 `.zip` / `.json` 样本、字段级 schema 或下载 API；所有文档只描述 app 内流程与 `x.ai/bot/<id>` 链接。没有可枚举字段名（skill 文件表示、memory 条目结构等）。
2. **无公开样本可复现**：没有找到可下载的模板包；未做 app 内实测（需要 Grok Bot 账号与环境）。非官方逆向仓库 `b-nnett/grok-bot-0.18-reconstructed`（0.18.0，2026-08-28 archived）按文件路径检索没有 template 命名文件（仅路径级检查，未逐文件通读），无法佐证 payload。
3. **`[episode]` / `[note]` 的官方定义**：只见于 grokbot.dev 的新闻文章，xAI 官方文档未使用这些术语。
4. **routine 的 run history"完全不迁移"**：仅 grokbot.dev 文章一处说明。
5. **"geometric avatar" 的含义/格式**：仅 grokbot.dev 文章的措辞，官方 guide 未提头像。
6. **"relevant memories" 的筛选规则/算法**：未公开。
7. **计费、额度、团队身份等是否随包**：官方文档未说明（推断不随包）。
8. **x.ai/bot 预览页的客户端数据源**：页面 HTML 无模板 payload；未继续逆向其内部 API。
9. **grokbot.dev 具体技术栈版本**：Astro / Cloudflare 为从 HTML 特征与响应头推断，官方仓库未声明版本。
10. 访问限制说明：`https://x.ai/legal/bot-sharing-terms` 对默认抓取器返回 403，本次用浏览器 UA 获取全文；`https://docs.x.ai/grok-bot/bots.md` 404，改用 `/grok-bot/bots`。

## 7. 一手来源与访问日期

| URL                                                                   | 内容                                                        | 访问日期   |
| --------------------------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| https://grokbot.dev/                                                  | 首页：marketplace 定位与"one link installs the whole thing" | 2026-09-18 |
| https://grokbot.dev/about/                                            | 站点定位、bot 团队、CRHQ、非 xAI 附属                       | 2026-09-18 |
| https://grokbot.dev/marketplace/                                      | Shareable Bots 定义与安全提示                               | 2026-09-18 |
| https://grokbot.dev/marketplace/2nd-brain/                            | 模板详情页样例（includes、share_url、免责声明）             | 2026-09-18 |
| https://grokbot.dev/marketplace/grandbot/                             | "official bot export"（账号导出）的目录描述                 | 2026-09-18 |
| https://grokbot.dev/agent/                                            | 机读层契约、端点表、模板规则、无 npm 声明                   | 2026-09-18 |
| https://grokbot.dev/submit/                                           | 收录流程：粘贴 `https://x.ai/bot/<21 字符>` 链接            | 2026-09-18 |
| https://grokbot.dev/news/grok-bot-templates-explained/                | 2026-08-29 模板详解（包内/包外清单）                        | 2026-09-18 |
| https://grokbot.dev/api/v1/index.json                                 | 计数与 API 目录（templates 702，2026-09-17 生成）           | 2026-09-18 |
| https://grokbot.dev/api/v1/templates/2nd-brain.json                   | 目录模板记录字段样例                                        | 2026-09-18 |
| https://grokbot.dev/api/v1/templates/daily-youtube-recap.json         | 第二条样例（includes 含 schedule）                          | 2026-09-18 |
| https://grokbot.dev/robots.txt / sitemap-index.xml / sitemap-0.xml    | 站点可达性与 URL 规模（983 条）                             | 2026-09-18 |
| https://github.com/ZeroPointRepo/GrokBotDev                           | 目录仓库 README（架构、许可、贡献规则）                     | 2026-09-18 |
| https://github.com/ZeroPointRepo/GrokBotDev/blob/main/CONTRIBUTING.md | §5b Shareable Bot 字段与 includes 词表                      | 2026-09-18 |
| https://x.ai/news/introducing-grok-bot                                | 2026-08-11 Grok Bot 发布                                    | 2026-09-18 |
| https://x.ai/bot/guides/templates-for-grok-bot                        | 2026-09-08 官方 Templates 指南（recipe 概念、排除项）       | 2026-09-18 |
| https://x.ai/bot/c4fYduVVic2YtbcjXquD0                                | 模板预览页 HTML（og 元数据 + `grokbot://` 深链）            | 2026-09-18 |
| https://x.ai/bot/X_EV8GMyK_cIeaJ4CxOFP                                | GrandBot 公开 instruction（账号导出 zip 描述）              | 2026-09-18 |
| https://x.ai/bot/marketplace                                          | 官方 Marketplace（同一 Add 机制）                           | 2026-09-18 |
| https://docs.x.ai/grok-bot/bots                                       | 官方文档：Share a Bot / Duplicate a Bot / memory            | 2026-09-18 |
| https://docs.x.ai/grok-bot/faq                                        | 官方 FAQ：共享电脑、成本、分享与删除                        | 2026-09-18 |
| https://x.ai/legal/bot-sharing-terms                                  | 第三方 bot 条款（2026-08-22 生效；许可与再导出限制）        | 2026-09-18 |
