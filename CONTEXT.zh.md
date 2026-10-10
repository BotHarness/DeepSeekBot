# BotHarness 产品术语

一个 DeepSeek Harness 插件层，为 LLM Agent 提供持久产品身份：PersonaBot——身份、Git-backed Memory 与执行归属跨越任何 Session、Chat 或 Workspace 的 bot。

## 语言

### PersonaBot（持久机器人身份）

**PersonaBot**：
由 Host 拥有的一等 bot 实体：一种带 Git-backed Memory Repository、跨越 Session、Chat 与 Workspace，并可同时持有多个 Session 的持久身份。它的 Soul 是 Memory 中的 optional 内容，而不是身份本身。
_避免使用_：bot（单独使用）、agent、assistant、robot

**Archived PersonaBot**：
一种 PersonaBot 状态：禁止新的 admission、wake、Session execution 和 external action，同时保留其身份、所有权、历史记录与审计归属。归档时先关闭这些入口，再停止其 Orchestrator、Assignment Session 以及所拥有的 Subagent；只有整个执行树都进入静止状态，归档才算完成。重新激活绝不会自动恢复旧执行。
_避免使用_：deleted bot、paused UI、purged bot

**PersonaBot Deletion**：
由 Human 确认，结束某个 PersonaBot 活跃身份的操作；它保留历史归属及 Memory Repository，除非 Human 显式选择清除记忆。它不同于可恢复的归档，也不同于 Messaging Content Purge。
_避免使用_：archive、hide、automatic Memory purge

**Bot as a Person**：
一项原则：PersonaBot 跨 Session 仍是同一个产品身份，其学习所得的持久连续性来自 Memory Repository，而不是 Session 历史。
_避免使用_：session-scoped identity

**PersonaBot ID**：
由 Host 自动生成的稳定 PersonaBot 身份。它适合用于文件系统，但 Human 不需要输入、选择它，也不会把它当作可见的 @ 标签。
_避免使用_：Bot slug、display name、handle、username

**Display name**：
PersonaBot 面向人的名称，也是 `@` 选择器显示的主要标签。名称可以重复；被选中的 mention token 会保留 PersonaBot ID。
_避免使用_：identifier、slug、username

**Bot Tag**：
显示在 PersonaBot 名称旁的零个或多个标签，例如岗位或专长。Bot Tag 只做描述，不授予权限，也不用于识别 PersonaBot；分享 PersonaBot 时会随之带走。
_避免使用_：role badge（历史用词）、裸用 tag、职位、permission role、category

**Bot Bio**：
由 Human 可选填写、最多 160 字的自我介绍，说明 PersonaBot 是谁、负责什么或擅长什么；分享 PersonaBot 时会随之带走。
_避免使用_：Bot description（历史用词）、裸用 bio、Soul、Bot Tag、system prompt

**Profile Banner**：
PersonaBot Profile 头部、位于 Avatar 后方的宽幅头图。它要么是以 scene 与 seed 的 recipe 保存的生成像素场景（PersonaBot 创建时按 Display name 播种），要么是 Human 上传的图片；分享时随 PersonaBot 带走。Group 没有 Profile Banner。
_避免使用_：cover、header、background、wallpaper

**Soul**：
「Bot 灵魂」。PersonaBot 的人格、语气与长期守则，保存在 Memory Repository 根目录的 `SOUL.md`；它与 Core Memory 一起在 Session 首次组装 system prompt 时冻结为快照并注入。它没有写保护，获得授权的 Agent 与 Human 都可以修改；修改只在新 Session 或下一次 compaction 时生效，不会改写正在运行的 prompt 前缀。
_避免使用_：Persona、PERSONA.md、system prompt、character sheet、profile

**Bot state**：
一个 PersonaBot 当前的呈现状态，由其拥有的 Orchestrator 与 Assignment Session activity 投影而来。Orchestrator 活跃时优先呈现，只有在等待 Assignment 时才呈现后者；多个 Assignment 的 tool kind 相同则使用对应效果，不同则回退到通用 `working`，而 waiting 与 blocked attention 使用独立 indicator，不成为可配置 priority。
_避免使用_：status、mood、presence

**Avatar**：
PersonaBot 在不同 Binding 中共享的视觉形象：根据 PersonaBot ID 确定性生成的 Blobatar media、Human 上传的 image media，或组合而成的 Avatar Appearance，统一置于表达 Bot state 的 Activity Frame 中。可动 media 表达共享活动事实而不改变保存外形；自定义图片保持静止，由外层 frame 呈现活动，各 renderer 消费同一状态。
_避免使用_：profile picture、skin

**Avatar Family**：
形象家族：一类 Avatar 外形，其中相互兼容的外形选项可由 Human 组合。各家族以自身视觉语言表达同一 Bot state；某个外形选项只有在明确兼容时才跨家族共享。
_避免使用_：Soul、Bot type、mode、skin

**Avatar Appearance**：
保存外形：PersonaBot 保存的视觉选择：Avatar Family、Avatar Species、兼容部件（含 Custom Part）、颜色和可编辑几何。各 Binding 使用同一组选择，暂时的动作或形变结束后恢复；它们独立于 Soul 和当前 Bot state。
_避免使用_：Soul、pose、mood、skin

**Avatar Species**：
形象物种：同一 Avatar Family rig 上的基底，例如人类、精灵、哥布林或拟人动物，决定头部轮廓、耳朵、鼻子或吻部和建议配色，并决定可接受哪些部件。它共享该家族的动作和锚点；骨架或视觉语言不同即为另一个 Avatar Family。
_避免使用_：race、种族、Family、Bot type、skin

**Custom Part**：
自绘部件：Human 为 Avatar Appearance 某个槽位绘制的有界像素部件，像素引用该外形的颜色选择或固定颜色。应用时把副本嵌入 Avatar Appearance，随分享的 PersonaBot 一同携带；它是数据，不是 markup 或可执行 renderer。
_避免使用_：sticker、skin、upload、custom SVG

**Part Library**：
部件库：当前 DSH Profile 中 Human 可复用的 Custom Part 集合，每个部件标明来源：本地绘制、导入的 PersonaBot，或导入的部件文件。两种导入都会把部件加入部件库；编辑库中部件不会改变已嵌入其副本的外形。
_避免使用_：asset store、marketplace、catalog

**Window Companion**：
窗口伙伴：由 Human 选择的一种 Binding，使某个 PersonaBot 的 Avatar 在 Harness 窗口内跨页面保留，并呈现选定的活动与消息。它仍是同一个 PersonaBot，独立于 Channel 置顶和当前打开的会话。
_避免使用_：desktop pet、Channel pin、另一个 bot

**Companion Visibility**：
伙伴可见范围：Human 为窗口伙伴选择的、可呈现该 PersonaBot 发言的 Channel 范围：Human 与该 PersonaBot 的 DM、双方都参与的 Channel，或该 PersonaBot 加入的全部 Channel。它独立于消息类型的播放开关，不改变 Channel 成员关系或执行权限。
_避免使用_：Channel pin、Channel membership、Agent Scope

**Model Preset**：
模型预设。Human 创建的可复用、仅对当前部署有效的 PersonaBot 模型方案：一个 Orchestrator provider、model 和 reasoning effort，以及 Assignment 可选的模型与 effort 集合和默认值。应用时将方案复制给 PersonaBot；之后修改预设不会更新已应用的副本。
_避免使用_：DSH Agent preset、SoulSnapshot

**PersonaBot Model Plan**：
PersonaBot 模型方案。某个 PersonaBot 持有的模型预设快照或 Human 自定义选择，决定其 Orchestrator 路由与后续 Assignment 的模型选择。它属于运行配置，不属于 Soul 或 Memory。
_避免使用_：Soul、DSH Agent preset、model usage

### 支撑与执行

**Harness**：
平台层——即 BotHarness——负责拥有 PersonaBot identity、Memory lifecycle、execution state 与 Workspace authorization，并向其他 Plugin 暴露产品 capability。
_避免使用_：framework、runtime、kernel

