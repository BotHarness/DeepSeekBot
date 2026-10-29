#!/usr/bin/env node

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectDevReference } from './docs-reference.mjs';
import {
  DEVELOPMENT_SUMMARY_IDENTITY,
  parseReleaseLedger,
  validateReleaseLedgerPair,
} from './release-ledger.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWithin = (parent, candidate) => {
  const path = relative(parent, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};
const configuredTestRoot = process.env.BOTHARNESS_DOCS_TEST_OUTPUT_ROOT?.trim();
let testOutputRoot = null;
if (configuredTestRoot) {
  if (!isAbsolute(configuredTestRoot)) {
    throw new Error('BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must be an absolute path');
  }
  const realTempRoot = realpathSync(tmpdir());
  const realRepoRoot = realpathSync(ROOT);
  const realConfiguredRoot = realpathSync(configuredTestRoot);
  const overlapsRepo =
    isWithin(realRepoRoot, realConfiguredRoot) || isWithin(realConfiguredRoot, realRepoRoot);
  if (overlapsRepo) {
    throw new Error('BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must not overlap the repository');
  }
  const relativeToTemp = relative(realTempRoot, realConfiguredRoot);
  if (!relativeToTemp || !isWithin(realTempRoot, realConfiguredRoot)) {
    throw new Error(
      'BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must be below the system temporary directory',
    );
  }
  testOutputRoot = realConfiguredRoot;
}
const CONTENT = testOutputRoot
  ? join(testOutputRoot, 'content')
  : join(ROOT, 'apps', 'docs', 'src', 'content');
const DIAGRAMS_RENDERED = join(ROOT, 'docs', 'architecture', 'diagrams', 'rendered');
const DIAGRAMS_PUBLIC = testOutputRoot
  ? join(testOutputRoot, 'diagrams')
  : join(ROOT, 'apps', 'docs', 'public', 'diagrams');
const GITHUB_BLOB = 'https://github.com/BotHarness/BotHarness/blob/main/';
const SKILL = '.agents/skills/dsh-plugin-dev/';

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
      source: 'CONTEXT.md',
      title: 'BotHarness Product Context',
      description: 'Canonical BotHarness product terms, distinct from DSH and Cordis vocabulary',
      lang: 'en',
      configuredTitle: true,
    },
    zh: {
      source: 'CONTEXT.zh.md',
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

const LINK_REWRITES = [
  [/\]\((?:\.\.\/){1,2}adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [
    /\]\((?:\.\.\/){1,2}architecture\/botharness-architecture\.md\)/g,
    '](/dev/design/architecture)',
  ],
  [
    /\]\((?:\.\.\/){1,2}(?:dev\/guides\/)?personabot-output(?:\.zh)?\.md\)/g,
    '](/dev/guides/personabot-output)',
  ],
  [/\]\((?:\.\.\/|\.?\/?docs\/)?file-open(?:\.zh)?\.md\)/g, '](/docs/file-open)'],
  [/\]\(adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [
    /\]\(\.?\/?docs\/architecture\/botharness-architecture\.(?:md|html)\)/g,
    '](/dev/design/architecture)',
  ],
  [/\]\(\.?\/?docs\/botharness\.md\)/g, '](/dev/design/architecture)'],
  [/\]\(\.?\/?PRD\.md\)/g, '](/dev/design/architecture)'],
  [/\]\(\.?\/?CONTEXT\.md\)/g, '](/dev/design/context)'],
  [/\]\((?:\.\.\/){1,2}CONTEXT\.md\)/g, '](/dev/design/context)'],
  [/\]\(\.?\/?docs\/client-bridge\.md\)/g, '](/dev/guides/client-bridge)'],
  [/\]\(\.?\/?docs\/adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [/\]\(([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [/\]\(\.?\/?README\.en?\.md\)/g, `](${GITHUB_BLOB}README.md)`],
];

const MERMAID_OPEN = '<pre class="mermaid">{`';
const MERMAID_CLOSE = '`}</pre>';

function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function writeText(relativePath, content) {
  const absolute = join(CONTENT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function mermaidFenceToRuntime(code) {
  return `${MERMAID_OPEN}\n${String(code).trimEnd()}\n${MERMAID_CLOSE}\n`;
}

function transformMermaid(body) {
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) =>
    mermaidFenceToRuntime(code),
  );
}

function transformDiagrams(body, diagrams, lang) {
  let index = 0;
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) => {
    const diagram = diagrams[index];
    index += 1;
    if (!diagram) return mermaidFenceToRuntime(code);
    const langAttr = lang === 'en' ? ' lang="en"' : '';
    const caption = diagram.caption ? ` caption=${JSON.stringify(diagram.caption)}` : '';
    return `<Diagram name="${diagram.name}"${caption}${langAttr} />\n`;
  });
}

