import { Badge, Host, Text } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { badgeCount } from './badge-count';
import type { CountBadgeTone } from './count-badge';

export type { CountBadgeTone } from './count-badge';

function useBadgeColors(tone: CountBadgeTone) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  return tone === 'needs-you'
    ? {
        containerColor: theme.color.warning,
        contentColor: theme.color[theme.scheme === 'dark' ? 'base' : 'fg'],
      }
    : tone === 'unread'
      ? { containerColor: roles.primary, contentColor: roles.onPrimary }
      : { containerColor: roles.surfaceContainerHighest, contentColor: roles.onSurfaceVariant };
}

export function MaterialCountBadge({ count, tone }: { count: number; tone: CountBadgeTone }) {
  return (
    <Badge {...useBadgeColors(tone)}>
      <Text>{badgeCount(count)}</Text>
    </Badge>
  );
}

export function MaterialDotBadge({ tone }: { tone: CountBadgeTone }) {
  return <Badge {...useBadgeColors(tone)} />;
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
