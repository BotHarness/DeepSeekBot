import { Pressable } from 'react-native';

import { space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { MenuIcon } from '../primitives/menu-icon';
import { Text } from '../primitives/text';
import { ChevronRightIcon } from '../shell/icons';
import { useStrings } from '../strings';

export function HiddenChatsEntry({
  count,
  hostName,
  onPress,
  testID = 'hidden-chats-entry',
}: {
  count: number;
  hostName?: string | undefined;
  onPress(): void;
  testID?: string;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const title = hostName === undefined ? t.hiddenChats.title : t.hiddenChats.onHost(hostName);
  const glyph = theme.type.meta.line * theme.fontScale;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: theme.layer.canvas.pressed }}
      accessibilityRole="button"
      accessibilityLabel={t.hiddenChats.label(title, count)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        minHeight: theme.touch,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
        backgroundColor: pressed ? theme.layer.canvas.pressed : theme.layer.canvas.fill,
      })}
    >
      <MenuIcon icon="hide" color={theme.color.muted} size={glyph} />
      <Text variant="meta" tone="muted" style={{ flex: 1, minWidth: 0 }}>
        {title}
      </Text>
      <Text variant="meta" tone="subtle">
        {count}
      </Text>
      <ChevronRightIcon color={theme.color.muted} size={glyph} />
    </Pressable>
  );
}