**Host**：
运行该 Plugin 与所有 PersonaBot 的单一 DSH 进程。
_避免使用_：server、instance、node、worker

**Agent**：
一个 Session 内部的 DSH executor。绝不指 PersonaBot。
_避免使用_：用这个词指代 PersonaBot

**Subagent**：
由某个 Session 为有界工作启动的 DSH child agent 和 child Session；它继承父 Session 的 PersonaBot ownership，但属于该父级工作，绝不会成为独立 Assignment Session。
_避免使用_：sub-bot、worker、helper

**Session**：
PersonaBot 的一次工作或对话运行——DSH 的执行单元，拥有自己的进度与工作目录。
_避免使用_：conversation、context window、thread

**Session ownership**：
Bot-mode Session 与至多一个 PersonaBot 之间排他、持久的关系；非 Bot 模式的 DSH Session 可以保持无 owner，ownership 仅能通过显式修复变更。
_避免使用_：binding、workspace mapping、cwd inference、session membership

**Assignment**：
一条对 Human 有意义、由 PersonaBot 的 Orchestrator 选择独立推进的持续事项。它没有单独的持久 identity 或 lifecycle；其 canonical runtime identity 是承载它的 Assignment Session 的 DSH Session id。
_避免使用_：Work、work item、task entity、job entity、worker

**Assignment Session**：
执行且只执行一个 Assignment、由 PersonaBot 拥有的独立 root Session；v1 中它只有一个 working directory。它由 Orchestrator 创建和管理，不要求 Human 另开 Conversation；一个 PersonaBot 可以同时拥有多个 Assignment Session，而 DSH Subagent 永远不算 Assignment Session。
_避免使用_：Work Session、Worker Session、Executor Session、task Session、child Session

**Assignment Agent**：
在一个 Assignment Session 中执行的 DSH Agent。它只能通过该 Session 向其 PersonaBot 的 Orchestrator 回报，没有 Channel messaging capability，且既不是持久 identity，也不是 PersonaBot。
_避免使用_：worker、PersonaBot、Orchestrator、Assignment Session

**Assignment Directory**：
一种以 PersonaBot 为作用域的持久 read model，当前 Orchestrator 通过它显式列出并寻址自己拥有的 Assignment Session，包括 purpose、Continuity Key、Workspace、源自 DSH 的活动状态与 last-run facts、依赖关系、最新语义报告以及后代活动聚合。它将 execution facts 与 reported outcomes 分开，由 Session Ownership 和 DSH facts 重建，并在需要时查询，而不是完整注入每个 turn。列表支持筛选、排序与 opaque-cursor pagination，且绝不会把 DSH Subagent 扁平化为顶层 Assignment。
_避免使用_：task list、AgentHandle map、cwd scan、Orchestrator memory

**Continuity Key**：
显式分配给一条持续工作线、在 PersonaBot 内稳定的 key。它最多命名一个可恢复的 Assignment Session，并且仅当 ownership、Workspace mapping、model 与 dependency requirement 仍然匹配时才可选中该 Session。当前持有者必须先变为 idle/completed，或被显式停止并 supersede，key 才能转移。
_避免使用_：title similarity、cwd、most-recent Session、global id

**Assignment Request**：
Orchestrator 向其拥有的某个 Assignment Session 发送的持久、定向、可审计消息，可选择关联到一个 Inbox Admission 或先前报告。其语义模式为 `context-update`、`next-step` 或 `next-turn`；Assignment Runtime 将它映射为 DSH injection、steer 或 follow-up，且不打断当前 step。
_避免使用_：Channel message、Subagent prompt、broadcast、inferred Session

**Assignment Delivery Intent**：
在跨越 SQLite/DSH 事务边界创建 DSH Assignment Session 或交付 Assignment Request 时使用的、由 BotHarness 拥有的最小持久 bridge。它携带稳定 id，用于幂等接收与有界的重启 reconciliation；它不是通用 workflow 或 retry engine。
_避免使用_：exactly-once delivery、task queue、workflow、AgentHandle state

**Assignment Report**：
一种持久的、源自 Session 的 Source Event，Assignment Session 通过它主动或响应式地向其 PersonaBot 的 Orchestrator 返回有意义的进度、blocked 或 waiting 状态、结果和 artifact reference。完整执行历史仍保留在 DSH SessionPersistence 中；每份 report 保持不可变，而尚未 Observation 的重复报告可共享一个 Attention Unit。
_避免使用_：direct Channel reply、copied Session log、ephemeral callback

**Assignment Ask**：
Assignment Report 的一种变体：Assignment 声明它在继续之前需要 Orchestrator 的答复。等待期间 Assignment 结束自己的 turn，Orchestrator 的一条带地址 Assignment Request 会恢复该 Session；它不是阻塞调用、不是 Channel 消息，也不是独立生命周期。
_避免使用_：blocking call、direct Orchestrator message、question queue

**Assignment Lifecycle Notice**：
一种持久的、源自 Host 的 Source Event，只在 settled、error 或 cancellation 等有意义的执行边界发出。它携带源自 DSH 的 last-run facts、简洁安全的摘要，并在可用时包含 report/artifact reference；但它始终不同于 Assignment Agent 自己撰写的内容。
_避免使用_：Assignment Report、fabricated agent message、per-turn directory snapshot

**Assignment Concurrency Limit**：
整个 Profile 中可并发执行的独立 Assignment Session 数量上限。v1 中它是由 Human 配置的一项 BotHarness 全局设置；超过上限的 create 或 wake 尝试会立即失败，返回 machine-readable fields 与 LLM-readable explanation，同时不会创建 queue、intent 或 DSH Session。
_避免使用_：dispatch queue、per-Bot quota、hidden model budget、total Session count

**Workspace**：
Session 工作所在的单一 Host 目录；它与一个 DSH workspace 一一映射。UI 可以将多个 Workspace 分组展示，但一个 Workspace 绝不会跨越多个目录。
_避免使用_：project、multi-root folder、group

**Workspace Grant**：
一种面向单个 PersonaBot 与单个已解析 Workspace 的持久、可撤销、application-defined 授权。其 Orchestrator 可读取该 Workspace，只有 Human 明确开启 Orchestrator 写入权限后才可写入；选用此授权的 Assignment 可读写它。它既不是 DSH Workspace，也不是逐事项确认的 prompt。
_避免使用_：Service Grant、Workspace、one-time approval、cwd inference

**Tool Approval Rule**：
Human 保存且可撤销的规则，针对一个 PersonaBot 角色与 Workspace Grant 范围，自动回答后续 DSH 审批请求。精确规则匹配原生工具名称与完整输入；全部不透明工具规则覆盖该范围内所有无法按路径核对的原生工具。每次命中仍产生独立的 DSH 审批决定与审计事件。
_避免使用_：Workspace Grant、Provider Service Grant、sandbox preset、推断的命令相似性

**Assignment Access Preset**：
Human 为单个 PersonaBot 选择、在新建 Assignment 时应用的权限预设。默认是 DSH workspace-write 与 ask；危险完全访问需要明确开启 DSH danger-full-access 与 never。所选模式固化在每个 Assignment 的权限快照中，仍须选择有效 Workspace Grant。
_避免使用_：Workspace Grant、就地切换 Session 模式、Orchestrator 权限

**Delegation**：
从 Chat 或 Roster 把责任交给 PersonaBot。其 Orchestrator 可以直接回答，也可以创建或复用一个或多个 Assignment Session。
_避免使用_：direct Session creation、task entity、job entity

**Binding**：
PersonaBot 与其参与的某个 surface 之间的连接——例如 Channel、Chat、sidebar 或 renderer。
_避免使用_：integration、connector、channel binding

