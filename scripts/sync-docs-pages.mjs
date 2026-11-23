export const DEV_SECTION_ORDER = Object.freeze({
  design: 1,
  guides: 2,
  reference: 3,
  adr: 4,
});

const ARCHITECTURE_DIAGRAMS_ZH = [
  { name: '01-system-context', caption: '系统上下文' },
  { name: '02-modules', caption: 'Deep modules 与所有权' },
  { name: '03-boot', caption: 'Host 启动、迁移与 recovery' },
  { name: '04-create-bot', caption: 'Messaging 事务与外部副作用' },
  { name: '05-im-binding', caption: 'Orchestrator 与 Work control plane' },
  { name: '06-state', caption: '持久化、导出与恢复边界' },
];

const ARCHITECTURE_DIAGRAMS_EN = [
  { name: '01-system-context', caption: 'System context' },
  { name: '02-modules', caption: 'Deep modules and ownership' },
  { name: '03-boot', caption: 'Host boot, migration, and recovery' },
  {
    name: '04-create-bot',
    caption: 'Messaging transaction and external side effects',
  },
  { name: '05-im-binding', caption: 'Orchestrator and Work control plane' },
  { name: '06-state', caption: 'Persistence, export, and restore boundaries' },
];

const DSH_CONTEXT_DIAGRAMS_ZH = [
  {
    name: '07-dsh-runtime-composition',
    caption: 'Runtime composition 与 lifecycle ownership',
  },
  {
    name: '08-dsh-session-facts',
    caption: 'Durable fact、live notification 与 derived view',
  },
  { name: '09-dsh-host-client', caption: 'Host/client boundary' },
];

const DSH_CONTEXT_DIAGRAMS_EN = [
  {
    name: '07-dsh-runtime-composition',
    caption: 'Runtime composition and lifecycle ownership',
  },
  {
    name: '08-dsh-session-facts',
    caption: 'Durable facts, live notifications, and derived views',
  },
  { name: '09-dsh-host-client', caption: 'Host/client boundary' },
];

