import { View } from 'react-native';

import type { RosterChannel } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
}: {
  channel: RosterChannel | undefined;
  fallback: string;
}) {
  const theme = useDesignTheme();
  const name = channel?.name ?? fallback;
  const members = channel === undefined ? undefined : t.members(channel.memberCount);
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={members === undefined ? name : `${name}, ${members}`}
      style={{
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        height: theme.touch,
        paddingLeft: (theme.touch - MARK) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: theme.layer.raised.fill,
      }}
    >
      <View
        style={{
          width: MARK,
          height: MARK,
          borderRadius: radius.round,
          backgroundColor: theme.color.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text strong tone="muted">
          #
        </Text>
      </View>
      <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      {members === undefined ? null : (
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {members}
        </Text>
      )}
    </View>
  );
}
