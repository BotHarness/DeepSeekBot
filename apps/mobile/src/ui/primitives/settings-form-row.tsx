import type { SettingsRow, SettingsSection } from './settings-row';

export type SettingsRowProps = Parameters<typeof SettingsRow>[0];
export type SettingsSectionProps = Parameters<typeof SettingsSection>[0];

export function FormSection(_: SettingsSectionProps): null {
  return null;
}

export function FormRow(_: SettingsRowProps): null {
  return null;
}
