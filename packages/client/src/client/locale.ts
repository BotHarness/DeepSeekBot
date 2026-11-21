import * as activityCopy from './features/activity/locale.js';
import * as appearanceCopy from './features/appearance/locale.js';
import * as approvalsCopy from './features/approvals/locale.js';
import * as assignmentsCopy from './features/assignments/locale.js';
import * as avatarsCopy from './features/avatars/locale.js';
import * as channelFilesCopy from './features/channel-files/locale.js';
import * as channelsCopy from './features/channels/locale.js';
import * as channelsComposerLocaleCopy from './features/channels/composer-locale.js';
import * as computerCopy from './features/computer/locale.js';
import * as diagnosticsCopy from './features/diagnostics/locale.js';
import * as environmentsCopy from './features/environments/locale.js';
import * as environmentsConnectionsLocaleCopy from './features/environments/connections-locale.js';
import * as environmentsPairingLocaleCopy from './features/environments/pairing-locale.js';
import * as genuiCopy from './features/genui/locale.js';
import * as humansCopy from './features/humans/locale.js';
import * as interfaceControlsCopy from './features/interface-controls/locale.js';
import * as marketplaceCopy from './features/marketplace/locale.js';
import * as memoryCopy from './features/memory/locale.js';
import * as messagingCopy from './features/messaging/locale.js';
import * as modelsCopy from './features/models/locale.js';
import * as personabotsCopy from './features/personabots/locale.js';
import * as personabotsOnboardingLocaleCopy from './features/personabots/onboarding-locale.js';
import * as personabotsProfileLocaleCopy from './features/personabots/profile-locale.js';
import * as privateInputCopy from './features/private-input/locale.js';
import * as profileStorageCopy from './features/profile-storage/locale.js';
import * as promptsCopy from './features/prompts/locale.js';
import * as releaseCopy from './features/release/locale.js';
import * as schedulesCopy from './features/schedules/locale.js';
import * as sessionsCopy from './features/sessions/locale.js';
import * as skillsCopy from './features/skills/locale.js';
import * as takeoverCopy from './features/takeover/locale.js';
import * as teamCopy from './features/team/locale.js';
import * as tobCopy from './features/tob/locale.js';
import * as usageCopy from './features/usage/locale.js';
import * as voiceCopy from './features/voice/locale.js';
import * as workspacesCopy from './features/workspaces/locale.js';

import * as modelProviderCopy from './model-provider-copy.js';
import { AVATAR_LABELS } from '../../../core/src/bots/avatar-labels.js';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';

export const LOCALE_NS = 'botharness';