**Orchestrator Session**：
PersonaBot 长期存在的 dispatch root Session：同时至多一个处于 active，负责消费 Bot Inbox，并决定 reply、dispatch 以及是否创建新 Assignment Session。它的 working directory 始终是 PersonaBot 的 Memory Repository；它是 PersonaBot 的对外发声者，不是由 Human 管理的 Conversation，也不是 Assignment 列表中的一行。普通 Session output 只保留为 execution history；只有从可信 Session ownership 推导身份、并经过 Channel membership 授权的显式 Channel messaging command，才会向 Human-facing Channel 发声。
_避免使用_：main agent、brain、supervisor

**Developer Mode**：
Human 拥有的 Bot-mode 偏好，用于揭示默认隐藏的诊断表面（operational log 视图、verbose 状态）。它只控制 Human 的可见性——绝不是 agent 能力的门：有 shell 通道的 agent 总能触及同一份底层数据，因此绝不能把 Developer Mode 描述或依赖为读取边界。
_避免使用_：debug flag、admin mode、agent permission、read boundary

**Computer**：
一个 profile 级共享的 Linux 桌面，由该 profile 的所有 PersonaBot 共用；它拥有一个持久卷，保存其文件、浏览器 profile（Cookie 与登录态）与 CLI 凭据。它的隔离边界是 profile，绝不是某个 PersonaBot。
_避免使用_：machine、VM、sandbox、desktop、host

**Bot Screen**：
某个 PersonaBot 在 Computer 上使用的私有工作界面——它打开的窗口与标签，在 Human 观看时放在自己的工作区里；每 Bot 一条虚拟显示是实验性开启项。观察与操作都限定在它拥有的窗口内；它是可见性作用域，不是安全边界。
_避免使用_：display、virtual screen、workspace、desktop

**Computer Provider**：
运行一台 Computer 并回答其生命周期、观看与传输操作的 Provider；同一时刻只注册一个。
_避免使用_：driver、backend、sandbox、tool provider

**Computer Tool Provider**：
注册在 DSH computer-use seam 上、提供 PersonaBot 在一台 Computer 上所用观察与动作工具的 Provider；同一时刻只注册一个。
_避免使用_：driver、backend、computer provider

**Takeover**：
Human 在一台 Computer 上的接管会话：暂停所有在该 Computer 上行动的 PersonaBot，并在其持续期间关闭面向模型的截图。它由某个 Bot Screen 发起，但始终作用于整台 Computer。
_避免使用_：handoff、screen sharing、per-bot takeover

**Computer Export**：
一台 Computer 持久卷的可携带归档，由显式导出操作产生，可在另一台 Host 上恢复。它是 profile 级 facet，绝不是 PersonaBot export 的一部分。
_避免使用_：PersonaBot export、backup file、disk image

**Computer Target**：
Computer 位于何处的 profile 级选择：Local Computer（默认）或 Container Computer。它对所有 PersonaBot 一次设定；Computer Access 只决定某个 PersonaBot 是否可以使用这台 Computer。
_避免使用_：device、driver、provider、backend

**Local Computer**：
由运行 DSH 的机器本身提供的 Computer——Human 自己的桌面，或带交互桌面的部署宿主。所有 PersonaBot 共享 Human 的真实桌面与登录态；除了这台机器本身，没有额外隔离。
_避免使用_：host machine、personal computer、native target

**Container Computer**：
由 profile 的 Docker 桌面提供的 Computer；宿主没有交互桌面（headless VPS）时推荐使用。它是可选项：没有 Docker 的 profile 使用 Local Computer。
_避免使用_：sandbox、VM、docker computer

**Computer Access**：
PersonaBot 级的开启项（默认关闭）：开启后，该 PersonaBot 的 Orchestrator 与 Assignment 会话才能获得 Computer 工具及其指引；它绝不为其他 PersonaBot 或 Human 会话开权限。
_避免使用_：permission、grant、feature flag、developer mode

**Computer Authorization**：
PersonaBot 在 Computer 上首次行动前、由 Human 按会话给予的一次授权；profile 级「自动允许」可跳过询问。Access 决定工具是否存在，Authorization 决定它们能否运行。
_避免使用_：takeover、consent dialog、per-action approval

**Computer Audit**：
按 PersonaBot 与会话归因的、脱敏的 Computer 观察与动作持久记录；绝不包含输入的原文或截图。
_避免使用_：logs、history、screenshot trail

### Browser

**Bot Browser**：
profile 为其 PersonaBot 运行并驱动的专用浏览器——每个被分配的浏览器 profile 一个实例，各自拥有持久 profile（Cookie 与登录态），由分配到它的 PersonaBot 共享。它的隔离边界是浏览器 profile，绝不是某个 PersonaBot。
_避免使用_：user browser、personal browser、headless browser、Chromium

**Bot Tab**：
某个 PersonaBot 在共享 Bot Browser 上拥有的后台标签——Browser entry 中列出它的标签并预览焦点标签。观察与操作限定在它拥有的标签内；它是可见性作用域，不是安全边界。
_避免使用_：agent window、session tab、borrowed tab、tab group

**Browser Access**：
PersonaBot 级的开启项（默认关闭）：开启后，该 PersonaBot 的 Orchestrator 与 Assignment 会话才能获得 Bot Browser 工具及其指引；它绝不为其他 PersonaBot 或 Human 会话开权限。
_避免使用_：permission、grant、feature flag、extension toggle

**Browser Authorization**：
PersonaBot 在 Bot Browser 上首次行动前、由 Human 按会话给予的一次授权；profile 级「自动允许」可跳过询问。Access 决定工具是否存在，Authorization 决定它们能否运行。
_避免使用_：Browser Access、consent dialog、per-action approval

**Browser Pause**：
Human 对某一个 PersonaBot 标签的暂停：停止该 PersonaBot 的浏览器动作，并在其持续期间关闭面向模型的截图；Human 始终可以直接操作本地 Bot Browser 窗口。暂停期间仍可读取页面；「继续」恢复动作与模型截图，Bot 行动前需要重新观察。这与 Browser Access、Browser Authorization 相互独立。
_避免使用_：Computer Takeover、handoff、screen sharing、access gate

**Browser Takeover**：接管
Human 经 Viewer 明确接管某一个 PersonaBot 的浏览器画面：暂停该 Bot 的动作并开放 Human 输入；释放后恢复 Bot，除非还有未完成的接管链接。它比 Browser Pause 更窄（是控制，不只是叫停），也比 Computer Takeover 更窄（只是一个 Bot 的画面，永远不是整台机器）。
_避免使用_：Browser Pause、Computer Takeover、handoff、screen sharing

**Browser Watch**：观看
打开某一个 PersonaBot 的浏览器画面但不暂停：Human 看直播，Bot 继续干活。观看从不打断；只有 Browser Takeover 会暂停。
_避免使用_：Browser Pause、Browser Takeover、screen sharing

**Browser Audit**：
按 PersonaBot 与会话归因的、脱敏的 Bot Browser 观察与动作持久记录；绝不包含输入的原文、页面内容或截图。
_避免使用_：logs、history、browser history

### Memory（记忆）

**Memory**：
PersonaBot 当前检出的 Memory Repository 工作树中的持久知识。普通文件（包括代码与二进制文件）在 Git 或文件工具改变工作树后立即成为当前记忆，不需要额外“接纳”。Orchestrator 在访问边界内通过原生文件、搜索、Shell 和 Git 能力探索它。
_避免使用_：knowledge base、vector store、RAG、database、context

**Memory Repository**：
PersonaBot 拥有的普通 Git 仓库，在创建 PersonaBot 时自动生成，并作为其 Orchestrator Session 的 working directory。分支、合并与文件历史由 Git 管理；archive、export、restore 和 purge 仍是显式操作。
_避免使用_：optional attachment、Session memory、generated index、project Workspace

**Managed Git**：
「托管 Git」。Host 没有可用的系统 Git 时，BotHarness 应 Human 的请求装进 Profile 的便携 Git；此后 Host 的所有 Memory Repository 操作都用它，并让 Session 也能使用它。
_避免使用_：bundled Git、内置 Git、嵌入式 Git

