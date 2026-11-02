import { View } from 'react-native';

import { radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { badgeCount } from './badge-count';
import { Text } from './text';

export type CountBadgeTone = 'needs-you' | 'unread' | 'muted';

export function CountBadge({
  count,
  tone,
  label,
}: {
  count: number;
  tone: CountBadgeTone;
  label?: string;
}) {
  const theme = useDesignTheme();
  const fill =
    tone === 'needs-you'
      ? theme.color.warning
      : tone === 'muted'
        ? theme.layer.canvas.inset
        : theme.color.accent;
  const ink =
    tone === 'needs-you'
      ? theme.color[theme.scheme === 'dark' ? 'base' : 'fg']
      : tone === 'muted'
        ? theme.color.muted
        : theme.color.onAccent;
  return (
    <View
      accessibilityLabel={label}
      style={{
        minHeight: theme.type.meta.line + space.x3,
        paddingVertical: space.x2,
        minWidth: theme.type.meta.line + space.x3,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.x3,
        borderRadius: radius.sm,
        backgroundColor: fill,
      }}
    >
      <Text
        variant="meta"
        strong
        style={{ color: ink, textAlign: 'center', fontVariant: ['tabular-nums'] }}
      >
        {badgeCount(count)}
      </Text>
    </View>
  );
}
