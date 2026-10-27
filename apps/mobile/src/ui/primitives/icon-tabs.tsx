import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { useSelectionFeedback } from '../selection-feedback';

export type IconTabOption<T extends string> = {
  value: T;
  label: string;
  symbol: string;
  path: string;
  glyph(color: string, size: number): ReactNode;
};

export type IconTabsProps<T extends string> = {
  label: string;
  options: readonly IconTabOption<T>[];
  value: T;
  on?: LayerName;
  onChange(value: T): void;
};

export function IconTabs<T extends string>({
  label,
  options,
  value,
  on = 'canvas',
  onChange,
}: IconTabsProps<T>) {
  const theme = useDesignTheme();
  const layer = theme.layer[on];
  const select = useSelectionFeedback(value, onChange);
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        padding: space.x1,
        gap: space.x1,
        borderRadius: radius.round,
        backgroundColor: layer.inset,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={`profile-tab-${option.value}`}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => select(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: theme.touch - space.x1 * 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.round,
              backgroundColor: selected ? layer.fill : pressed ? layer.pressed : layer.inset,
            })}
          >
            {option.glyph(selected ? theme.color.fg : theme.color.muted, theme.type.body.line)}
          </Pressable>
        );
      })}
    </View>
  );
}
