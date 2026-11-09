import type { ReactElement } from 'react';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { en, zh, type BotHarnessKey, type BotHarnessTranslate } from './locale.js';
import type { BotSettingsSectionRow } from './bot-settings.js';
import { searchTextMatches, searchTextScore } from './search-match.js';
import { SHORTCUT_HELP_GROUPS } from './shortcut-help.js';

const SHORTCUT_INDEX: readonly BotHarnessKey[] = SHORTCUT_HELP_GROUPS.flatMap((group) => [
  group.title,
  ...group.entries.map((entry) => entry.label),
]);

export const SETTINGS_INDEX: Readonly<Record<string, readonly BotHarnessKey[]>> = {
  account: [
    'accountProfile.title',
    'accountProfile.photo',
    'accountProfile.name',
    'accountProfile.id',
    'accountProfile.email',
  ],
  general: ['zoom.current', 'zoom.default', 'onboarding.settings.title'],
  appearance: [
    'recovery.title',
    'settings.theme',
    'settings.theme.system',
    'settings.theme.light',
    'settings.theme.dark',
    'appearance.lightPreset',
    'appearance.lightPrimary',
    'appearance.darkPreset',
    'appearance.darkPrimary',
    'appearance.primary',
    'wallpaper.title',
    'wallpaper.interval',
    'wallpaper.shuffle',
    'appearance.header',
    'appearance.materialColor',
    'appearance.materialOpacity',
    'appearance.materialBlur',
    'appearance.body',
    'motion.row.title',
    'icon.row.title',
    'settings.language',
    'workspace.appearance',
    'workspace.layoutMode',
    'workspace.gap',
    'dock.reset',
  ],
  models: [
    'onboarding.defaultTitle',
    'idleCompaction.row.title',
    'compactionThreshold.row.title',
    'assignmentLimit.title',
    'botSessions.row.title',
    'approvalReviewSessions.row.title',
  ],
  messaging: [
    'humanName.title',
    'sendKey.row.title',
    'messageFold.row.title',
    'message.delivery.row.title',
    'message.stream.row.title',
    'groupAutoAccept.row.title',
    'botHopLimit.title',
    'defaults.title',
    'identity.platform',
    'bridge.condition',
    'im.ordinaryWake',
    'defaults.threshold',
    'defaults.identityRow',
    'identity.typing.label',
    'identity.newConversations',
  ],
  notifications: ['desktopNotify.row.title'],
  shortcuts: ['workspace.shortcutSearch', ...SHORTCUT_INDEX],
  prompts: ['prompts.global', 'prompts.new'],
  voice: ['voice.default.title', 'voice.mic.device', 'voice.mic.title', 'voice.mic.threshold'],
  'im-apps': ['imApps.allApps'],
  advanced: ['developer.row.title', 'git.settings.title'],
  'auto-approval': [
    'autoApproval.reviewerModel.title',
    'autoApproval.library.title',
    'autoApproval.library.new',
    'autoApproval.template.cautious',
    'autoApproval.template.getWorkDone',
  ],
  companions: ['companion.speechSound', 'companion.retention'],
  devices: [
    'devices.pair.title',
    'devices.list.title',
    'devices.connect.account',
    'devices.connect.tunnel',
    'devices.connect.computersStatus',
    'connections.title',
    'connections.methods',
    'connections.pending',
    'devices.lan.title',
    'devices.tailscale.title',
  ],
  plugins: ['plugins.row.title'],
  about: ['release.row.title', 'build.row.title'],
  'data-privacy': [
    'backup.title',
    'telemetry.row.title',
    'storage.row.title',
    'dataReset.row.title',
  ],
};

export const SETTINGS_DESCRIPTIONS: Partial<Record<BotHarnessKey, BotHarnessKey>> = {
  'zoom.current': 'zoom.current.description',
  'zoom.default': 'zoom.default.description',
  'onboarding.settings.title': 'onboarding.settings.description',
  'icon.row.title': 'icon.row.description',
  'onboarding.defaultTitle': 'onboarding.defaultDescription',
  'idleCompaction.row.title': 'idleCompaction.row.description',
  'compactionThreshold.row.title': 'compactionThreshold.row.description',
  'assignmentLimit.title': 'assignmentLimit.description',
  'botSessions.row.title': 'botSessions.row.description',
  'approvalReviewSessions.row.title': 'approvalReviewSessions.row.description',
  'autoApproval.reviewerModel.title': 'autoApproval.reviewerModel.description',
  'prompts.global': 'prompts.globalHint',
  'voice.mic.title': 'voice.mic.description',
  'voice.mic.threshold': 'voice.mic.thresholdHint',
  'sendKey.row.title': 'sendKey.row.description',
  'messageFold.row.title': 'messageFold.row.description',
  'message.delivery.row.title': 'message.delivery.row.description',
  'message.stream.row.title': 'message.stream.row.description',
  'groupAutoAccept.row.title': 'groupAutoAccept.row.description',
  'botHopLimit.title': 'botHopLimit.description',
  'bridge.condition': 'defaults.collectionHint',
  'defaults.threshold': 'defaults.thresholdHint',
  'defaults.identityRow': 'defaults.enableIdentity',
  'identity.typing.label': 'defaults.enableTyping',
  'identity.newConversations': 'defaults.newConversationsHint',
  'imApps.allApps': 'imApps.description',
  'companion.speechSound': 'companion.speechSoundHint',
  'companion.retention': 'companion.capacityHint',
  'devices.pair.title': 'devices.pair.description',
  'backup.title': 'backup.description',
  'storage.row.title': 'storage.row.description',
  'dataReset.row.title': 'dataReset.row.description',
  'developer.row.title': 'developer.row.description',
  'git.settings.title': 'git.settings.description',
};