**Core Memory**：
「Bot 核心记忆」。PersonaBot 常驻的记忆，保存在 Memory Repository 根目录的 `MEMORY.md`：以一条一行的索引为主，告诉它自己记得什么，外加少量关键事实。它与 Soul 来自同一份冻结快照并注入每个 Session 的 system prompt，受 Human 为每个 PersonaBot 设置的字符上限约束；具体怎么组织，由 Human 与 PersonaBot 在沟通中沉淀。
_避免使用_：memory tree、pinned memory、generated index、USER.md

**Topic file**：
Memory Repository 中专门记录某一主题（例如 customer、process 或 decision）的文件。这是一种组织约定，不限制仓库中的文件类型。
_避免使用_：note、document、page、record

**Customer profile**：
作为 north star 的 Topic file：每位 customer 一份，记录 timeline、key facts、commitments，并链接到相关 Attachment。
_避免使用_：CRM record、account、contact sheet

**Memory Service**：
拥有 repository identity 和 lifecycle、可信 Session 访问、Host-to-Client 文件与 Git 查询，以及审计/恢复检查点的 application-defined capability。它不为当前仓库内容设置第二道接纳门槛，也不暴露 model-callable Memory CRUD Tool。
_避免使用_：Memory tool、filesystem watcher、Git event source、generic repository

**Memory Commit**：
Memory Repository 中的普通 Git commit。Git 作者和拓扑保持原样；BotHarness 可以另记一次可信操作结束时的 HEAD、actor 与 cause，作为审计/恢复检查点，而不是文件成为记忆的许可。
_避免使用_：accepted commit、file save、filesystem event、auto-save

**Memory Observation**：
Host 看到的仓库状态的可信记录，可关联受信任的 Orchestrator Session 与 Source Event。它说明状态何时被看到，不推断 Git 内容的作者；观察不会暂存、提交、拒绝或隐藏当前工作树文件。
_避免使用_：commit acceptance、filesystem watch、background distillation

**Memory Recovery Checkpoint**：
对某次观察到的 Memory Repository 分支、HEAD、暂存区与工作树的可恢复记录。来源说明观察或显式命令的上下文，不推断文件作者；恢复需 Human 确认，并保留恢复前的完整仓库。
_避免使用_：accepted commit、auto-save、Git author、普通 Inbox 观察

**Attachment**：
随 Source Event 接收、由 Host 管理的真实文件，其身份独立于当前字节内容和发送者最初上传的源文件。引用它的消息展示外部编辑后的当前内容；独立上传的文件彼此独立，只有 PersonaBot 显式保存在自己的 Memory 或 Workspace 中时才拥有单独副本。
_避免使用_：upload、provider URL、per-Bot inbox copy、database blob

### 分享

**SoulSnapshot**：
历史术语：由选定 Memory 文件（存在 Soul 时也包含在内）、`bot.md` manifest 与 setup instructions 组成的不可变 content-addressed package，原计划作为 registry 存储、列出与导入的单元。分享单元已由完整 Memory 仓库分享（ADR-0131）取代。
_避免使用_：export、backup、bot zip、image

**PersonaBot Export**：
历史术语（ADR-0134 退役）：不可变、带版本的 transfer package，始终包含一个 SoulSnapshot，并可包含显式选择的 operational Export Facet。单个 Bot 现在通过它的 Memory Git 仓库分享（ADR-0131），整份 Profile 通过 Profile Backup 迁移。
_避免使用_：SoulSnapshot、database copy、live clone、registry version

**Export Facet**：
历史术语（随 PersonaBot Export 退役）：PersonaBot Export 中 dependency-closed、带 schema version 的可选部分，例如 Source Event 与 Attachment、Inbox 与 attention facts、Trigger 与 Wake Policy、Messaging Archive、disabled Service Grant declaration，或等待 rebind 的 provider account reference。
_避免使用_：arbitrary table dump、credential bundle、active permission

**Messaging Archive**：
选定 Messaging facts 的带版本、可移植、只读导出，可选择包含从同一 snapshot 派生的 per-Channel NDJSON view。它不是第二个 authority，也不包含 credential。
_避免使用_：Channel authority、database backup、live inbox

**Rebinding Request**：
一种 inactive 的导入 reference，用来描述 Human 可以在本地重新连接并授权的 provider account 或 authority；在此之前，它不能 admit event、wake PersonaBot 或执行 Service Action。
_避免使用_：credential、Service Grant、automatic reconnect

**Bot Marketplace**：
harness 中打开、用于浏览、搜索和安装可分享 Bot 的 hosted catalog。只列出 Indexed Repository，没有账号，也没有上传的 Bot（ADR-0131、ADR-0135）。
_避免使用_：store、hub、Soul registry

**Indexed Repository**：
带有 `botharness-bot` topic、被 Bot Marketplace 以引用方式列出并定期刷新的公开 GitHub 仓库。安装它即以其 Git URL 创建新的 PersonaBot；它不是 SoulSnapshot、Listing 或 Version。
_避免使用_：submission、Listing、SoulSnapshot、mirror

**Bot Zip**：
单个 PersonaBot 的 Memory 文件打成的 `.zip`，附带 `.botharness/bot.json` 描述和头像，由 Human 导出后交给别人；导入时创建新的 PersonaBot。默认只含文件，只有整个 Bot 导出并勾选时才带 Git 历史。不含身份、Session、绑定或凭据（ADR-0135）。
_避免使用_：PersonaBot Export、SoulSnapshot、backup

**Soul registry**：
历史术语（ADR-0019/0020）：原计划存储、版本化并提供 SoulSnapshot 的 hosted service，已由 Bot Marketplace（ADR-0131）取代。
_避免使用_：hub、store、database

**Listing**：
bot 在 Soul registry 中的存在形式：一个 `@handle/slug` namespace、一段 description 以及它的 Version。
_避免使用_：repo、page、entry

**Version**：
一个由 Human 命名的 tag，指向某个 Listing 下一个不可变 SoulSnapshot digest。
_避免使用_：release、build、revision

**Handle**：
account 唯一的公开标识符，作为其 Listing 的 namespace；绝不使用 account email。
_避免使用_：username、account id

**Bot set**：
一组计划一同导入、带名称的 Listing。
_避免使用_：collection、bundle、pack、team

**Export**：
历史术语（随 PersonaBot Export 退役）：生成 PersonaBot Export。整份 Profile 用 Profile Backup，单个 Bot 用 Memory Git 仓库。
_避免使用_：database dump、live clone、publish

**Import**：
从分享的 Memory Git 仓库（Git URL 或 Bot Marketplace 安装）创建新的 PersonaBot；始终产生副本，导入的 operational authority 会保持 disabled，直到被显式 rebind 或 reauthorize。
_避免使用_：install、clone、pull、restore

**Publish**：
将 SoulSnapshot 作为一个 Version 上传到 Soul registry。
_避免使用_：upload、push、submit

### 协作

**Actor**：
能够参与 Channel 并创作 message 的 Human 或 PersonaBot；Bridge 负责承载 Actor 的 message，但自身不是 Actor。
_避免使用_：client、connector、bridge identity、caller-supplied sender

**Human ID**：
本地 Human 在一个 DSH Profile 内的稳定身份，跨 Channel、改名和 Human Channel nickname 保持不变。
_避免使用_：display name、nickname、browser tab

**Human display name**：
本地 Human 在一个 DSH Profile 内可修改的默认名称。Human Channel nickname 可覆盖该名称，用于对应 Channel 的消息作者、成员列表与提及展示。
_避免使用_：Human ID、login name

**Human Channel nickname**：
本地 Human 在一个 Channel 内选择的名称，包括 DM 或 Group Channel；它在该 Channel 内覆盖 Human display name。它标记同一个 Human ID，不创建独立 Human Inbox 或角色扮演 Persona。
_避免使用_：Channel name、PersonaBot display name

**Actor mention**：
Channel 中按稳定身份指向 Human 或 PersonaBot 的可信引用，以该 Actor 在消息所属 Channel 中的当前名称展示。改名更新可见标签，同时保留原提及目标。
_避免使用_：name-matched text、stored display name as identity

