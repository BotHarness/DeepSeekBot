import { Switch } from 'react-native';

import { switchColors } from '../design/controls';
import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';

export type ToggleProps = {
  label: string;
  value: boolean;
  disabled?: boolean;
  on?: LayerName;
  onChange(value: boolean): void;
};

export function Toggle({ label, value, disabled = false, on = 'sheet', onChange }: ToggleProps) {
  const theme = useDesignTheme();
  const colors = switchColors(theme, on);
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ true: colors.trackOn, false: colors.trackOff }}
      ios_backgroundColor={colors.trackOff}
      thumbColor={colors.thumb}
      {...{ activeThumbColor: colors.thumb }}
    />
  );
}
