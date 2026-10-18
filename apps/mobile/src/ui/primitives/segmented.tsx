import { Pressable, View } from 'react-native';

import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from './text';

export function Segmented<T extends string>({
  label,
  options,
  value,
  on = 'canvas',
  onChange,
  compact = false,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  on?: LayerName;
  onChange(value: T): void;
  compact?: boolean;
}) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: theme.largeText ? 'column' : 'row',
        padding: space.x1,
        gap: space.x1,
        borderRadius: radius.md,
        backgroundColor: layer.inset,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            hitSlop={{ top: space.x1, bottom: space.x1 }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={({ pressed }) => ({
              ...(theme.largeText ? {} : { flex: 1 }),
              paddingHorizontal: space.x3,
              paddingVertical: space.x3,
              minHeight: theme.touch - space.x1 * 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md - space.x1,
              backgroundColor: selected ? layer.fill : pressed ? layer.pressed : layer.inset,
            })}
          >
            <Text
              variant={compact ? 'meta' : 'body'}
              strong={selected}
              style={{ textAlign: 'center' }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