**Source Event**：
从 Channel、Bridge、webhook、Session 或 system source 接收的不可变本地事实，保存其内容唯一的本地副本与可信 provenance。它可以出现在 Channel 中，也可以被 admit 到任意数量的 Bot Inbox，但两种关系都不拥有另一份内容副本。
_避免使用_：inbox message、mailbox copy、notification payload、stimulus

**Provider Echo**：
provider 对 BotHarness 已发送 message 的 inbound reflection。成功关联时，它会丰富既有 Source Event 与 Outbox receipt，而不会产生新的 attention；无法匹配、但 sender 是自身的 echo 保持 unresolved，且不能 wake PersonaBot。
_避免使用_：new user message、duplicate Channel message、delivery success by assumption

**Source Revision**：
一种新的 Source Event，用于记录观测到的、针对较早 Source Event 的 edit 或 retraction，同时保持原事实不变；各 revision 组成一条 causal chain，可从中派生当前呈现。
_避免使用_：in-place edit、overwritten message、replacement body

**Unresolved Revision**：
在其原始 Source Event 之前收到的 Source Revision；在 causal chain 与 target 被链接或 reconcile 前，它会根据可信 external identity 被保留，但不会 admission 或 wake。
_避免使用_：invalid event、orphan to discard、latest by arrival

**Revision Conflict**：
两个或更多已保留的 Source Revision，无法证明它们当前的先后顺序；依赖 current content 的 external action 保持不可用，直到 provider reconciliation 或 Human resolution 完成。
_避免使用_：latest arrival wins、merge guess、retryable error

**Attention Unit**：
PersonaBot 当前对一条 Source Event revision chain 的一次 consideration；尚未 Observation 的 revision 合并进同一个 Attention Unit，而 Observation 之后发生的变更会形成新的 attention。
_避免使用_：mailbox item、message copy、delivery attempt

**Channel**：
平台原生的 conversation space；类型为 `dm`（两位 Actor：一位 Human 与一个 PersonaBot，或两个 PersonaBot）或 `group chat`（多个 member；非正式称为 chatroom）。Channel 在本地保留自己的历史。两种类型遵循同一套 Channel section 归属、顶层顺序、拖拽与移动规则；Human–PersonaBot DM 保留其 PersonaBot 头像表现。
_避免使用_：room、server、board

**Hidden Channel**：
因 Human 的呈现选择或 Bot-to-Bot DM 的默认规则而从展开与折叠 roster navigation 中省略的 Channel。隐藏会保留 Channel membership、history、routing、PersonaBot 与 Memory 状态，也会保留它的 pin、section 和 order placement；Human 可以打开查看，也可以恢复自己主动隐藏的 Channel。
_避免使用_：deleted Channel、archived Channel、muted Channel、Content Purge

**Channel Deletion**：
由 Human 确认，结束某个 Channel 活跃成员关系和路由的操作，同时保留历史及因果归属。它不同于可恢复的隐藏，也不同于另行确认的 Content Purge。
_避免使用_：Hidden Channel、Content Purge、provider conversation deletion

**Channel section**：
用户创建、可折叠的 Channel 分组，显示在 bot-mode sidebar 中。它只是本地 display arrangement，不属于 Soul。
_避免使用_：folder、category、group

**Section order (区块顺序)**：
bot-mode sidebar 中 Channel section 的相对顺序：默认按创建顺序，之后可由用户排列。未分组 Channel 可以占据 section 之间的顶层位置，但不会因此成为 section。
_避免使用_：priority、layout order

**Sort mode (排序模式)**：
sidebar scope 对其行进行排序的方式：`auto`（最新 message 优先）、`manual`（用户冻结的顺序）或 `inherit`（遵循全局默认值）。
_避免使用_：ordering、sort preference、sorter

**未分组 (Ungrouped)**：
Channel 不属于任何 Channel section 时的 membership state。未分组 Channel 以松散顶层行呈现，可位于 section 之间；它没有 bucket header 或折叠状态。
_避免使用_：default folder、inbox、fixed bottom bucket

**Bridge**：
从 external source（如 IM 会话，未来还有 webhook）到某个显式 Channel 或 PersonaBot Inbox target 的已配置连接；它承载 inbound delivery 并暴露 outbound capability，但不会成为 Actor。对于 IM 会话，它列在「外部连接器 / External connector」中；PersonaBot 自己的外部身份是另一回事。
_避免使用_：integration、adapter、裸用 connector

**Conversation ingest**：
外部会话接入。由 Channel 持有的单向连接：把某个外部会话的每条消息作为 Source Event 放进该 Channel，成员 PersonaBot 默认只获得「仅作上下文」的 Admission；接入的唤醒设置可改为攒够条数后唤醒或逐条唤醒，成员在该 Channel 中的唤醒策略优先。它列在「外部连接器」中，显示为外部会话；它不给任何 PersonaBot 回复或其他权限。在 slice 9 合并之前，Bridge 指 Bot 持有的路由，Conversation ingest 指 Channel 持有的接入。
_避免使用_：sync、mirror、用 Bridge 指代这条记录

**App**：
UI 上叫「应用」：一个已认证 Provider account 的名称，例如 Lark 应用、Slack 应用、Discord bot 或已配对的微信 Bot。一个应用最多绑定到一个 PersonaBot；一个 PersonaBot 可以绑定多个应用，包括同一平台的多个应用。「设置 → IM 应用」列出每个应用及使用它的 Bot。
_避免使用_：UI 文案里的「IM账号」、connector、integration

**Default traffic**：
启用的外部身份 Binding 无需逐会话同意即可接收的消息：发给应用的私聊，以及合格 Provider 报告为 @ 该应用的群消息。谁能触达应用由平台决定；群里的普通文字、跟进的话题和 Channel 同步仍需显式开启。
_避免使用_：全部消息、已授权流量、开放收件

**External User Role**：
PersonaBot 为已配对外部 IM 人员设置的角色，包含自然语言行为权限及 Host 校验的显式管理能力；管理能力可以为空。行为权限是模型策略，模型通过按需查询当前权限读取行为策略，不逐消息自动注入角色；普通聊天资格与管理权限不互相隐式授予。
_避免使用_：原生 DSH 角色、资源 ACL、把所有角色称为管理员

**Chat pairing**：
Human 审核后，将外部人员与一个 PersonaBot 及其当前已认证 App Binding 下的角色关联。可在该范围内允许的会话中复用，批准后须重新提问；不继承到其他 Bot、App、平台或重新建立的 Binding。
_避免使用_：会话成员资格、账号级管理员、待执行旧指令

**Conversation entry**：
一个 Binding 的单个会话流量所挂靠的锚点，存为 Messaging Grant。_隐式_ 条目在第一条被接收的默认流量消息或第一次主动发送时记录；_显式_ 条目来自保存的发送目标。_等待处理_ 的条目等 Human 决定（先问我，或达到上限），只保留元数据。_已屏蔽_ 的会话有一个按 Bot、应用指纹、会话类型和 ID 记录的持久屏蔽，直到 **再次允许** 前都会被拒绝。静音的条目照常接收，但不会唤醒 Bot。
_避免使用_：授权（指隐式条目时）、投递目标、订阅

**New-conversation mode**：
Binding 对尚无条目的会话的处理方式：`auto`（自动接收，默认）记录隐式条目并接收消息；`ask`（先问我）把它放到等待处理。自动创建有上限：每个 Binding 每小时 20 个新条目、同时 500 个活跃条目。
_避免使用_：白名单、审批模式、自动回复

**Bot Inbox**：
PersonaBot 层级的 view，包含被 admit 供其 attention 的 Source Event，无论 event 是否属于某个 Channel。它不是第二个 content store：读取是一项显式行为，也允许 ignore。
_避免使用_：queue、mailbox、backlog

**Inbox Admission**：
一种持久关系，用来说明一条 Source Event 为何有资格进入某个 PersonaBot 的 attention，并记录该 Bot 的 read、defer 或 ignore facts。它引用 Source Event，绝不复制其内容。
_避免使用_：inbox item body、delivery job、message copy

