import { Pressable } from 'react-native';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function HiddenChatRow({
  name,
  busy,
  disabled,
  onUnhide,
  testID,
}: {
  name: string;
  busy: boolean;
  disabled: boolean;
  onUnhide(): void;
  testID: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const unavailable = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t.hiddenChats.unhideLabel(name)}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onUnhide}
      android_ripple={{ color: theme.layer.canvas.pressed }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x4,
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <Text style={{ flex: 1, minWidth: 0 }}>{name}</Text>
      <Text tone={unavailable ? 'muted' : 'accent'}>{t.hiddenChats.unhide}</Text>
    </Pressable>
  );
}
