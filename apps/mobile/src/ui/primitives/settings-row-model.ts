import type { ReactNode } from 'react';

import type { LayerName } from '../design/layers';
import type { ColorRole } from '../design/resolve-theme';
import type { RowIconName } from './row-icon';

export type SettingsRowControl =
  | {
      kind: 'switch';
      value: boolean;
      onChange(value: boolean): void;
      disabled?: boolean;
      testID?: string;
    }
  | { kind: 'check' }
  | { kind: 'value'; text: string; chevron?: boolean | undefined }
  | { kind: 'busy' }
  | { kind: 'chevron' }
  | { kind: 'add' };

export type SettingsRowProps = {
  title: string;
  detail?: string | undefined;
  tone?: ColorRole;
  strong?: boolean;
  icon?: RowIconName | undefined;
  iconTone?: 'accent' | 'danger' | 'muted' | undefined;
  leading?: ReactNode;
  control?: SettingsRowControl | undefined;
  trailing?: ReactNode;
  accessory?: ReactNode;
  selected?: boolean | undefined;
  expanded?: boolean | undefined;
  disclosure?: boolean;
  accessibilityLabel?: string | undefined;
  testID?: string | undefined;
  on?: LayerName;
  onPress?: (() => void) | undefined;
};

export function settingsRowLabel({
  title,
  detail,
  control,
  accessibilityLabel,
}: Pick<SettingsRowProps, 'title' | 'detail' | 'control' | 'accessibilityLabel'>) {
  if (accessibilityLabel !== undefined) return accessibilityLabel;
  return [title, detail, control?.kind === 'value' ? control.text : undefined]
    .filter((part) => part !== undefined)
    .join(', ');
}
