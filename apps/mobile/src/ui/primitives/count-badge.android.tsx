import { Badge, Host, Text } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { badgeCount } from './badge-count';
import type { CountBadgeTone } from './count-badge';

export type { CountBadgeTone } from './count-badge';

export function MaterialCountBadge({ count, tone }: { count: number; tone: CountBadgeTone }) {
  const roles = useMaterialRoles();
  const colors =
    tone === 'unread'
      ? { containerColor: roles.primary, contentColor: roles.onPrimary }
      : tone === 'muted'
        ? { containerColor: roles.surfaceContainerHighest, contentColor: roles.onSurfaceVariant }
        : {};
  return (
    <Badge {...colors}>
      <Text>{badgeCount(count)}</Text>
    </Badge>
  );
}

export function CountBadge({
  count,
  tone,
}: {
  count: number;
  tone: CountBadgeTone;
  label?: string;
}) {
  const theme = useDesignTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
        <MaterialCountBadge count={count} tone={tone} />
      </Host>
    </View>
  );
}
