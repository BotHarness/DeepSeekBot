import type { BotHarnessTranslate } from './locale.js';

export const REMOTE_SETTINGS_SECTIONS = {
  hostModels: 'environment-models',
  hostAppearance: 'environment-appearance',
  hostNotifications: 'environment-notifications',
  hostApprovals: 'environment-approvals',
  hostPrompts: 'environment-prompts',
  hostMessaging: 'environment-messaging',
  hostVoice: 'environment-voice',
  hostUsage: 'environment-usage',
  hostStorage: 'environment-storage',
  hostConnections: 'environment-connections',
} as const;

export type RemoteSettingsSection =
  (typeof REMOTE_SETTINGS_SECTIONS)[keyof typeof REMOTE_SETTINGS_SECTIONS];

export const REMOTE_SECTION_ICONS: Readonly<Record<RemoteSettingsSection, string>> = {
  [REMOTE_SETTINGS_SECTIONS.hostModels]: 'cpu',
  [REMOTE_SETTINGS_SECTIONS.hostAppearance]: 'paintbrush',
  [REMOTE_SETTINGS_SECTIONS.hostNotifications]: 'bell',
  [REMOTE_SETTINGS_SECTIONS.hostApprovals]: 'shield-check',
  [REMOTE_SETTINGS_SECTIONS.hostPrompts]: 'file-text',
  [REMOTE_SETTINGS_SECTIONS.hostMessaging]: 'message-square',
  [REMOTE_SETTINGS_SECTIONS.hostVoice]: 'audio-lines',
  [REMOTE_SETTINGS_SECTIONS.hostUsage]: 'gauge',
  [REMOTE_SETTINGS_SECTIONS.hostStorage]: 'files',
  [REMOTE_SETTINGS_SECTIONS.hostConnections]: 'plug',
};

const MEMBER_REMOTE_SECTIONS: ReadonlySet<RemoteSettingsSection> = new Set([
  REMOTE_SETTINGS_SECTIONS.hostAppearance,
  REMOTE_SETTINGS_SECTIONS.hostNotifications,
  REMOTE_SETTINGS_SECTIONS.hostConnections,
]);

export function remoteSettingsRows(
  t: BotHarnessTranslate,
  options: { member?: boolean } = {},
): readonly { id: RemoteSettingsSection; order: number; label: string }[] {
  const rows: { id: RemoteSettingsSection; label: string }[] = [
    {
      id: REMOTE_SETTINGS_SECTIONS.hostModels,
      label: t('remoteHosts.settings.models'),
    },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostApprovals,
      label: t('botSettings.section.autoApproval'),
    },
    { id: REMOTE_SETTINGS_SECTIONS.hostPrompts, label: t('botSettings.section.prompts') },
    { id: REMOTE_SETTINGS_SECTIONS.hostVoice, label: t('botSettings.section.voice') },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostMessaging,
      label: t('botSettings.section.messaging'),
    },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostAppearance,
      label: t('environment.settings.appearance'),
    },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostNotifications,
      label: t('remoteHosts.notifications'),
    },
    { id: REMOTE_SETTINGS_SECTIONS.hostUsage, label: t('overviewUsage.title') },
    { id: REMOTE_SETTINGS_SECTIONS.hostStorage, label: t('storage.title') },
    {
      id: REMOTE_SETTINGS_SECTIONS.hostConnections,
      label: t('connections.remote.title'),
    },
  ];
  return rows
    .filter((row) => options.member !== true || MEMBER_REMOTE_SECTIONS.has(row.id))
    .map((row, order) => ({ ...row, order }));
}

export const REMOTE_DEVICE_SECTIONS: ReadonlySet<string> = new Set([
  REMOTE_SETTINGS_SECTIONS.hostAppearance,
  REMOTE_SETTINGS_SECTIONS.hostNotifications,
]);

export function isRemoteSettingsSection(id: string): id is RemoteSettingsSection {
  return Object.hasOwn(REMOTE_SECTION_ICONS, id);
}
