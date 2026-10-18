import { Pressable } from 'react-native';

import { edge, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Text } from '../primitives/text';
import { PlusIcon } from './icons';

export function WorkspaceAddButton({ label, onPress }: { label: string; onPress(): void }) {
  const theme = useDesignTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        marginHorizontal: space.x5,
        marginVertical: space.x3,
        padding: space.x4,
        borderRadius: radius.xl,
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
      })}
    >
      <PlusIcon color={theme.color.fg} size={theme.type.title.line} />
      <Text strong style={{ flex: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