function rewriteLinks(body) {
  let output = body;
  for (const [pattern, replacement] of LINK_REWRITES) output = output.replace(pattern, replacement);
  return output;
}

function stripFrontmatter(body) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: '', body };
  return { frontmatter: match[1] ?? '', body: body.slice(match[0].length) };
}

function stripH1(body) {
  return body.replace(/^#\s+.*\r?\n+/, '');
}

function titleFrom(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? String(match[1]).trim() : fallback;
}

function frontmatter({ title, description, order, untranslated, extra = [] }) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push('sidebar:', `  order: ${order}`);
  if (untranslated) lines.push('untranslated: true');
  lines.push(...extra);
  lines.push('---', '', '');
  return lines.join('\n');
}

function stripMaintainerNote(body) {
  return body.replace(/^(#\s+[^\r\n]*\r?\n+)\s*<!--[\s\S]*?-->\s*\r?\n+/, '$1');
}

function prepare(body, diagrams, lang) {
  const source = stripMaintainerNote(body);
  const transformed = diagrams
    ? transformDiagrams(stripH1(source), diagrams, lang)
    : transformMermaid(stripH1(source));
  return rewriteLinks(transformed);
}

function renderPage(variant, order, untranslated) {
  const raw = readText(variant.source);
  const { body } = stripFrontmatter(raw);
  const title = variant.configuredTitle ? variant.title : titleFrom(body, variant.title);
  return (
    frontmatter({
      title,
      description: variant.description,
      order,
      untranslated,
    }) + prepare(body, variant.diagrams, variant.lang)
  );
}

function syncPages() {
  for (const page of PAGES) {
    const enTarget = `docs/${page.slug}.mdx`;
    const zhTarget = `docs-zh/${page.slug}.mdx`;
    if (page.en) {
      writeText(enTarget, renderPage(page.en, page.order, false));
      process.stdout.write(`en: ${page.en.source} -> ${enTarget}\n`);
    } else {
      writeText(enTarget, renderPage(page.zh, page.order, true));
      process.stdout.write(`en: ${page.zh.source} -> ${enTarget} (untranslated)\n`);
    }
    if (page.zh) {
      writeText(zhTarget, renderPage(page.zh, page.order, false));
      process.stdout.write(`zh: ${page.zh.source} -> ${zhTarget}\n`);
    } else {
      writeText(zhTarget, renderPage(page.en, page.order, true));
      process.stdout.write(`zh: ${page.en.source} -> ${zhTarget} (untranslated)\n`);
    }
  }
}

const TOOL_COPY_ZH = {
  memory_read: {
    description: '读取当前 Session 所属 PersonaBot Memory 中的一份 Markdown 文件。',
    parameters: {
      path: 'Memory 根目录下的相对 .md 路径，例如 customers/acme.md',
    },
  },
  memory_search: {
    description: '在当前 Session 所属 PersonaBot Memory 中执行不区分大小写的子字符串搜索。',
    parameters: { query: '不区分大小写的搜索子字符串' },
  },
  memory_write: {
    description:
      '原子创建或覆盖当前 Session 所属 PersonaBot Memory 中的一份 Markdown 文件，并提交 Git 记录。',
    parameters: {
      path: 'Memory 根目录下的相对 .md 路径',
      body: '文件的完整 Markdown 正文',
      summary: '一行变更摘要，同时作为 Git commit message',
      sources: '事实来源，例如 feishu:group-42 或 2026-09-17',
      tags: '可选主题标签',
    },
  },
  memory_list: {
    description: '列出当前 Session 所属 PersonaBot 的 Memory Tree。',
    parameters: {},
  },
};

function markdownCell(value) {
  if (value === undefined) return '—';
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function codeValue(value) {
  return value === undefined ? '—' : `\`${JSON.stringify(value)}\``;
}

function referenceIntro(language, source) {
  return language === 'zh'
    ? `> 本页在每次文档同步时从 \`${source}\` 生成，只描述当前代码，不承诺尚未实现的 Design。\n\n`
    : `> This page is generated from \`${source}\` on every docs sync. It describes current code, not unimplemented Design.\n\n`;
}

function renderReferenceIndex(language) {
  if (language === 'zh') {
    return (
      'Reference 从当前代码生成，是“现在实现了什么”的权威表面。目标边界与未来能力请查看 [Design](/zh/dev/design)。\n\n' +
      '- [Config](/zh/dev/reference/config)：core plugin 当前接受的配置。\n' +
      '- [Tools](/zh/dev/reference/tools)：当前注册给模型的 tools。\n' +
      '- [Events](/zh/dev/reference/events)：core 当前公开使用的 Cordis event seams。\n\n' +
      '生成器遇到动态名称或无法静态解析的定义时会让文档构建失败，避免静默发布过期目录。\n'
    );
  }
  return (
    'Reference is generated from the current codebase and is authoritative for what exists now. Use [Design](/dev/design) for target boundaries and future capabilities.\n\n' +
    '- [Config](/dev/reference/config): configuration currently accepted by the core plugin.\n' +
    '- [Tools](/dev/reference/tools): tools currently registered for models.\n' +
    '- [Events](/dev/reference/events): public Cordis event seams currently used by core.\n\n' +
    'The generator fails the docs build when it encounters dynamic names or definitions it cannot statically resolve, preventing a silently stale catalog.\n'
  );
}

function renderConfigReference(config, language) {
  const header =
    language === 'zh'
      ? '| Key | Type | Default | 说明 |\n| --- | --- | --- | --- |\n'
      : '| Key | Type | Default | Description |\n| --- | --- | --- | --- |\n';
  const rows = config
    .map((field) => {
      const description =
        language === 'zh' && field.name === 'enabled' ? '启用 BotHarness core' : field.description;
      return `| \`${field.name}\` | \`${field.type}\` | ${codeValue(field.default)} | ${markdownCell(description)} |`;
    })
    .join('\n');
  return referenceIntro(language, 'packages/core/src/plugin.ts') + header + rows + '\n';
}

function renderToolsReference(tools, language) {
  const sections = tools.map((tool) => {
    const translation = TOOL_COPY_ZH[tool.name];
    if (language === 'zh' && !translation) {
      throw new Error(`docs reference: missing Chinese copy for tool ${tool.name}`);
    }
    const description = language === 'zh' ? translation.description : tool.description;
    const parameterHeader =
      language === 'zh'
        ? '| Parameter | Type | Required | 说明 |\n| --- | --- | --- | --- |'
        : '| Parameter | Type | Required | Description |\n| --- | --- | --- | --- |';
    const parameters =
      tool.parameters.length === 0
        ? language === 'zh'
          ? '_无参数。_'
          : '_No parameters._'
        : [
            parameterHeader,
            ...tool.parameters.map((parameter) => {
              const translated = translation?.parameters[parameter.name];
              if (language === 'zh' && !translated) {
                throw new Error(
                  `docs reference: missing Chinese copy for ${tool.name}.${parameter.name}`,
                );
              }
              return `| \`${parameter.name}\` | \`${parameter.type}\` | ${parameter.required ? 'yes' : 'no'} | ${markdownCell(language === 'zh' ? translated : parameter.description)} |`;
            }),
          ].join('\n');
    return `## \`${tool.name}\`\n\n${description}\n\n${parameters}\n\n_Source: \`${tool.source}\`_`;
  });
  return referenceIntro(language, 'packages/core/src/memory/tools.ts') + sections.join('\n\n');
}

function renderEventsReference(events, language) {
  const intro = referenceIntro(language, 'packages/core/src/**/*.ts');
  if (events.length === 0) {
    return (
      intro +
      (language === 'zh'
        ? '**当前没有已发布的 Cordis event 契约。**\n\n`BotStateEvent` 与 `states.on(...)` 是 core 进程内 callback 数据，不是 Cordis Event、Client wire contract 或 durable authority，因此不会出现在这里。\n'
        : '**There is no published Cordis event contract in the current core.**\n\n`BotStateEvent` and `states.on(...)` are in-process callback data, not a Cordis Event, Client wire contract, or durable authority, so they are intentionally absent.\n')
    );
  }
  const header =
    language === 'zh'
      ? '| Event | Direction | Cordis operation | Source |\n| --- | --- | --- | --- |\n'
      : '| Event | Direction | Cordis operation | Source |\n| --- | --- | --- | --- |\n';
  const rows = events
    .map((event) => {
      const direction =
        language === 'zh' ? (event.direction === 'consumes' ? '消费' : '发出') : event.direction;
      return `| \`${event.name}\` | ${direction} | \`${event.operation}\` | \`${event.source}\` |`;
    })
    .join('\n');
  return intro + header + rows + '\n';
}

function syncReference() {
  const reference = collectDevReference(ROOT);
  const pages = [
    {
      slug: 'index',
      order: DEV_SECTION_ORDER.reference,
      en: {
        title: 'Reference',
        description: 'Generated current-code contracts for config, tools, and public events',
        body: renderReferenceIndex('en'),
      },
      zh: {
        title: 'Reference',
        description: '由当前代码生成的 config、tools 与 public events 契约',
        body: renderReferenceIndex('zh'),
      },
    },
    {
      slug: 'config',
      order: 1,
      en: {
        title: 'Core config reference',
        description: 'Configuration accepted by the current BotHarness core plugin',
        body: renderConfigReference(reference.config, 'en'),
      },
      zh: {
        title: 'Core config reference',
        description: '当前 BotHarness core plugin 接受的配置',
        body: renderConfigReference(reference.config, 'zh'),
      },
    },
    {
      slug: 'tools',
      order: 2,
      en: {
        title: 'Model tool reference',
        description: 'Tools registered for models by the current BotHarness core',
        body: renderToolsReference(reference.tools, 'en'),
      },
      zh: {
        title: 'Model tool reference',
        description: '当前 BotHarness core 注册给模型的 tools',
        body: renderToolsReference(reference.tools, 'zh'),
      },
    },
    {
      slug: 'events',
      order: 3,
      en: {
        title: 'Cordis event reference',
        description: 'Public Cordis event seams used by the current BotHarness core',
        body: renderEventsReference(reference.publicEvents, 'en'),
      },
      zh: {
        title: 'Cordis event reference',
        description: '当前 BotHarness core 使用的公开 Cordis event seams',
        body: renderEventsReference(reference.publicEvents, 'zh'),
      },
    },
  ];
  for (const page of pages) {
    for (const [tree, language] of [
      ['docs', 'en'],
      ['docs-zh', 'zh'],
    ]) {
      const variant = page[language];
      const target = `${tree}/dev/reference/${page.slug}.mdx`;
      writeText(
        target,
        frontmatter({
          title: variant.title,
          description: variant.description,
          order: page.order,
        }) + variant.body,
      );
      process.stdout.write(`reference: ${language} -> ${target}\n`);
    }
  }
}

function syncAdr() {
  const directory = join(ROOT, 'docs', 'adr');
  const files = readdirSync(directory)
    .filter((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name))
    .sort();
  const entries = files.map((file) => {
    const raw = readFileSync(join(directory, file), 'utf8');
    const { frontmatter: sourceFrontmatter, body } = stripFrontmatter(raw);
    return {
      file,
      body,
      title: titleFrom(body, file),
      status: sourceFrontmatter.match(/^Status:\s*(.+)$/m)?.[1]?.trim(),
    };
  });
  const indexList = entries
    .map(
      ({ file, title, status }) =>
        `- [${title}](/dev/adr/${file.replace(/\.md$/, '')})${status ? ` — ${status}` : ''}`,
    )
    .join('\n');
  const indexListZh = indexList.replaceAll('](/dev/adr/', '](/zh/dev/adr/');
  writeText(
    'docs/dev/adr/index.mdx',
    frontmatter({
      title: 'Architecture decisions',
      description: 'Decision history, status, and rationale for BotHarness architecture',
      order: DEV_SECTION_ORDER.adr,
    }) +
      'ADRs explain why an architectural choice was made. Read the status before treating a decision as current; the [living architecture](/dev/design/architecture) is the integrated current view.\n\n' +
      `<details>\n<summary>All decisions (${entries.length})</summary>\n\n${indexList}\n\n</details>\n`,
  );
  writeText(
    'docs-zh/dev/adr/index.mdx',
    frontmatter({
      title: 'Architecture decisions',
      description: 'BotHarness 架构决策的历史、状态与理由',
      order: DEV_SECTION_ORDER.adr,
    }) +
      'ADR 解释一项架构取舍为什么成立。把决策当作当前约束前，应先查看状态；[living architecture](/zh/dev/design/architecture) 是整合后的当前视图。\n\n' +
      `<details>\n<summary>全部决策（${entries.length}）</summary>\n\n${indexListZh}\n\n</details>\n`,
  );
  process.stdout.write(`adr: index -> ${entries.length} decision(s)\n`);
  for (const entry of entries) {
    const { file, body, title, status } = entry;
    const number = Number.parseInt(file.slice(0, 4), 10);
    const statusLine = status ? `> Status: ${status}\n\n` : '';
    const order = Number.isNaN(number) ? 99 : number;
    const relative = `dev/adr/${file.replace(/\.md$/, '.mdx')}`;
    writeText(
      `docs/${relative}`,
      frontmatter({ title, order, untranslated: true }) + statusLine + prepare(body),
    );
    writeText(
      `docs-zh/${relative}`,
      frontmatter({ title, order }) +
        statusLine +
        prepare(body).replaceAll('](/dev/adr/', '](/zh/dev/adr/'),
    );
    process.stdout.write(`adr: ${file} -> docs/${relative} + docs-zh/${relative}\n`);
  }
}

function renderReleaseLedgerEntry(release, language) {
  const development = release.identity === DEVELOPMENT_SUMMARY_IDENTITY;
  const title = development
    ? language === 'zh'
      ? '首个版本前的开发进展'
      : 'Pre-release development'
    : `DeepSeekBot ${release.identity}`;
  const tags = release.sections.map((section) => section.name);
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(release.summary)}`,
    `date: ${release.date}`,
  ];
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
  if (development) lines.push('developmentSummary: true');
  else lines.push(`releaseVersion: ${release.identity}`);
  lines.push('---', '', '', release.summary, '');
  for (const section of release.sections) {
    lines.push(`## ${section.name}`, '');
    for (const entry of section.entries) lines.push(`- ${entry.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function releaseLedgerSiteEntries(english, chinese) {
  const errors = validateReleaseLedgerPair(english, chinese);
  if (errors.length > 0) {
    throw new Error(
      `Release Ledger cannot be synchronized:\n${errors
        .map((error) => `${error.source} [${error.code}] ${error.message}`)
        .join('\n')}`,
    );
  }

  const en = parseReleaseLedger(english).releases;
  const zh = parseReleaseLedger(chinese).releases;
  return en
    .map((release, index) => ({ release, counterpart: zh[index] }))
    .filter(({ release }) => release.identity !== 'Unreleased')
    .map(({ release, counterpart }) => ({
      slug:
        release.identity === DEVELOPMENT_SUMMARY_IDENTITY ? 'development' : `v${release.identity}`,
      english: renderReleaseLedgerEntry(release, 'en'),
      chinese: renderReleaseLedgerEntry(counterpart, 'zh'),
    }));
}

function syncChangelog() {
  rmSync(join(CONTENT, 'changelog'), { recursive: true, force: true });
  rmSync(join(CONTENT, 'changelog-zh'), { recursive: true, force: true });

  const entries = releaseLedgerSiteEntries(readText('CHANGELOG.md'), readText('CHANGELOG.zh.md'));
  for (const entry of entries) {
    writeText(`changelog/${entry.slug}.mdx`, entry.english);
    writeText(`changelog-zh/${entry.slug}.mdx`, entry.chinese);
    process.stdout.write(`changelog: ${entry.slug} (ledger en + zh)\n`);
  }
}

function syncDiagrams() {
  rmSync(DIAGRAMS_PUBLIC, { recursive: true, force: true });

  const copySvgs = (source, target) => {
    let files = [];
    try {
      files = readdirSync(source)
        .filter((name) => name.endsWith('.svg'))
        .sort();
    } catch {
      return null;
    }
    if (files.length === 0) return null;
    mkdirSync(target, { recursive: true });
    for (const file of files) {
      copyFileSync(join(source, file), join(target, file));
    }
    return files.length;
  };

  const zh = copySvgs(DIAGRAMS_RENDERED, DIAGRAMS_PUBLIC);
  if (zh === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${zh} SVG(s) -> apps/docs/public/diagrams\n`);

  const en = copySvgs(join(DIAGRAMS_RENDERED, 'en'), join(DIAGRAMS_PUBLIC, 'en'));
  if (en === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered/en is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${en} SVG(s) -> apps/docs/public/diagrams/en\n`);
}

function skillProvenance() {
  const { frontmatter: text } = stripFrontmatter(readText(`${SKILL}SKILL.md`));
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'metadata:');
  const fields = {};
  if (start === -1) return fields;
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*"?(.*?)"?\s*$/);
    if (!match) break;
    fields[match[1]] = match[2];
  }
  return fields;
}

function provenanceFields({ skillVersion, verifiedAgainst, upstreamSha, verifiedAt }) {
  return [
    `skillVersion: ${JSON.stringify(skillVersion)}`,
    `verifiedAgainst: ${JSON.stringify(verifiedAgainst)}`,
    `upstreamSha: ${JSON.stringify(upstreamSha)}`,
    `verifiedAt: ${JSON.stringify(verifiedAt)}`,
  ];
}

const SKILL_PAGES = [
  {
    slug: 'dsh/context',
    order: 1,
    en: {
      source: `${SKILL}references/context.md`,
      title: 'Canonical context',
      description: 'Precise DSH and Cordis vocabulary, boundaries, and concept maps',
      lang: 'en',
      diagrams: DSH_CONTEXT_DIAGRAMS_EN,
    },
    zh: {
      source: `${SKILL}references/context.zh.md`,
      title: '规范 Context',
      description: '精确的 DSH 与 Cordis 术语、边界与概念图',
      diagrams: DSH_CONTEXT_DIAGRAMS_ZH,
    },
  },
  {
    slug: 'dsh/decision-tree',
    order: 2,
    en: {
      source: `${SKILL}references/decision-tree.md`,
      title: 'Decision tree',
      description: 'Choose the correct DSH seam before implementation',
    },
    zh: {
      source: `${SKILL}references/decision-tree.zh.md`,
      title: 'Decision Tree',
      description: '在实现前选择正确的 DSH seam',
    },
  },
  {
    slug: 'dsh/releases',
    order: 3,
    en: {
      source: `${SKILL}CHANGELOG.md`,
      title: 'DSH Skill release history',
      description: 'Independent Skill SemVer and verified DSH provenance',
    },
    zh: {
      source: `${SKILL}CHANGELOG.zh.md`,
      title: 'DSH Skill 更新日志',
      description: '独立的 Skill SemVer 与核验过的 DSH provenance',
    },
  },
];

const SKILL_LINKS = new Map([
  ['context', 'context'],
  ['decision-tree', 'decision-tree'],
]);

function prepareSkill(body, tree, diagrams, lang) {
  const prefix = tree === 'docs-zh' ? '/zh' : '';
  return prepare(body, diagrams, lang).replace(
    /\]\((?:references\/)?([a-z-]+)(?:\.zh)?\.md\)/g,
    (match, sourceName) => {
      const slug = SKILL_LINKS.get(sourceName);
      return slug ? `](${prefix}/dsh/${slug})` : match;
    },
  );
}

function syncSkill() {
  const provenance = provenanceFields(skillProvenance());

  const landing = [
    {
      tree: 'docs',
      source: 'docs/dsh/index.md',
      description:
        'Stable DSH and Cordis vocabulary, concept maps, and architectural decision tree',
      untranslated: false,
    },
    {
      tree: 'docs-zh',
      source: 'docs/dsh/index.zh.md',
      description: '稳定的 DSH 与 Cordis 术语、概念图与架构 Decision Tree',
      untranslated: false,
    },
  ];
  for (const variant of landing) {
    const raw = readText(variant.source);
    const { body } = stripFrontmatter(raw);
    const title = titleFrom(body, 'DSH Plugin Development');
    writeText(
      `${variant.tree}/dsh/index.mdx`,
      frontmatter({
        title,
        description: variant.description,
        order: 0,
        untranslated: variant.untranslated,
        extra: provenance,
      }) + prepare(body),
    );
    process.stdout.write(`skill: ${variant.source} -> ${variant.tree}/dsh/index.mdx\n`);
  }

  for (const page of SKILL_PAGES) {
    for (const [tree, language] of [
      ['docs', 'en'],
      ['docs-zh', 'zh'],
    ]) {
      const variant = page[language];
      if (!variant?.source) {
        throw new Error(`skill: ${page.slug} is missing its ${language} source`);
      }
      const raw = readText(variant.source);
      const { body } = stripFrontmatter(raw);
      writeText(
        `${tree}/${page.slug}.mdx`,
        frontmatter({
          title: variant.title,
          description: variant.description,
          order: page.order,
          untranslated: false,
          extra: provenance,
        }) + prepareSkill(body, tree, variant.diagrams, variant.lang),
      );
      process.stdout.write(`skill: ${variant.source} -> ${tree}/${page.slug}.mdx\n`);
    }
  }
}

export function syncDocs() {
  for (const stale of [
    'docs/spec',
    'docs/adr',
    'docs/architecture.mdx',
    'docs/dev',
    'docs-zh/dev',
    'docs/dsh',
    'docs-zh/dsh',
  ]) {
    rmSync(join(CONTENT, stale), { recursive: true, force: true });
  }

  syncPages();
  syncReference();
  syncAdr();
  syncChangelog();
  syncSkill();
  syncDiagrams();
  process.stdout.write('docs sync complete\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncDocs();
}