const SECTION_LABELS: Readonly<Record<string, BotHarnessKey>> = {
  account: 'botSettings.section.account',
  general: 'botSettings.section.general',
  appearance: 'botSettings.section.appearance',
  notifications: 'botSettings.section.notifications',
  shortcuts: 'shortcuts.title',
  models: 'botSettings.section.models',
  messaging: 'botSettings.section.messaging',
  prompts: 'botSettings.section.prompts',
  voice: 'botSettings.section.voice',
  'auto-approval': 'botSettings.section.autoApproval',
  'im-apps': 'botSettings.section.imApps',
  companions: 'botSettings.section.companions',
  devices: 'botSettings.section.devices',
  'data-privacy': 'botSettings.section.dataPrivacy',
  advanced: 'botSettings.section.advanced',
  plugins: 'botSettings.section.plugins',
  about: 'botSettings.section.about',
};

const SECTION_ALIASES: Readonly<Record<string, string>> = {
  account: '账号 账户 登录 account login profile',
  general: '常规 基本 general',
  appearance: '外观 皮肤 主题 theme skin look',
  shortcuts: '快捷键 键位 热键 hotkey keybinding',
  models: '模型 model',
  prompts: '提示词 预设 prompt preset',
  voice: '语音 麦克风 voice microphone speech',
  notifications: '提醒 alert',
  'im-apps': '飞书 Lark Feishu Slack Discord',
  devices: '设备 手机 配对 devices phone mobile pair',
  plugins: '插件 plugin',
  about: '版本 关于 version about',
  'data-privacy': '备份 隐私 存储 空间 清理 backup privacy storage cleanup',
};

export const PLUGIN_INDEX: Readonly<Record<string, readonly { zh: string; en: string }[]>> = {
  browser: [
    { zh: '操作目标', en: 'Browser Target' },
    { zh: '本机驱动', en: 'Local driver' },
    { zh: '容器驱动', en: 'Container driver' },
  ],
  computer: [
    { zh: '操作目标', en: 'Computer Target' },
    { zh: '自动允许 Computer 操作', en: 'Auto-allow Computer actions' },
  ],
};

const SEARCH_ALIASES: Partial<Record<BotHarnessKey, string>> = {
  'onboarding.settings.title':
    '引导 新手引导 新手 教程 重新开始 重看 继续 开始 导览 onboarding tutorial tour walkthrough guide restart replay',
  'zoom.current': '缩放 放大 缩小 字体 字号 zoom scale font size',
  'zoom.default': '缩放 放大 缩小 字体 字号 zoom scale font size',
  'accountProfile.name': '名字 昵称 name nickname',
  'accountProfile.photo': '头像 avatar picture',
  'appearance.primary': '颜色 强调色 color accent',
  'wallpaper.interval': '壁纸 轮播 wallpaper rotate slideshow',
  'wallpaper.shuffle': '壁纸 随机 wallpaper random',
  'sendKey.row.title': 'Enter Shift+Enter Ctrl+Enter 回车 发送 换行 newline',
  'message.stream.row.title': '流式 打字 stream streaming typing',
  'message.delivery.row.title': '已读 回执 read receipt receipts',
  'botHopLimit.title': '跳数 接力 循环 hop loop relay',
  'settings.language': '中文 English language 语言',
  'motion.row.title': 'animation motion 动画 动效',
  'icon.row.title': 'avatar 图标 头像',
  'onboarding.defaultTitle': '模型 默认模型 model default model',
  'idleCompaction.row.title': 'compaction context 上下文 压缩',
  'compactionThreshold.row.title': 'compaction context 上下文 压缩 阈值 threshold',
  'assignmentLimit.title': '并发 任务 concurrency tasks parallel',
  'autoApproval.reviewerModel.title': '审批 复核 approval reviewer',
  'prompts.global': '提示词 系统提示 预设 prompt system prompt preset',
  'prompts.new': '提示词 预设 prompt preset',
  'voice.default.title': '语音 识别 转写 朗读 voice speech transcription TTS STT',
  'voice.mic.device': '麦克风 话筒 microphone mic input',
  'voice.mic.title': '麦克风 话筒 测试 microphone mic test',
  'voice.mic.threshold': '麦克风 灵敏度 阈值 microphone sensitivity threshold',
  'devices.pair.title': '手机 配对 扫码 二维码 phone mobile pair QR',
  'devices.lan.title': '局域网 内网 LAN WiFi',
  'devices.tailscale.title': 'Tailscale VPN 远程 remote',
  'imApps.allApps': '飞书 Lark Feishu Slack Discord 微信 WeChat QQ',
  'telemetry.row.title': 'telemetry analytics 遥测 统计',
  'storage.row.title': '存储 空间 清理 磁盘 storage disk cleanup',
  'backup.title': '备份 恢复 导出 导入 backup restore export import',
  'dataReset.row.title': 'reset uninstall reinstall wipe 重置 卸载 重装 清空',
  'developer.row.title': '开发者 调试 developer debug',
  'plugins.row.title': '插件 更新 plugin plugins update',
  'release.row.title': '版本 更新 升级 version update upgrade',
  'companion.speechSound': 'sound audio 声音',
};

