import { Pressable, View } from 'react-native';

import type { ColorRole } from '../design/resolve-theme';
import { useDesignTheme } from '../design/theme';
import { radius, space, statusChip } from '../design/tokens';
import { DrawerMaterial } from './drawer-material';
import { LoadingIndicator } from './loading-indicator';
import { Text } from './text';

export function StatusChip({
  label,
  tone = 'warning',
  busy = false,
  action,
  testID,
}: {
  label: string;
  tone?: Extract<ColorRole, 'warning' | 'danger' | 'muted'>;
  busy?: boolean;
  action?: { label: string; onPress(): void; testID?: string } | undefined;
  testID?: string;
}) {
  const theme = useDesignTheme();
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'center',
        maxWidth: '100%',
        minHeight: statusChip.height,
        borderRadius: radius.round,
        paddingLeft: space.x4,
        paddingRight: action === undefined ? space.x4 : space.x2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
      }}
    >
      <DrawerMaterial />
      {busy ? (
        <LoadingIndicator size="control" color={theme.color.fg} />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            width: statusChip.dot,
            height: statusChip.dot,
            borderRadius: radius.round,
            backgroundColor: theme.color[tone],
          }}
        />
      )}
      <Text variant="meta" style={{ flexShrink: 1, paddingVertical: space.x2 }}>
        {label}
      </Text>
      {action === undefined ? null : (
        <Pressable
          testID={action.testID}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={space.x3}
          style={{
            minHeight: statusChip.height,
            justifyContent: 'center',
            paddingHorizontal: space.x3,
          }}
        >
          <Text variant="meta" tone="accent" strong>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