**Bot Self-Record**：
Bot 自我记录。关于 PersonaBot 自己的一次 Memory commit 或一次 BotHarness 工具动作的 Source Event：作为 Channel Notice 出现在引起它的 Source Event 所在的 Channel，同时以已处理状态进入该 PersonaBot 的 Bot Inbox。Bot 之后可以查到自己做过什么、为什么做，但它永远不会成为 attention，也不会叫醒 Bot（ADR-0154）。
_避免使用_：activity log、tool trace

**Channel Notice**：
频道事件行。Channel 历史里由系统呈现的一行，记录发生了什么（例如一次 Memory commit 或某个 Bot 的动作），而不是某位参与者说的话。它没有已读或未读，也不会叫醒或通知任何人（ADR-0154）。
_避免使用_：message、notification、system message（单独使用）

**Inbox Trigger**：
由 PersonaBot 拥有的持久 Host rule，负责匹配 Source Event 并创建 Inbox Admission，包括 admission reason、priority 与 Wake Policy selection。PersonaBot 自己塑造这些规则，Human 可以查看、覆盖或冻结；template 可以提供初值，Bridge 绝不拥有 attention 或 wake behavior，安全闸门永远不属于规则。
_避免使用_：bridge、wake policy、model trigger、scheduler

**Messaging Policy**：
一种带版本的 Host rule 或 authorization，其精确 revision 必须参与 Messaging transaction，包括 Inbox Trigger、Wake Policy selection、provider account reference 与 Service Grant。它属于 Messaging store；无关的 PersonaBot、Session、Roster 与 UI state 不属于其中。
_避免使用_：all bot state、model instruction、settings（单独使用）

**Attention Decision**：
一项可审计的 PersonaBot fact，表示某个 Inbox Admission 已被 observe、defer、ignore 或 handle；pending state 从这些 fact 中派生，而不是作为 delivery lifecycle 存储。
_避免使用_：mailbox status、Agent delivery state、consumed flag

**Observation**：
可执行的 Source Event content 或忠实、可执行的 summary 进入 Orchestrator turn context，或被 Orchestrator 显式读取的时刻。transport queuing、metadata listing 与 Human UI viewing 都不是 Observation。
_避免使用_：delivery、notification、human read receipt、outbox success

**Reply Route**：
一种非 secret 的 capability reference，使 Host 能通过正确的 Channel 或 Bridge service 回应 Source Event 的 origin。
_避免使用_：provider credentials、model-selected adapter、callback URL

**Reply**：
通过可信 Reply Route 对已有 Source Event 作出的响应；provider 与 destination 由 Host 而不是 model 选择。
_避免使用_：provider tool call、proactive post、arbitrary send

**Service Action**：
PersonaBot 有意调用的 provider-specific capability，例如向指定 Feishu channel 或 thread 发帖；即使 target 是从 Source Event 中发现的，它也有自己独立的 authorization。
_避免使用_：reply、automatic routing、raw provider API

**Provider Capability**：
某个已配置 provider account 的 adapter 声明可支持的 operation 或 event，例如 recall event、current-message fetch、reply 或 proactive posting。Capability 只代表可用性，绝不代表 authorization。
_避免使用_：permission、grant、installed plugin、tool visibility

**Provider Account Fingerprint**：
由已认证 adapter 根据 provider 签发的 tenant 或 organization、application 或 bot，以及 account identifier 派生的稳定、非 secret provider identity。Managed Restore 使用精确匹配并经过 Human confirmation 来重新绑定 suspended authority；credential reference 与 display name 永远不能作为 identity。
_避免使用_：credential reference、secret hash、account label、guessed provider identity

**Service Grant**：
Human 对 PersonaBot 的显式 authorization：允许它通过某个 provider account，对精确、分组或显式 wildcard 的 target scope 执行指定 Service Action；在接受 intent 时与执行 side effect 时都必须验证。
_避免使用_：provider capability、plugin installation、discovered target、blanket consent

**Content Purge**：
从 Messaging authority 中显式、破坏性地移除 Source Event body 与非共享 Attachment，同时保留因果关系与审计所需的最小 event envelope 和 tombstone。
_避免使用_：recall、hide、archive、garbage collection

**Purge Everywhere**：
一项需要单独确认的破坏性操作：执行 Content Purge，并删除 dependency report 披露的、选定的 managed Memory、Workspace 与 export derivative；BotHarness 控制之外的副本仍由 Human 负责。
_避免使用_：content purge、automatic cascade、external recall

**Purge Ledger**：
Content Purge 的单调递增记录；Managed Restore 会先合并并应用该记录，再开放 Messaging。独立 offline backup 只能保证其中所含的 purge checkpoint；手动保留的旧文件仍不受后续 purge 控制。
_避免使用_：database snapshot、deletion queue、audit log（单独使用）

**Outbox Intent**：
针对一次 external side effect 的持久 request，绑定到 idempotency identity、当前 Source Revision、Provider Capability，以及在需要时绑定 Service Grant。
_避免使用_：message、retry attempt、delivery notification

**Unknown Outcome**：
一种需要 Human resolution 的 Outbox state：provider request 已经开始，但在完成所有可用 reconciliation 后仍无法证明成功或失败；PersonaBot 不能自行安全 retry，也不能宣称成功。
_避免使用_：failure、timeout、retryable error、success

**Bot Schedule**：
「定时任务」。由 PersonaBot 拥有的持久 Host rule，在计划时刻把一条 `schedule` Source Event admit 进它的 Bot Inbox。Human 与 PersonaBot 都可以管理；Human 锁定后 PersonaBot 只能查看。它挂在 PersonaBot 上，绝不绑定某个 Session。
_避免使用_：cron job、DSH Schedule、timer、heartbeat、scheduled Assignment

**Wake Policy**：
确定性的 Host policy，决定已 admit 的 event 是立即 wake PersonaBot、并入 digest，还是不触发 automatic wake。UI 上称为「唤醒策略 / Wake policy」；它从不通知 Human。
_避免使用_：model decision、delivery mechanism、scheduler、提醒策略、attention policy、notification

**Delivery Policy**：
Host policy，依据 Wake Policy decision 与 Orchestrator liveness，将后续动作映射为安全 step 处的 steer、下一次 harvest，或不唤醒。
_避免使用_：wake policy、inferred step state、message priority

**Turn harvest**：
一次 Orchestrator turn 消费整个就绪 attention 集合——所有未处理的即时项、达到阈值的 digest 批次与被动 notice——而不是一事件一回合。steer 的直达地址改为加入正在运行的回合。
_避免使用_：per-event queue、wake storm、batch（单独使用）

**Activity Center**：
「活动中心」是 Bot 模式中面向 Human 的跨 PersonaBot、跨 Channel 入口，包含运行总览与个人 Human Inbox。它汇总已有权威事实，不成为消息、用量或 Session 活动的另一份权威。
_避免使用_：Human Inbox（指整个入口时）、dashboard list

**Human Inbox**：
Activity Center 内的个人 attention 视图：未解决的 Human 行动、提及与回复、未读 Channel 活动、信息更新及已处理历史。它引用所属权威事实，不复制 Channel 内容，也不会把每条 Bot Inbox 事件都摊成 Human 工作。
_避免使用_：notifications、Bot Inbox、dashboard list

**Channel Attention**：
由 Channel activity 产生的 Human Inbox item，例如未读消息、mention 或 reply；它引用所属 Source Event，除非被归类为 action-required，否则 Human 可以忽略。
_避免使用_：Channel Inbox、copied message、Bot Inbox Admission

**PersonaBot Attention**：
由 PersonaBot 等待 Human、进入 blocked、需要 approval 或发送 informational report 所产生的 Human Inbox item。
_避免使用_：personal attention、Bot state、notification

**Channel membership**：
Actor 对 Channel 的参与关系，携带 owner/member role 以及在其中 read 或 send 的 authority。
_避免使用_：subscription、notification policy、caller claim