function describes(text: string, term: string): boolean {
  const score = searchTextScore(text, term);
  return score !== undefined && score <= 3;
}

export interface SettingsSearchResult {
  section: string;
  title: string;
  target?: string;
  page: string;
}

export function searchSettings(
  rows: readonly BotSettingsSectionRow[],
  query: string,
  t: BotHarnessTranslate,
): SettingsSearchResult[] {
  const terms = query.trim().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  const matches = (texts: readonly string[]) =>
    terms.every((term) => texts.some((text) => searchTextMatches(text, term)));
  const touches = (texts: readonly string[]) =>
    terms.some((term) => texts.some((text) => searchTextMatches(text, term)));
  const rank = (texts: readonly string[]) =>
    Math.min(9, ...texts.map((text) => searchTextScore(text, query) ?? 9));
  const scored = rows.flatMap((row) => {
    const sectionKey = SECTION_LABELS[row.id];
    const names = [
      row.label,
      ...(sectionKey === undefined ? [] : [en[sectionKey], zh[sectionKey]]),
    ];
    const aliases = (SECTION_ALIASES[row.id] ?? '').split(' ');
    const page = [...names, ...aliases];
    const results: (SettingsSearchResult & { score: number })[] = matches([
      ...page,
      'settings',
      '设置',
    ])
      ? [
          {
            section: row.id,
            title: row.label,
            page: row.label,
            score: Math.min(rank(names), rank(aliases) + 0.75),
          },
        ]
      : [];
    for (const key of SETTINGS_INDEX[row.id] ?? []) {
      if (
        row.layoutAvailable === false &&
        ['workspace.appearance', 'workspace.layoutMode', 'workspace.gap', 'dock.reset'].includes(
          key,
        )
      )
        continue;
      const titles = [t(key), en[key], zh[key]];
      const synonyms = (SEARCH_ALIASES[key] ?? '').split(' ').filter(Boolean);
      const descriptionKey = SETTINGS_DESCRIPTIONS[key];
      const descriptions =
        descriptionKey === undefined ? [] : [en[descriptionKey], zh[descriptionKey]];
      const own = (term: string) =>
        [...titles, ...synonyms].some((text) => searchTextMatches(text, term)) ||
        descriptions.some((text) => describes(text, term));
      if (!terms.some(own)) continue;
      if (!terms.every((term) => own(term) || page.some((text) => searchTextMatches(text, term))))
        continue;
      const title = t(key);
      if (results.some((result) => result.title === title)) continue;
      const targetKey = key.startsWith('settings.theme.') ? 'settings.theme' : key;
      results.push({
        section: row.id,
        title,
        target: t(targetKey),
        page: row.label,
        score: Math.min(
          rank(titles),
          rank(synonyms) + 0.5,
          descriptions.some((text) => describes(text, query.trim())) ? 6 : 9,
        ),
      });
    }
    for (const item of PLUGIN_INDEX[row.id] ?? []) {
      const own = [item.zh, item.en];
      if (!touches(own) || !matches([...page, ...own])) continue;
      const title = t('settings.nav') === zh['settings.nav'] ? item.zh : item.en;
      if (results.some((result) => result.title === title)) continue;
      results.push({ section: row.id, title, target: title, page: row.label, score: rank(own) });
    }
    return results;
  });
  return scored
    .map((result, index) => ({ result, index }))
    .sort((left, right) => left.result.score - right.result.score || left.index - right.index)
    .map(({ result: { score: _score, ...result } }) => result);
}

export function SettingsSearch({
  query,
  onChange,
  t,
}: {
  query: string;
  onChange(value: string): void;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <Input
      className="bh-settings-search-input"
      type="search"
      aria-label={t('settings.search')}
      placeholder={t('settings.search')}
      value={query}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
