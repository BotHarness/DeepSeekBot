import { View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

export function StatusStrip({ bot }: { bot: RosterBot }) {
  const theme = useDesignTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingHorizontal: space.x5,
        paddingVertical: space.x3,
      }}
    >
      <View
        style={{
          width: space.x3,
          height: space.x3,
          borderRadius: radius.round,
          backgroundColor: theme.color.accent,
        }}
      />
      <Text variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
        {`${bot.displayName} · ${t.state[bot.state]}…`}
      </Text>
    </View>
  );
}