**Channel reference**：
Human 选中的现有 Channel 指针（Channel 引用），以稳定的 Channel ID 标识。它帮助被告知的 PersonaBot 找到 Channel，但不授予成员资格，也不披露对话内容或向成员发消息。
_避免使用_：Channel 邀请、成员资格、手打的 #名称

**Group invitation**：
Group 的 Bot 创建者向活跃的非成员 PersonaBot 发出的待处理入群邀请。只有受邀 Bot 接受后才成为 Channel membership；Bot 模式的默认自动接受可代为接受。接受前邀请不授予任何 read 或 send 权限。
_避免使用_：join request、成员授予、Channel 引用

**Group join request**：
尚未入群的 PersonaBot 请求加入被引用的 Group Channel 的待处理事实（入群申请）。只有获得授权的 Human 或该群的 Bot 创建者接受后，它才成为 Channel 成员。
_避免使用_：邀请、自动入群、Channel 提及

**Bot Channel subscription**：
PersonaBot 对已加入 Channel 的逐 Channel attention preference，归该 PersonaBot 所有：`all`（每条普通消息都成为 attention）、`digest`（普通消息按 count 与 interval 进入唤醒汇总；默认）、`mentions`（只有直接 @ 能到达 Bot）、或 `silent`（普通消息记录为 attention，但永不唤醒）。直接 @ 与 DM 永远可达；Human 可以覆盖该 preference，它独立于 membership 与 send authority。
_避免使用_：membership、wake decision、digest schedule

**Message provenance**：
Channel message 的可信 origin 与 causal identity——包括它的 Actor、ingress surface 与 external identity，以及任何 reply 或 Bot-to-Bot chain。
_避免使用_：caller-supplied author、transport metadata（单独使用）

### 聊天与回复

**Chat**：
PersonaBot 参与的 Feishu/Lark conversation——group 或 p2p——通过 `chat_id` 识别。
_避免使用_：room、channel、group（当含义也包括 p2p 时）

**DM**：
两位 Actor 之间的一对一 conversation——即 `dm` 类型的 Channel，或它的 bridged equivalent。Human–PersonaBot DM 是 Human 与一个 Bot 的直接对话；Bot-to-Bot DM 有两个 PersonaBot 参与者，Human 可以只读查看而不成为参与者。
_避免使用_：private chat、PM

**Bot-to-Bot DM**：
两个参与者都是 PersonaBot 的 DM Channel。一个 Bot 发出的消息是该 Channel 中的 Source Event，可以进入另一个 Bot 的 Inbox；Human 的只读查看独立于 Channel membership。
_避免使用_：peer relay bus、copied inbox conversation

**Thread**：
通过回复 Chat 或 Channel 中某条 message 而开启的 sub-conversation。
_避免使用_：topic、sub-chat、channel

**Reply scope**：
PersonaBot answer 的落点：位于 Chat 中 triggering message 下方（root），或进入新 Thread。
_避免使用_：reply mode、answer position、visibility

### Host（宿主）与设置

**PersonaBot registry**：
拥有 PersonaBot definition、archive state、binding 与 Session ownership 的 Host module；其 operational record 存储在 BotHarness operational database 中，而 Soul content 仍保存在文件中。
_避免使用_：config file、database、fleet

**BotHarness operational database**：
整个 Profile 共用的单一 `botharness.db`，物理存储全部 BotHarness operational record，同时各 deep module 保持独立 interface 与 table ownership。它保存对 Soul file、attachment content、DSH Session log、credential 与 DSH-native setting 的引用，但绝不取代这些对象。
_避免使用_：Messaging database、DSH storage domain、Soul store、generic repository

**Profile Backup**：
一种自包含、带版本、压缩的 `.botharness-backup` 文件，包含完整 operational-database snapshot、所有 Soul/Memory file、所有 reachable CAS object、integrity manifest，并可选择包含通过 SessionPersistence 生成的 DSH Session facet；它仅由 Human 显式 export 创建，绝不会由 scheduler 或 dangerous-operation hook 自动创建。
_避免使用_：PersonaBot Export、copied database、SoulSnapshot

**Managed Restore**：
Profile Backup 的 identity-preserving recovery path；在挂载 operational state 之前执行 compatibility、identity-conflict、integrity 与 Purge Ledger 检查。
_避免使用_：import、clone、PersonaBot Export

**Runtime Dependency Manifest**：
一种非 secret declaration，列出 restored profile 可能需要的 provider adapter、model、plugin、tool、Skill 以及其他 target-local capability；包括 required-versus-optional scope 与 compatibility identifier，但绝不包含 executable code。
_避免使用_：plugin bundle、credential inventory、historical tool log、package installer

**Dependency Contract**：
由 Host 拥有的稳定 capability identifier，加上所支持的 interface 与 persisted-schema version range。它用于判断 compatibility，而不要求 producer 使用完全相同的 plugin build；security-critical 或 integrity-critical requirement 不能被 imported package 降级。
_避免使用_：exact package lock、display name、exporter-defined trust、implementation version

**Desired Dependency Reference**：
对 PersonaBot 想要使用的 model、provider、plugin capability、Skill、tool 或 Workspace identity 的可移植 declaration；它的保留独立于当前 Host 如何满足该需求。
_避免使用_：installed package、local path、resolved credential、runtime handle

**Target Resolution**：
经过 Human confirmation、仅对当前 Host 有效的 mapping，将 Desired Dependency Reference 映射到可用的 model、adapter、plugin capability、Skill、tool、credential reference 或 Workspace。新的 Host 必须重新完成 resolution。
_避免使用_：portable authority、overwritten desired configuration、automatic fallback

**Activation Readiness**：
将 restored declaration 与当前可用 dependency 和 mapping 对照后得到的 target-local projection。它按 capability 划分，并报告为 `ready`、`degraded` 或 `blocked`；它不会改变 profile data 是否成功 restore。
_避免使用_：restore result、PersonaBot activity、plugin installation state

**PersonaBot Activation**：
restore 后由 Human 发出的显式 command：接受当前 Activation Readiness，创建全新的 Orchestrator Session，并且只开放 dependency-ready 且已授权的 execution path。它绝不恢复旧 Session。
_避免使用_：profile data activation、dependency installation、automatic resume、unarchive

**Profile Writer Lease**：
一个 Host 对 Profile operational database 进行 write mount 的、由操作系统支持的排他权。第二个 Host 可以提供 diagnostics，但不能运行 PersonaBot 或修改 operational state。
_避免使用_：SQLite busy timeout、timestamp lock、browser leader

**Schema Generation**：
整个 operational database 唯一、单调递增的 compatibility version；各 deep module 提供有序 migration step，但 database owner 负责验证并应用一次 generation transition。
_避免使用_：per-table version、plugin version、migration filename

**Export Origin**：
cloned record 上的结构化 provenance——包括 export id、source installation id 与 source local id——并且在保留这些信息的同时，为每个 imported object 分配新的 local id。
_避免使用_：preserved local id、provider authority、display label

**Backup Barrier**：
一次短暂的、Profile-wide mutation pause：drain BotHarness transaction，将选定 DSH Session flush 到已记录的 durable cursor，固定 Soul/Memory 与 CAS reference，并启动一致的 database snapshot，但不停止 active turn。
_避免使用_：Host shutdown、PersonaBot archive、fuzzy copy

**Unavailable Session Reference**：
一份保留的 Session ownership/audit record，其 DSH Session content 未包含在 Profile Backup 中或不受支持；只有显式 repair 或 relink 成功后才可以恢复。
_避免使用_：deleted Session、empty Session、unowned Session

**Unavailable Workspace Reference**：
已 restore 的 Workspace locator，但其 target directory 尚未在当前 Host 上完成显式 mapping 与 verification。它的 source path 与 identity hint 仍作为 evidence 保留，但相关 Assignment Session 无法恢复。
_避免使用_：missing directory to auto-create、broken Session、trusted absolute path

