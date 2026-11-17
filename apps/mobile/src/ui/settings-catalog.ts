import type { RowIconName } from './primitives/row-icon';

export type SettingsGroupKey = 'identity' | 'agent' | 'capability' | 'system';
export type SettingsItemStatus = 'ready' | 'desktop' | 'soon';
export type SettingsLabelKey =
  | 'account'
  | 'general'
  | 'appearance'
  | 'models'
  | 'autoApproval'
  | 'prompts'
  | 'voice'
  | 'messaging'
  | 'notifications'
  | 'shortcuts'
  | 'imApps'
  | 'computerControl'
  | 'browserControl'
  | 'companion'
  | 'connections'
  | 'dataPrivacy'
  | 'advanced'
  | 'plugins'
  | 'about';

export type SettingsCatalogEntry = {
  id: string;
  label: SettingsLabelKey;
  group: SettingsGroupKey;
  icon: RowIconName;
  status: SettingsItemStatus;
  route?: string;
};

export const SETTINGS_GROUPS: readonly SettingsGroupKey[] = [
  'identity',
  'agent',
  'capability',
  'system',
];

export const SETTINGS_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'account', label: 'account', group: 'identity', icon: 'account', status: 'ready', route: '/settings/profile' },
  { id: 'general', label: 'general', group: 'identity', icon: 'system', status: 'ready', route: '/settings/general' },
  { id: 'appearance', label: 'appearance', group: 'identity', icon: 'appearance', status: 'ready', route: '/settings/appearance' },
  { id: 'models', label: 'models', group: 'agent', icon: 'model', status: 'ready', route: '/settings/model-runtime' },
  { id: 'autoApproval', label: 'autoApproval', group: 'agent', icon: 'rules', status: 'ready', route: '/settings/auto-approval' },
  { id: 'prompts', label: 'prompts', group: 'agent', icon: 'messageDisplay', status: 'desktop' },
  { id: 'voice', label: 'voice', group: 'agent', icon: 'haptics', status: 'desktop' },
  { id: 'messaging', label: 'messaging', group: 'agent', icon: 'streaming', status: 'ready', route: '/settings/messaging' },
  { id: 'notifications', label: 'notifications', group: 'capability', icon: 'notifications', status: 'ready', route: '/settings/notifications' },
  { id: 'shortcuts', label: 'shortcuts', group: 'capability', icon: 'system', status: 'desktop' },
  { id: 'imApps', label: 'imApps', group: 'capability', icon: 'qr', status: 'ready', route: '/settings/app-setup' },
  { id: 'computerControl', label: 'computerControl', group: 'capability', icon: 'computer', status: 'ready', route: '/settings/capability?kind=computer' },
  { id: 'browserControl', label: 'browserControl', group: 'capability', icon: 'browser', status: 'ready', route: '/settings/capability?kind=browser' },
  { id: 'companion', label: 'companion', group: 'capability', icon: 'account', status: 'desktop' },
  { id: 'connections', label: 'connections', group: 'capability', icon: 'lan', status: 'ready', route: '/settings/connections' },
  { id: 'dataPrivacy', label: 'dataPrivacy', group: 'system', icon: 'storage', status: 'ready', route: '/settings/data-privacy' },
  { id: 'advanced', label: 'advanced', group: 'system', icon: 'access', status: 'ready', route: '/settings/advanced' },
  { id: 'plugins', label: 'plugins', group: 'system', icon: 'folder', status: 'desktop' },
  { id: 'about', label: 'about', group: 'system', icon: 'version', status: 'ready', route: '/settings/about' },
];

export function filterCatalog(
  query: string,
  label: (key: SettingsLabelKey) => string,
): readonly SettingsCatalogEntry[] {
  const term = query.trim().toLocaleLowerCase();
  if (term === '') return SETTINGS_CATALOG;
  return SETTINGS_CATALOG.filter(
    (entry) =>
      label(entry.label).toLocaleLowerCase().includes(term) || entry.id.includes(term),
  );
}