export const PAGES = [
  {
    slug: 'docs/channel-sidebar/index',
    order: 15,
    en: {
      source: 'docs/channel-sidebar/index.md',
      title: 'Channel sidebar',
      description:
        'Find the tools beside a Bot chat or group, then open the matching feature guide.',
    },
    zh: {
      source: 'docs/channel-sidebar/index.zh.md',
      title: 'Channel sidebar',
      description: '了解 Bot 私聊与群聊旁的功能入口，并按功能打开操作教程。',
    },
  },
  {
    slug: 'docs/channel-sidebar/memory-files',
    order: 1,
    en: {
      source: 'docs/channel-sidebar/memory-files.md',
      title: 'Memory files',
      description: 'Browse a Bot\u2019s current Memory files and inspect their contents.',
    },
    zh: {
      source: 'docs/channel-sidebar/memory-files.zh.md',
      title: '记忆文件',
      description: '浏览 Bot 当前的记忆文件，并在聊天主体中查看内容。',
    },
  },
  {
    slug: 'docs/channel-sidebar/memory-evolution',
    order: 2,
    en: {
      source: 'docs/channel-sidebar/memory-evolution.md',
      title: 'Memory evolution',
      description:
        'Inspect working changes, Git history, branch requests and recovery checkpoints.',
    },
    zh: {
      source: 'docs/channel-sidebar/memory-evolution.zh.md',
      title: '记忆演化',
      description: '查看未提交改动、Git 历史、分支请求与恢复检查点。',
    },
  },
  {
    slug: 'docs/channel-sidebar/sessions',
    order: 3,
    en: {
      source: 'docs/channel-sidebar/sessions.md',
      title: 'Sessions',
      description: 'Open a Bot\u2019s owned DSH Sessions and choose the list scope and layout.',
    },
    zh: {
      source: 'docs/channel-sidebar/sessions.zh.md',
      title: '会话',
      description: '打开 Bot 所属的 DSH 会话，并调整列表范围与排列方式。',
    },
  },
  {
    slug: 'docs/channel-sidebar/bot-inbox',
    order: 4,
    en: {
      source: 'docs/channel-sidebar/bot-inbox.md',
      title: 'Bot Inbox',
      description:
        'Inspect a Bot\u2019s received items, their processing state and their original source.',
    },
    zh: {
      source: 'docs/channel-sidebar/bot-inbox.zh.md',
      title: 'Bot 收件箱',
      description: '检查 Bot 收件、处理状态，并打开对应的原始来源。',
    },
  },
  {
    slug: 'docs/channel-sidebar/workspaces',
    order: 5,
    en: {
      source: 'docs/channel-sidebar/workspaces.md',
      title: 'Workspace Grants',
      description:
        'Review a Bot\u2019s folders and understand the separate task and tool permissions.',
    },
    zh: {
      source: 'docs/channel-sidebar/workspaces.zh.md',
      title: '工作区授权',
      description: '查看 Bot 可用的文件夹，区分文件夹授权、任务权限与工具批准。',
    },
  },
  {
    slug: 'docs/channel-sidebar/schedules',
    order: 6,
    en: {
      source: 'docs/channel-sidebar/schedules.md',
      title: 'Schedules',
      description:
        'Wake a Bot weekly, once, on cron or every few minutes, run a schedule now and lock it.',
    },
    zh: {
      source: 'docs/channel-sidebar/schedules.zh.md',
      title: '定时任务',
      description: '按分钟、每天、每周、单次或 Cron 唤醒 Bot，立即运行，并锁定以防 Bot 修改。',
    },
  },
  {
    slug: 'docs/channel-sidebar/model',
    order: 7,
    en: {
      source: 'docs/channel-sidebar/model.md',
      title: 'Model',
      description: 'Check and change the model a Bot uses for chat and new Assignments.',
    },
    zh: {
      source: 'docs/channel-sidebar/model.zh.md',
      title: '模型',
      description: '查看并修改 Bot 日常对话与新任务使用的模型。',
    },
  },
  {
    slug: 'docs/channel-sidebar/wake-policy',
    order: 8,
    en: {
      source: 'docs/channel-sidebar/wake-policy.md',
      title: 'Wake policy',
      description:
        'Choose, per message source, whether a Bot wakes right away, after a digest or not at all.',
    },
    zh: {
      source: 'docs/channel-sidebar/wake-policy.zh.md',
      title: '唤醒策略',
      description: '按消息来源设置 Bot 立即唤醒、汇总后唤醒或只记录。',
    },
  },
  {
    slug: 'docs/channel-sidebar/external-identities',
    order: 9,
    en: {
      source: 'docs/channel-sidebar/external-identities.md',
      title: 'External identities',
      description:
        'Bind who a Bot speaks as on external platforms, plus IM pairing and approval notifications.',
    },
    zh: {
      source: 'docs/channel-sidebar/external-identities.zh.md',
      title: '外部身份',
      description: '绑定 Bot 在外部平台的发言身份，管理 IM 管理员配对与审批通知。',
    },
  },
  {
    slug: 'docs/channel-sidebar/external-connectors',
    order: 10,
    en: {
      source: 'docs/channel-sidebar/external-connectors.md',
      title: 'External connectors',
      description:
        'Authorize external conversations and choose which messages reach a Bot DM or Bot Inbox.',
    },
    zh: {
      source: 'docs/channel-sidebar/external-connectors.zh.md',
      title: '外部连接器',
      description: '授权外部会话，选择哪些消息进入 Bot 私聊或 Bot 收件箱。',
    },
  },
  {
    slug: 'docs/channel-sidebar/groups',
    order: 11,
    en: {
      source: 'docs/channel-sidebar/groups.md',
      title: 'Members and group management',
      description:
        'Manage a local group\u2019s members, invitations, attention settings and identity.',
    },
    zh: {
      source: 'docs/channel-sidebar/groups.zh.md',
      title: '成员与群管理',
      description: '管理本地群聊的成员、邀请、提醒设置与群信息。',
    },
  },
  {
    slug: 'docs/channel-sidebar/display',
    order: 12,
    en: {
      source: 'docs/channel-sidebar/display.md',
      title: 'Display and layout',
      description:
        'Resize, reorder and hide sidebar entries, with explicit save and cancel behavior.',
    },
    zh: {
      source: 'docs/channel-sidebar/display.zh.md',
      title: '显示与布局',
      description: '调整侧栏宽度、项目顺序与显示，了解完成和取消的作用。',
    },
  },
  {
    slug: 'docs/wechat-connection',
    order: 25,
    en: {
      source: 'docs/wechat-connection.md',
      title: 'Connect a Bot to personal WeChat',
      description:
        'Pair a WeChat Bot, authorize owner text DMs and verify original-conversation replies.',
    },
    zh: {
      source: 'docs/wechat-connection.zh.md',
      title: '连接个人微信',
      description: '扫码绑定微信 Bot、授权扫码者文字私聊，并核对原会话回复。',
    },
  },
  {
    slug: 'docs/model-setup',
    order: 13,
    en: {
      source: 'docs/model-setup.md',
      title: 'API and Bot models',
      description: 'Configure API providers, choose each Bot’s models and verify its model preset.',
    },
    zh: {
      source: 'docs/model-setup.zh.md',
      title: 'API 与 Bot 模型',
      description: '配置 API 提供商，为每个 Bot 选择模型并验证模型预设。',
    },
  },
  {
    slug: 'docs/settings',
    order: 14,
    en: {
      source: 'docs/settings.md',
      title: 'Settings guide',
      description: 'Find non-IM settings, understand each field and its application scope.',
    },
    zh: {
      source: 'docs/settings.zh.md',
      title: '设置指南',
      description: '找到非 IM 设置入口，了解每个参数、默认值与生效范围。',
    },
  },
  {
    slug: 'docs/installation',
    order: 12,
    en: {
      source: 'docs/installation.md',
      title: 'Install DeepSeekBot',
      description: 'Import the public npm plugin in DSH, enable Bot mode and create a PersonaBot.',
    },
    zh: {
      source: 'docs/installation.zh.md',
      title: '安装 DeepSeekBot',
      description: '通过 DSH 导入公开 npm 插件，启用 Bot 模式并创建 PersonaBot。',
    },
  },
  {
    slug: 'docs/vps-qq-tutorial',
    order: 13,
    en: {
      source: 'docs/vps-qq-tutorial.md',
      title: 'Deploy DeepSeekBot on a Linux VPS with Tailscale and QQ',
      description:
        'A qualified 2-core, 4 GB source deployment with strict SSH, CLI, tailnet HTTPS and real QQ restart verification.',
    },
    zh: {
      source: 'docs/vps-qq-tutorial.zh.md',
      title: '2 核 4GB VPS 部署 DeepSeekBot：CLI、Tailscale 与 QQ',
      description: '从严格 SSH 到源码 CLI 安装、tailnet HTTPS 和重启后的真实 QQ 群问答。',
    },
  },
  {
    slug: 'docs/slack-connection',
    order: 24,
    en: {
      source: 'docs/slack-connection.md',
      title: 'Connect a Bot to Slack',
      description:
        'Configure a Slack app, bind a Bot identity and verify authorized public-channel messages.',
    },
    zh: {
      source: 'docs/slack-connection.zh.md',
      title: '连接 Slack',
      description: '配置 Slack 应用、绑定 Bot 身份，并验证已授权公共频道的收件与原话题回复。',
    },
  },
  {
    slug: 'docs/qq-connection',
    order: 24,
    en: {
      source: 'docs/qq-connection.md',
      title: 'Connect a Bot to QQ groups',
      description: 'Authorize an official QQ Bot app, bind it and verify group mention replies.',
    },
    zh: {
      source: 'docs/qq-connection.zh.md',
      title: '将 Bot 接入 QQ 群',
      description: '授权官方 QQ Bot 应用、绑定身份，并验证群提及与原群答复。',
    },
  },
  {
    slug: 'docs/lark-connection',
    order: 23,
    en: {
      source: 'docs/lark-connection.md',
      title: 'Connect a Bot to Lark / Feishu',
      description:
        'Set up an application bot, bind its identity and route authorized group messages.',
    },
    zh: {
      source: 'docs/lark-connection.zh.md',
      title: '连接 Lark / 飞书',
      description: '配置应用机器人、绑定外部身份，并把授权群消息接入 Bot 收件箱或频道。',
    },
  },
  {
    slug: 'docs/daily-browser',
    order: 22,
    en: {
      source: 'docs/daily-browser.md',
      title: 'Share a browser tab',
      description: 'Explicitly lend one daily-browser tab read-only to a PersonaBot.',
    },
    zh: {
      source: 'docs/daily-browser.zh.md',
      title: '分享浏览器标签页',
      description: '将日常浏览器的一个标签页明确借给 PersonaBot 只读观察。',
    },
  },
  {
    slug: 'docs/file-open',
    order: 21,
    en: {
      source: 'docs/file-open.md',
      title: 'Open files on the Host',
      description: 'Open Memory, Workspace and message files in native applications.',
    },
    zh: {
      source: 'docs/file-open.zh.md',
      title: '在 Host 上打开文件',
      description: '在系统软件中打开 Memory、Workspace 和消息文件。',
    },
  },
  {
    slug: 'docs/bot-zip',
    order: 26,
    en: {
      source: 'docs/bot-zip.md',
      title: 'Export and import a Bot',
      description:
        'Pack a Bot into a zip, choose its files and Git history, and import it as a new Bot.',
    },
    zh: {
      source: 'docs/bot-zip.zh.md',
      title: '导出与导入 Bot',
      description: '把 Bot 打包成 zip，选择文件和 Git 历史，再导入成一个新的 Bot。',
    },
  },
  {
    slug: 'docs/bot-cli',
    order: 26,
    en: {
      source: 'docs/bot-cli.md',
      title: 'Create Bots from the command line',
      description:
        'Create a PersonaBot without clicking: blank, bundle, or GitHub, with machine-readable JSON output.',
    },
    zh: {
      source: 'docs/bot-cli.zh.md',
      title: '用命令行创建 Bot',
      description: '无需点击创建 PersonaBot：空白、Bot 包或 GitHub，输出机器可读的 JSON。',
    },
  },
  {
    slug: 'docs/environment-creation',
    order: 26,
    en: {
      source: 'docs/environment-creation.md',
      title: 'Create in an environment',
      description: 'Choose the owning computer for Bots, Channels and Sections.',
    },
    zh: {
      source: 'docs/environment-creation.zh.md',
      title: '在指定环境创建',
      description: '明确选择 Bot、频道和分组所属的电脑。',
    },
  },
  {
    slug: 'docs/share-bot',
    order: 26,
    en: {
      source: 'docs/share-bot.md',
      title: 'Share a Bot',
      description: 'Publish a Bot’s Memory to GitHub and list it in the Bot Marketplace.',
    },
    zh: {
      source: 'docs/share-bot.zh.md',
      title: '分享 Bot',
      description: '把 Bot 的 Memory 发布到 GitHub，并收录进 Bot 市场。',
    },
  },
  {
    slug: 'docs/soul-and-core-memory',
    order: 27,
    en: {
      source: 'docs/soul-and-core-memory.md',
      title: 'Bot Soul and Core Memory',
      description:
        'How SOUL.md and MEMORY.md start every Session, their size limits, and when edits apply.',
    },
    zh: {
      source: 'docs/soul-and-core-memory.zh.md',
      title: 'Bot 灵魂与核心记忆',
      description: 'SOUL.md 与 MEMORY.md 如何进入每个 Session、字数上限，以及修改何时生效。',
    },
  },
  {
    slug: 'docs/update-deepseekbot',
    order: 27,
    en: {
      source: 'docs/update-deepseekbot.md',
      title: 'Update DeepSeekBot',
      description: 'Install a new DeepSeekBot release from Bot settings and restart DSH.',
    },
    zh: {
      source: 'docs/update-deepseekbot.zh.md',
      title: '更新 DeepSeekBot',
      description: '在 Bot 设置里安装新版本 DeepSeekBot，并重启 DSH。',
    },
  },
  {
    slug: 'docs/private-connect',
    order: 15,
    en: {
      source: 'docs/private-connect.md',
      title: 'Choose a private connection',
      description:
        'Choose Named Tunnel, your own HTTPS ingress or a Docker relay, with agent setup prompts.',
    },
    zh: {
      source: 'docs/private-connect.zh.md',
      title: '选择私有连接',
      description: '选择 Named Tunnel、自带 HTTPS 入口或 Docker Relay，含 agent 部署提示词。',
    },
  },
  {
    slug: 'docs/private-named-tunnel',
    order: 15,
    en: {
      source: 'docs/private-named-tunnel.md',
      title: 'Cloudflare Named Tunnel',
      description: 'Set up your own fixed tunnel, manually or with your agent.',
    },
    zh: {
      source: 'docs/private-named-tunnel.zh.md',
      title: 'Cloudflare Named Tunnel',
      description: '手动或通过自己的 agent 配置固定隧道。',
    },
  },
  {
    slug: 'docs/private-relay',
    order: 15,
    en: {
      source: 'docs/private-relay.md',
      title: 'Docker private relay',
      description: 'Deploy a multi-Host relay on your server, manually or with your agent.',
    },
    zh: {
      source: 'docs/private-relay.zh.md',
      title: 'Docker 私有 Relay',
      description: '手动或通过 agent 在自己的服务器上部署多 Host 中继。',
    },
  },
  {
    slug: 'docs/private-ingress',
    order: 15,
    en: {
      source: 'docs/private-ingress.md',
      title: 'Bring your own proxy or tunnel',
      description:
        'Connect phones through your own HTTPS proxy or tunnel using the ingress standard.',
    },
    zh: {
      source: 'docs/private-ingress.zh.md',
      title: '使用自己的代理或隧道',
      description: '按入站标准，通过自己的 HTTPS 代理或隧道连接手机。',
    },
  },
  {
    slug: 'docs/private-relay-standard',
    order: 15,
    en: {
      source: 'docs/private-relay-standard.md',
      title: 'Private relay standard',
      description: 'Wire protocol and conformance test for relays that serve several computers.',
    },
    zh: {
      source: 'docs/private-relay-standard.zh.md',
      title: '私有中继标准',
      description: '服务多台电脑的中继线上协议和一致性测试。',
    },
  },
  {
    slug: 'docs/mobile-pairing',
    order: 16,
    en: {
      source: 'docs/mobile-pairing.md',
      title: 'Pair your phone',
      description:
        'Install Tailscale, publish DSH on your tailnet and pair the phone app by QR code.',
    },
    zh: {
      source: 'docs/mobile-pairing.zh.md',
      title: '配对手机',
      description: '安装 Tailscale，把 DSH 发布到 tailnet，再扫码把手机 App 和电脑配对。',
    },
  },
  {
    slug: 'dev/index',
    order: 0,
    en: {
      source: 'docs/dev/index.md',
      title: 'BotHarness developer documentation',
      description: 'Design, verified guides, generated code reference, and architecture decisions',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/index.zh.md',
      title: 'BotHarness 开发文档',
      description: 'Design、已核验 Guides、生成代码 Reference 与 Architecture Decisions',
    },
  },
  {
    slug: 'dev/design/index',
    order: DEV_SECTION_ORDER.design,
    en: {
      source: 'docs/dev/design/index.md',
      title: 'Design',
      description: 'Canonical BotHarness product language and integrated architecture',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/design/index.zh.md',
      title: 'Design',
      description: '规范产品含义、规格与目标架构',
    },
  },
  {
    slug: 'dev/design/architecture',
    order: 1,
    zh: {
      source: 'docs/architecture/botharness-architecture.md',
      title: '架构与数据流',
      description: '系统上下文、模块、数据流与边界（持续维护）',
      diagrams: ARCHITECTURE_DIAGRAMS_ZH,
    },
    en: {
      source: 'docs/architecture/botharness-architecture.en.md',
      title: 'BotHarness Architecture & Data Flow',
      description: 'System context, modules, data flow and boundaries (living doc)',
      lang: 'en',
      diagrams: ARCHITECTURE_DIAGRAMS_EN,
    },
  },
  {
    slug: 'dev/design/bot-runtime',
    order: 3,
    zh: {
      source: 'docs/architecture/bot-runtime-architecture.md',
      title: 'BotHarness Runtime 架构',
      description: 'PersonaBot、Inbox、Orchestrator、Work 与 DSH execution 的产品边界',
    },
    en: {
      source: 'docs/architecture/bot-runtime-architecture.en.md',
      title: 'BotHarness Runtime Architecture',
      description:
        'Product boundaries across PersonaBot, Inbox, Orchestrator, Work, and DSH execution',
      lang: 'en',
    },
  },
  {
    slug: 'dev/design/context',
    order: 2,
    en: {
      source: 'GLOSSARY.md',
      title: 'BotHarness Product Context',
      description: 'Canonical BotHarness product terms, distinct from DSH and Cordis vocabulary',
      lang: 'en',
      configuredTitle: true,
    },
    zh: {
      source: 'GLOSSARY.zh.md',
      title: 'BotHarness 产品术语',
      description: 'BotHarness 产品专有词汇；与 DSH、Cordis 术语分开',
      configuredTitle: true,
    },
  },
  {
    slug: 'dev/guides/index',
    order: DEV_SECTION_ORDER.guides,
    en: {
      source: 'docs/dev/guides/index.md',
      title: 'Guides',
      description: 'Verified implementation and integration workflows',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/guides/index.zh.md',
      title: 'Guides',
      description: '已经核验的实现与集成流程',
    },
  },
  {
    slug: 'dev/guides/assignment-report-harvest',
    order: 4,
    en: {
      source: 'docs/dev/guides/assignment-report-harvest.md',
      title: 'Assignment Report batches',
      description: 'Verified progress batching, native harvest and independent source history.',
    },
    zh: {
      source: 'docs/dev/guides/assignment-report-harvest.zh.md',
      title: 'Assignment Report 批次',
      description: '已核验的 progress 合并、原生 harvest 与独立来源历史。',
    },
  },
  {
    slug: 'dev/guides/assignment-stop-recovery',
    order: 3,
    en: {
      source: 'docs/dev/guides/assignment-stop-recovery.md',
      title: 'Assignment stop and recovery',
      description: 'Verified stop workflow and Host restart acceptance',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/guides/assignment-stop-recovery.zh.md',
      title: 'Assignment 停止与恢复',
      description: '已核验的停止操作与 Host 重启验收',
    },
  },
  {
    slug: 'dev/guides/personabot-output',
    order: 2,
    en: {
      source: 'docs/dev/guides/personabot-output.md',
      title: 'PersonaBot Output Committed',
      description: 'Host public output notifications and Consumer lifecycle',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/guides/personabot-output.zh.md',
      title: 'PersonaBot 输出提交事件',
      description: 'Host 公开输出通知与 Consumer 生命周期',
    },
  },
  {
    slug: 'dev/guides/im-provider-integration',
    order: 5,
    en: {
      source: 'docs/dev/guides/im-provider-integration.md',
      title: 'IM Provider integration',
      description: 'Verified Lark and Slack contracts and repeatable provider qualification',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/guides/im-provider-integration.zh.md',
      title: 'IM Provider 接入规范',
      description: '已验证的 Lark、Slack 契约与可复用的平台资格验证流程',
    },
  },
  {
    slug: 'dev/guides/client-startup-diagnostics',
    order: 6,
    en: {
      source: 'docs/dev/guides/client-startup-diagnostics.md',
      title: 'Client startup diagnostics',
      description: 'Proactive browser console, bounded boot evidence and explicit readiness',
      lang: 'en',
    },
    zh: {
      source: 'docs/dev/guides/client-startup-diagnostics.zh.md',
      title: 'Client 启动诊断',
      description: '主动读取浏览器 console、有界启动证据与明确就绪状态',
    },
  },
  {
    slug: 'dev/guides/client-bridge',
    order: 1,
    zh: {
      source: 'docs/client-bridge.md',
      title: '客户端桥',
      description: '已实现的 Web Client 与 core RPC 契约（含迁移中的 legacy seams）',
    },
  },
];

export { DSH_CONTEXT_DIAGRAMS_EN, DSH_CONTEXT_DIAGRAMS_ZH };