export const zh = {
  ...modelProviderCopy.zh,
  ...AVATAR_LABELS.zh,
  ...activityCopy.zh,
  ...appearanceCopy.zh,
  ...approvalsCopy.zh,
  ...assignmentsCopy.zh,
  ...avatarsCopy.zh,
  ...channelFilesCopy.zh,
  ...channelsCopy.zh,
  ...channelsComposerLocaleCopy.zh,
  ...computerCopy.zh,
  ...diagnosticsCopy.zh,
  ...environmentsCopy.zh,
  ...environmentsConnectionsLocaleCopy.zh,
  ...environmentsPairingLocaleCopy.zh,
  ...genuiCopy.zh,
  ...humansCopy.zh,
  ...interfaceControlsCopy.zh,
  ...marketplaceCopy.zh,
  ...memoryCopy.zh,
  ...messagingCopy.zh,
  ...modelsCopy.zh,
  ...personabotsCopy.zh,
  ...personabotsOnboardingLocaleCopy.zh,
  ...personabotsProfileLocaleCopy.zh,
  ...privateInputCopy.zh,
  ...profileStorageCopy.zh,
  ...promptsCopy.zh,
  ...releaseCopy.zh,
  ...schedulesCopy.zh,
  ...sessionsCopy.zh,
  ...skillsCopy.zh,
  ...takeoverCopy.zh,
  ...teamCopy.zh,
  ...tobCopy.zh,
  ...usageCopy.zh,
  ...voiceCopy.zh,
  ...workspacesCopy.zh,
  'home.starters': '快捷提问',
  'home.greeting': '你好，我是托布',
  'home.description': '你的本地总管。了解 Bot 的状态，或告诉我你想调整什么。',
  'settings.search': '搜索设置',
  'settings.back': '返回设置列表',
  'settings.results': '搜索结果',
  'settings.noResults': '没有找到匹配的设置',
  'settings.home': '常用',
  'settings.home.restore': '恢复默认固定',
  'settings.home.pairPhone': '连接手机',
  'settings.home.empty': '还没有固定的设置。打开任意设置页，点右上角的星标把它固定到这里。',
  'settings.pin': '固定到常用',
  'settings.unpin': '从常用移除',
  'settings.unpinNamed': '从常用移除{section}',
  'settings.theme': '主题',
  'settings.theme.system': '跟随系统',
  'settings.theme.light': '浅色',
  'settings.theme.dark': '深色',
  'settings.language': '界面语言',
  'settings.shortcuts.search': '搜索快捷键',
  'settings.shortcuts.conflict': '此组合已被占用或保留，请选择其他按键。',
  'settings.shortcuts.saveFailed': '未能保存快捷键，请重试。',
  'settings.shortcuts.unbound': '未设置',
  'settings.nav': 'Bot 设置',
  'settings.moved': 'Bot 设置已移到独立窗口，按主题分组。',
  'settings.open': '打开 Bot 设置',
  'panel.label': 'Bot 模式',
  'panel.settings': 'Bot 设置',
  'panel.exit': '退出 Bot 模式',
  'panel.backToHarness': '返回 Harness',
  'panel.brand': 'Tobs',
  'panel.sidebar.open': '打开侧边栏',
  'panel.sidebar.close': '关闭侧边栏',
  'panel.sidebar.collapse': '收起侧边栏',
  'general.section.language': '语言与缩放',
  'general.section.motion': '动效',
  'general.section.onboarding': '新手教程',
  'advanced.section.developer': '开发者',
  'developer.row.title': '开发者模式',
  'developer.row.description': '显示 Session 来源、工作区授权历史和高级选项',
  'move.menu.label': '移动到',
  'move.newSection': '新建分组并移动',
  'common.cancel': '取消',
  'common.create': '创建',
  'common.delete': '删除',
  'common.rename': '重命名',
  'common.close': '关闭',
  'common.decrease': '减少',
  'common.increase': '增加',
  'time.justNow': '刚刚',
  'time.minutesAgo': '{n} 分钟前',
  'time.hoursAgo': '{n} 小时前',
  'time.daysAgo': '{n} 天前',
  'time.yesterday': '昨天',
  'time.intlLocale': 'zh-CN',
  'time.monthsAgo': '{n} 个月前',
  'time.yearsAgo': '{n} 年前',
  'main.author.human': '你',
  'main.author.system': '系统',
  'main.date.locale': 'zh-CN',
  'main.welcome.title': '与 Bot 对话',
  'main.welcome.hint': '选择一个 Bot 或频道开始',
  'main.welcome.empty': '还没有 Bot；可从左侧「+」或空态按钮创建。',
  'main.group.note': '邀请 Bot 加入，或在频道侧栏的「外部连接器」中接入外部会话。',
  'main.group.memberNote': '给频道里的所有人发第一条消息。',
  'main.localChat': '本地对话',
  'main.localChat.with': '这是与 {name} 的本地对话',
  'main.localChat.hint': '直接发消息即可；Bot 会自行安排事项，并在这里回复结果。',
  'main.humanChat.hint': '发条消息，开始聊天。',
  'main.group.title': '群聊',
  'main.activity.bots': '{count} 个 Bot 有状态更新',
  'main.activity.more': '另有 {count} 个',
  'sidebar.expand': '展开 Channel sidebar',
  'sidebar.collapse': '收起 Channel sidebar',
  'sidebar.settings': 'Channel sidebar 设置',
  'sidebar.order.edit': '编辑侧边栏',
  'sidebar.order.hint': '拖动排序，或聚焦手柄后使用上下方向键',
  'sidebar.order.done': '完成',
  'sidebar.order.cancel': '取消',
  'sidebar.order.reset': '恢复默认布局',
  'sidebar.order.move': '移动 {label}',
  'sidebar.visibility.hide': '隐藏 {label}',
  'sidebar.visibility.show': '显示 {label}',
  'sidebar.visibility.hidden': '已隐藏',
  'sidebar.visibility.empty': '所有项目均已隐藏，可通过设置进入编辑模式恢复。',
  'sidebar.order.position': '{label}，第 {position} 项，共 {total} 项',
  'sidebar.settings.empty': '暂无显示设置',
  'sidebar.resize.label': '调整 Channel sidebar 宽度',
  'sidebar.empty': '还没有可显示的面板。',
  'sidebar.region': 'Channel sidebar',
  'sidebar.tabs': 'Channel sidebar 标签页',
  'sidebar.split.resize': '调整上下区域高度',
  'tab.conversation': '会话',
  'tab.memory': '记忆',
  'tab.screen': '屏幕',
  'sidebar.views': '视图',
  'sidebar.views.hint': '拖动或按 Alt + ↑/↓ 调整顺序',
  'sidebar.views.keepOne': '至少保留一个视图',
  'access.section': '权限',
  'access.title': '完全访问',
  'access.description':
    '普通操作可访问所有文件，无需逐次确认；权限变更仍需确认。关闭后，聊天和新事项恢复工作区权限；已有事项保留原权限。',
  'access.confirmTitle': '开启危险文件权限？',
  'access.confirmRisk':
    '聊天会话和新事项可直接运行命令，修改或删除工作区外的文件。群聊和 IM 消息也可能触发这些操作。开启期间创建的事项，关闭后仍保留完全访问。',
  'access.confirmEnable': '我了解风险，开启',
  'access.scopeTitle': '完全访问的范围',
  'access.scopeChat': '聊天会话和新事项',
  'access.scopeAssignments': '仅新事项',
  'access.activeWarningAssignments':
    '新事项可运行命令，修改或删除工作区外的文件，无需审批。聊天会话仍使用工作区权限。',
  'access.activeWarning': '聊天会话和新事项可运行命令，修改或删除工作区外的文件，无需审批。',
  'access.sessionWarning': '此事项以危险文件权限创建；关闭 Bot 开关不会改变它。',
} as const satisfies Record<string, string>;

