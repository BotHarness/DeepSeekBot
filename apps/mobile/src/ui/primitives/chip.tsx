import { Pressable } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from './text';
import { t } from '../strings';

export function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const height = theme.type.body.line + space.x3 * 2;
  const slop = Math.max(0, (theme.touch - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : t.filterChip(label, count)}
      hitSlop={{ top: slop, bottom: slop }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: height,
        paddingVertical: space.x3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: space.x4,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: selected ? theme.color.accent : theme.layer.canvas.edge,
        backgroundColor: selected
          ? theme.layer.canvas.chosen
          : pressed
            ? theme.layer.canvas.pressed
            : theme.layer.canvas.fill,
      })}
    >
      <Text strong={selected} style={{ flexShrink: 1 }}>
        {label}
      </Text>
      {count === undefined ? null : (
        <Text variant="meta" tone="muted">
          {String(count)}
        </Text>
      )}
    </Pressable>
  );
}