**Redaction Tombstone**：
一种 typed export placeholder，在有意省略 sensitive content 的同时保留 identity、dependency、hash 与 provenance，使 Export Facet 永远不会包含 dangling reference。
_避免使用_：missing row、empty string、Content Purge

**Import Receipt**：
以 destination profile 与 export id 为 key 的持久 result，用于保证普通 PersonaBot import 幂等；显式请求的额外 Clone 会获得独立 receipt 与新的 local id。
_避免使用_：Export Origin、registry Version、retry token

**Profile Transfer**：
将一个 Profile generation 从 source Host identity-preserving 地移动到 target Host 的规划流程；完成后 source 保持 Transferred Out，防止两个 installation 同时运行同一批 PersonaBot。
_避免使用_：Profile Backup、clone、sync

**Transfer Generation**：
在 Profile Transfer 过程中，将一个已 quiesce 的 source、其 Profile Backup 与一次 target activation 关联起来的唯一 generation。
_避免使用_：Schema Generation、backup timestamp、export id

**Transferred-out Profile**：
已经完成 Profile Transfer 源端流程的 source profile，因此不能运行 PersonaBot、接收 provider event 或执行 external action；除非后续显式 recovery protocol 为其授予新的 active generation。
_避免使用_：Archived PersonaBot、stopped Host、backup source

**Disaster Restore**：
在无法证明旧 Profile 已 deactivate 的情况下执行的 Managed Restore；已 restore 的 provider binding、provider-bound Trigger 与 Service Grant 保持 suspended，直到 Human 解决潜在 split brain。
_避免使用_：Profile Transfer、clone、ordinary restore

**Roster**：
bot-mode sidebar 中展示 PersonaBot 与 Channel 及其 state 的列表。
_避免使用_：dashboard、bot list

**App Sidebar**：
DSH 原生 client 的左侧栏；在 Bot mode 中呈现 Roster。采用此名称是为了与右侧的 Channel sidebar 区分。
_避免使用_：left sidebar、main sidebar、navigation

**Channel sidebar**：
Bot mode panel 中由当前所选 Channel 决定 scope 的右侧区域：group Channel 显示 membership 与 Channel management entry，PersonaBot DM 显示该 PersonaBot 自己的 Assignment、Memory、Bot Inbox 等 entry，以及它的运行配置：Model Plan、Wake Policy、外部身份、外部连接器与审批。它不是 DSH 原生、由 Session 决定 scope 的右侧栏。
_避免使用_：PersonaBot navigation、right panel、session panel、inspector、workbench

**Channel body**：
Bot mode panel 的中间区域，包含所选 Channel 的 header、primary content 与 composer；DM 在这里呈现 Chat。
_避免使用_：main pane、conversation view、chat panel

**Channel sidebar entry**：
Channel sidebar 中一个已注册、可折叠的 item，具有稳定 id、label、order、scope 与 renderer，可用于展示信息、提供 control，或同时承担两者。不可用的 entry 直接缺席，不显示 placeholder。
_避免使用_：widget、card、tab、destination、Channel section

**PersonaBot Profile**：
单个 PersonaBot 可分享的身份与只读活动 surface：身份会在分享 PersonaBot 时随之带走（Display name、Avatar、Profile Banner、Bot Tag、Bot Bio）；活动包括由其 owned Session 派生的 token 用量、来自 Bot Inbox Admission 的事件活跃度，以及 Memory commit 活跃度。Model Plan、Wake Policy、外部身份、Bridge、审批等运行配置不属于它，而在 Channel sidebar 中。它以 Profile popover 的紧凑形态出现在 DM header 的头像旁，并展开为 Channel body 中的 Profile view。
_避免使用_：account、dashboard、bot page、裸用 profile、settings page

**Group Profile**：
单个 Group Channel 的名称、头像，以及基于已提交 Channel 消息的活动 surface，按天和作者展示消息数量，并区分 Human 与 PersonaBot 作者；成员 Wake Policy、Bridge 等群配置在 Channel sidebar 中。群聊 header 打开弹层及 Channel body 详情；DM Channel 只有对应的 PersonaBot Profile。
_避免使用_：PersonaBot token 用量、群管理侧栏、DM Channel Profile

**Approver**：
与某个 PersonaBot 完成配对、并由 Web Human 授予审批能力的外部 IM 用户。审批请求发往 Approval destination；任一 Approver 最先被接受的决定生效。看到请求、身处请求所在的群或同名都不构成权限，其他人的决定会被拒绝，不会到达 PersonaBot。
_避免使用_：admin、moderator、group member、recipient

**Approval destination**：
从 PersonaBot 的外部连接器中选出的 IM 会话（私聊或群聊），Host 会把每个已提交的审批请求发到这里。收到请求不等于有权决定。
_避免使用_：approver、notification channel、webhook

**Profile popover**：
PersonaBot 或 Group Profile 的紧凑形态，锚定在 Channel body header 的头像旁。它只显示 Human 为相应 scope 固定的 Profile Card，并提供进入 Profile view 的入口。
_避免使用_：menu、dropdown、tooltip、card stack

**Profile view**：
PersonaBot 或 Group Profile 的展开形态。它占据 Channel body，暂时替换 Chat 的历史与 composer；离开后 Channel body 回到 Chat，且不改变 Channel sidebar 中的任何内容。
_避免使用_：panel、page、tab、inspector、settings

**Profile Card**：
PersonaBot 或 Group Profile 中一个已注册的 component，具有稳定 id、label、order、scope、visibility rule，以及 compact 与 full 两种 renderer，可用于展示信息、提供 control，或同时承担两者。Human 可以把 Profile Card pin 到相应的 Profile popover。
_避免使用_：widget、tile、gadget、Channel sidebar entry

**Client bridge**：
Web Client 用于读取 PersonaBot 并调用各自独立 mutation command 的 RPC surface，不与 Client 共享 Host service。
_避免使用_：remote、IPC、gateway

**Bot Settings**：
BotHarness 自有的 modal（Bot 设置），承载 profile 级的 BotHarness 配置，按自己 sidebar 中的 Bot Settings section 组织。单个 PersonaBot 或单个 Channel 的配置不在这里，而是 Channel sidebar entry。DSH 自带的设置 modal 称为 DSH settings；其中的 Bot 设置 项只负责指向 Bot Settings，App 凭据仍留在 DSH settings。
_避免使用_：Settings UI、settings page、preferences、admin panel、dashboard、web console

**Bot Settings section**：
Bot Settings 的一个 sidebar 目的地：稳定的 id、label、order，以及渲染一组内聚的 profile 级设置的 renderer。
_避免使用_：tab、page、settings item、Channel sidebar entry

**Access policy**：
每个 PersonaBot 各自维护、允许访问它的 user 与 Chat 列表。
_避免使用_：whitelist、permissions、ACL

**Credential reference**：
指向由 DSH credentials service 保存的 Feishu App Secret 的引用；secret 本身永远不会进入 config、repo 或 log。
_避免使用_：secret、API key、token

### 遥测与推广活动

**Telemetry**：
Host 发送到项目分析服务的匿名产品使用事件，默认开启，可用插件配置 `telemetry: false`、`DO_NOT_TRACK=1` 或 `BOTHARNESS_TELEMETRY=0` 关闭。从不包含名称、Memory、对话内容、路径或 IP 地址（ADR-0132）。
_避免使用_：追踪、分析 SDK、崩溃上报器

**Install ID**：
插件安装首次启动时随机生成、附在其 Telemetry 上的标识。它标识一次安装而不是某个 Human，也从不与官网访客关联。
_避免使用_：用户 ID、设备 ID、机器 ID

**Campaign**：
一次宣发（例如一次发布），把为它创建的 Campaign Link 归为一组；其 slug 即 `utm_campaign`。
_避免使用_：广告、促销

**Campaign Link**：
`go.botharness.ai` 上对应 Campaign 中某一条帖子或视频的短链，带有平台和媒体类型；访问时重定向到官网并附上 UTM 参数，同时计入点击。
_避免使用_：短网址、UTM 链接、邀请链接
