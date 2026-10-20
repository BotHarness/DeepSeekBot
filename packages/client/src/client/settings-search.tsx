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
  general: ['onboarding.settings.title'],
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
    'wallpaper.title',
    'appearance.header',
    'appearance.materialColor',
    'appearance.materialOpacity',
    'appearance.materialBlur',
    'appearance.body',
    'motion.row.title',
    'icon.row.title',
    'settings.language',
    'workspace.appearance',
    'workspace.gap',
    'dock.reset',
  ],
  models: [
    'onboarding.defaultTitle',
    'idleCompaction.row.title',
    'assignmentLimit.title',
    'botSessions.row.title',
    'approvalReviewSessions.row.title',
  ],
  messaging: [
    'humanName.title',
    'sendKey.row.title',
    'groupAutoAccept.row.title',
    'defaults.title',
    'bridge.condition',
    'im.ordinaryWake',
    'defaults.threshold',
    'defaults.identityRow',
    'identity.typing.label',
    'identity.newConversations',
  ],
  notifications: ['desktopNotify.row.title'],
  shortcuts: ['workspace.shortcutSearch', ...SHORTCUT_INDEX],
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
  devices: ['devices.pair.title', 'devices.list.title'],
  about: ['release.row.title', 'build.row.title'],
  'data-privacy': ['backup.title', 'telemetry.row.title', 'dataReset.row.title'],
};

const SECTION_LABELS: Readonly<Record<string, BotHarnessKey>> = {
  general: 'botSettings.section.general',
  appearance: 'botSettings.section.appearance',
  notifications: 'botSettings.section.notifications',
  shortcuts: 'shortcuts.title',
  models: 'botSettings.section.models',
  messaging: 'botSettings.section.messaging',
  'auto-approval': 'botSettings.section.autoApproval',
  'im-apps': 'botSettings.section.imApps',
  companions: 'botSettings.section.companions',
  devices: 'botSettings.section.devices',
  'data-privacy': 'botSettings.section.dataPrivacy',
  advanced: 'botSettings.section.advanced',
  about: 'botSettings.section.about',
};

const SECTION_ALIASES: Readonly<Record<string, string>> = {
  appearance: '外观 皮肤 主题 theme skin look',
  shortcuts: '快捷键 键位 热键 hotkey keybinding',
  models: '模型 model',
  notifications: '提醒 alert',
  'im-apps': '飞书 Lark Feishu Slack Discord',
  devices: '手机 phone mobile',
  'data-privacy': '备份 隐私 backup privacy',
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
  'sendKey.row.title': 'Enter Shift+Enter Ctrl+Enter 回车 发送',
  'settings.language': '中文 English language 语言',
  'motion.row.title': 'animation motion 动画 动效',
  'icon.row.title': 'avatar 图标 头像',
  'idleCompaction.row.title': 'compaction context 上下文',
  'telemetry.row.title': 'telemetry analytics 遥测',
  'dataReset.row.title': 'reset uninstall reinstall wipe 重置 卸载 重装 清空',
  'companion.speechSound': 'sound audio 声音',
};

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
            score: Math.min(rank(names), rank(aliases) + 0.5),
          },
        ]
      : [];
    for (const key of SETTINGS_INDEX[row.id] ?? []) {
      if (
        row.layoutAvailable === false &&
        ['workspace.appearance', 'workspace.gap', 'dock.reset'].includes(key)
      )
        continue;
      const own = [t(key), en[key], zh[key], ...(SEARCH_ALIASES[key] ?? '').split(' ')];
      if (!touches(own) || !matches([...page, ...own])) continue;
      const title = t(key);
      if (results.some((result) => result.title === title)) continue;
      const targetKey = key.startsWith('settings.theme.') ? 'settings.theme' : key;
      results.push({
        section: row.id,
        title,
        target: t(targetKey),
        page: row.label,
        score: rank(own),
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
