import { Host, Switch } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { androidSettings } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import type { ToggleProps } from './toggle';

export function Toggle({ label, value, disabled = false, on = 'sheet', onChange }: ToggleProps) {
  const theme = useDesignTheme();
  return (
    <View
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      accessibilityActions={disabled ? [] : [{ name: 'activate' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!disabled && nativeEvent.actionName === 'activate') onChange(!value);
      }}
      style={{ width: androidSettings.switchWidth, height: androidSettings.switchHeight }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <Host
          colorScheme={theme.scheme}
          seedColor={theme.color.accent}
          style={{ width: androidSettings.switchWidth, height: androidSettings.switchHeight }}
        >
          <Switch
            value={value}
            enabled={!disabled}
            onCheckedChange={onChange}
            colors={{
              checkedTrackColor: theme.color.accent,
              checkedThumbColor: theme.color.onAccent,
              uncheckedTrackColor: theme.layer[on].fill,
              uncheckedThumbColor: theme.color.muted,
              uncheckedBorderColor: theme.color.muted,
            }}
          />
        </Host>
      </View>
    </View>
  );
}
