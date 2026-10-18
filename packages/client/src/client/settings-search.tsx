import type { ReactElement } from 'react';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { en, zh, type BotHarnessKey, type BotHarnessTranslate } from './locale.js';
import type { BotSettingsSectionRow } from './bot-settings.js';

const SETTINGS_INDEX: Readonly<Record<string, readonly BotHarnessKey[]>> = {
  general: ['onboarding.settings.title'],
  appearance: [
    'settings.theme',
    'settings.theme.system',
    'settings.theme.light',
    'settings.theme.dark',
    'motion.row.title',
    'icon.row.title',
    'settings.language',
    'workspace.appearance',
    'workspace.gap',
    'dock.reset',
  ],
  models: [
    'assignmentLimit.title',
    'onboarding.defaultTitle',
    'botSessions.row.title',
    'approvalReviewSessions.row.title',
  ],
  messaging: [
    'humanName.title',
    'sendKey.row.title',
    'groupAutoAccept.row.title',
    'defaults.title',
    'defaults.identityRow',
    'identity.typing.label',
    'identity.newConversations',
    'bridge.condition',
    'im.ordinaryWake',
    'defaults.threshold',
  ],
  notifications: ['desktopNotify.row.title'],
  shortcuts: [
    'shortcuts.title',
    'shortcuts.group.navigation',
    'shortcuts.group.composer',
    'workspace.shortcutSearch',
  ],
  advanced: ['developer.row.title', 'git.settings.title'],
  'auto-approval': ['autoApproval.reviewerModel.title', 'autoApproval.library.title'],
  companions: ['companion.speechSound', 'companion.retention'],
  devices: ['devices.pair.title', 'devices.list.title'],
  about: ['release.row.title', 'build.row.title'],
  'data-privacy': ['backup.title', 'telemetry.row.title'],
};

const SEARCH_ALIASES: Partial<Record<BotHarnessKey, string>> = {
  'sendKey.row.title': 'Enter Shift+Enter Ctrl+Enter 回车 发送',
  'settings.language': '中文 English language 语言',
  'motion.row.title': 'animation motion 动画 动效',
  'icon.row.title': 'avatar 图标 头像',
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
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  const matches = (text: string) => terms.every((term) => text.toLocaleLowerCase().includes(term));
  return rows.flatMap((row) => {
    const results: SettingsSearchResult[] = matches(row.label)
      ? [{ section: row.id, title: row.label, page: row.label }]
      : [];
    for (const key of SETTINGS_INDEX[row.id] ?? []) {
      if (
        row.layoutAvailable === false &&
        ['workspace.appearance', 'workspace.gap', 'dock.reset'].includes(key)
      )
        continue;
      if (!matches([row.label, t(key), en[key], zh[key], SEARCH_ALIASES[key] ?? ''].join(' ')))
        continue;
      const title = t(key);
      if (results.some((result) => result.title === title)) continue;
      const targetKey = key.startsWith('settings.theme.') ? 'settings.theme' : key;
      results.push({ section: row.id, title, target: t(targetKey), page: row.label });
    }
    return results;
  });
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
