import { Pressable } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { t } from '../strings';
import { SettingsIcon } from './icons';

export function SettingsButton({ onPress }: { onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.settings}
      style={({ pressed }) => ({
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <SettingsIcon color={theme.color.fg} size={theme.type.title.line} />
    </Pressable>
  );
}