export type BotHarnessKey = keyof typeof zh;

export function zhTranslate(key: BotHarnessKey | string, params?: Record<string, unknown>): string {
  let text: string = (zh as Record<string, string>)[key] ?? key;
  if (params === undefined) return text;
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}

export const en = {
  ...modelProviderCopy.en,
  ...AVATAR_LABELS.en,
  ...activityCopy.en,
  ...appearanceCopy.en,
  ...approvalsCopy.en,
  ...assignmentsCopy.en,
  ...avatarsCopy.en,
  ...channelFilesCopy.en,
  ...channelsCopy.en,
  ...channelsComposerLocaleCopy.en,
  ...computerCopy.en,
  ...diagnosticsCopy.en,
  ...environmentsCopy.en,
  ...environmentsConnectionsLocaleCopy.en,
  ...environmentsPairingLocaleCopy.en,
  ...genuiCopy.en,
  ...humansCopy.en,
  ...interfaceControlsCopy.en,
  ...marketplaceCopy.en,
  ...memoryCopy.en,
  ...messagingCopy.en,
  ...modelsCopy.en,
  ...personabotsCopy.en,
  ...personabotsOnboardingLocaleCopy.en,
  ...personabotsProfileLocaleCopy.en,
  ...privateInputCopy.en,
  ...profileStorageCopy.en,
  ...promptsCopy.en,
  ...releaseCopy.en,
  ...schedulesCopy.en,
  ...sessionsCopy.en,
  ...skillsCopy.en,
  ...takeoverCopy.en,
  ...teamCopy.en,
  ...tobCopy.en,
  ...usageCopy.en,
  ...voiceCopy.en,
  ...workspacesCopy.en,
  'home.starters': 'Suggested questions',
  'home.greeting': 'Hello, I’m Tob',
  'home.description':
    'Your local steward. Check on your Bots or tell me what you’d like to change.',
  'settings.search': 'Search settings',
  'settings.back': 'Back to settings list',
  'settings.results': 'Search results',
  'settings.noResults': 'No matching settings',
  'settings.home': 'Pinned',
  'settings.home.restore': 'Restore default pins',
  'settings.home.pairPhone': 'Connect phone',
  'settings.home.empty':
    'Nothing is pinned yet. Open any settings page and select the star at the top to pin it here.',
  'settings.pin': 'Pin to Pinned',
  'settings.unpin': 'Remove from Pinned',
  'settings.unpinNamed': 'Remove {section} from Pinned',
  'settings.theme': 'Theme',
  'settings.theme.system': 'Follow system',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.language': 'Interface language',
  'settings.shortcuts.search': 'Search shortcuts',
  'settings.shortcuts.conflict': 'This combination is reserved or already in use. Choose another.',
  'settings.shortcuts.saveFailed': 'Could not save the shortcut. Please retry.',
  'settings.shortcuts.unbound': 'Unassigned',
  'settings.nav': 'Bot settings',
  'settings.moved': 'Bot settings now open in their own window, grouped by topic.',
  'settings.open': 'Open Bot settings',
  'panel.label': 'Bot mode',
  'panel.settings': 'Bot settings',
  'panel.exit': 'Exit Bot mode',
  'panel.backToHarness': 'Back to Harness',
  'panel.brand': 'Tobs',
  'panel.sidebar.open': 'Open sidebar',
  'panel.sidebar.close': 'Close sidebar',
  'panel.sidebar.collapse': 'Collapse sidebar',
  'general.section.language': 'Language and zoom',
  'general.section.motion': 'Motion',
  'general.section.onboarding': 'Getting started',
  'advanced.section.developer': 'Developer',
  'developer.row.title': 'Developer mode',
  'developer.row.description':
    'Show Session provenance, workspace access history and advanced options',
  'move.menu.label': 'Move to',
  'move.newSection': 'New section and move',
  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.delete': 'Delete',
  'common.rename': 'Rename',
  'common.close': 'Close',
  'common.decrease': 'Decrease',
  'common.increase': 'Increase',
  'time.justNow': 'Just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} h ago',
  'time.daysAgo': '{n} d ago',
  'time.yesterday': 'Yesterday',
  'time.intlLocale': 'en-US',
  'time.monthsAgo': '{n} mo ago',
  'time.yearsAgo': '{n} y ago',
  'main.author.human': 'You',
  'main.author.system': 'System',
  'main.date.locale': 'en-US',
  'main.welcome.title': 'Talk to a Bot',
  'main.welcome.hint': 'Choose a Bot or channel to start',
  'main.welcome.empty': 'No Bots yet — create one from “+” or the button below.',
  'main.group.note':
    'Invite Bots or connect an external conversation under External connectors in the Channel sidebar.',
  'main.group.memberNote': 'Send the first message to everyone in this channel.',
  'main.localChat': 'Local chat',
  'main.localChat.with': 'This is a local conversation with {name}',
  'main.localChat.hint': 'Just send a message; the Bot schedules work and replies here.',
  'main.humanChat.hint': 'Send a message to start chatting.',
  'main.group.title': 'Group chat',
  'main.activity.bots': '{count} Bots have updates',
  'main.activity.more': '+{count} more',
  'sidebar.expand': 'Expand the Channel sidebar',
  'sidebar.collapse': 'Collapse the Channel sidebar',
  'sidebar.settings': 'Channel sidebar settings',
  'sidebar.order.edit': 'Edit sidebar',
  'sidebar.order.hint': 'Drag to reorder, or focus a handle and use arrow keys',
  'sidebar.order.done': 'Done',
  'sidebar.order.cancel': 'Cancel',
  'sidebar.order.reset': 'Restore defaults',
  'sidebar.order.move': 'Move {label}',
  'sidebar.visibility.hide': 'Hide {label}',
  'sidebar.visibility.show': 'Show {label}',
  'sidebar.visibility.hidden': 'Hidden',
  'sidebar.visibility.empty': 'All items are hidden. Open settings to edit and show them.',
  'sidebar.order.position': '{label}, position {position} of {total}',
  'sidebar.settings.empty': 'No display settings available',
  'sidebar.resize.label': 'Resize the Channel sidebar',
  'sidebar.empty': 'No panels to show yet.',
  'sidebar.region': 'Channel sidebar',
  'sidebar.tabs': 'Channel sidebar tabs',
  'sidebar.split.resize': 'Resize the top and bottom areas',
  'tab.conversation': 'Sessions',
  'tab.memory': 'Memory',
  'tab.screen': 'Screen',
  'sidebar.views': 'Views',
  'sidebar.views.hint': 'Drag or press Alt + ↑/↓ to reorder',
  'sidebar.views.keepOne': 'Keep at least one view',
  'access.section': 'Access',
  'access.title': 'Full access',
  'access.description':
    'Ordinary work can access all files without repeated prompts. Permission changes still need confirmation. Turning this off restores workspace permissions for chat and new Assignments; existing Assignments keep their permissions.',
  'access.confirmTitle': 'Enable dangerous file access?',
  'access.confirmRisk':
    'Chat and new Assignments can run commands that change or delete files outside the workspace without approval. Group and IM messages can trigger these actions. Assignments created with full access keep it after you turn this off.',
  'access.confirmEnable': 'I understand, enable',
  'access.scopeTitle': 'Scope of full access',
  'access.scopeChat': 'Chat and new Assignments',
  'access.scopeAssignments': 'New Assignments only',
  'access.activeWarningAssignments':
    'New Assignments can run commands that change or delete files outside the workspace without approval. Chat keeps workspace permissions.',
  'access.activeWarning':
    'Chat and new Assignments can run commands that change or delete files outside the workspace without approval.',
  'access.sessionWarning':
    'This Assignment was created with dangerous file access; turning off the Bot setting will not change it.',
} satisfies Record<BotHarnessKey, string>;

export type BotHarnessTranslate = TranslateNS<typeof LOCALE_NS>;

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    botharness: BotHarnessKey;
  }
}
