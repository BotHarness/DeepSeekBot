import type { ReactNode } from 'react';
import { View, type ColorValue } from 'react-native';
import { Text } from '../primitives/text';
import { badgeCount } from '../primitives/badge-count';

export function NavigationIcon({
  children,
  color,
  count = 0,
  countVisible = false,
}: {
  children: ReactNode;
  focused: boolean;
  color: ColorValue;
  count?: number;
  countVisible?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {countVisible && count > 0 ? (
        <Text variant="title" strong style={{ color, fontVariant: ['tabular-nums'] }}>
          {badgeCount(count)}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
