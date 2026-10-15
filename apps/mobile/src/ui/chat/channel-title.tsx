import { Pressable } from 'react-native';

import type { RosterChannel } from '../../host/client';
import { frosted, useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { GroupMark } from './group-mark';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
  onPress,
}: {
  channel: RosterChannel | undefined;
  fallback: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const name = channel?.name ?? fallback;
  const members = channel === undefined ? undefined : t.members(channel.memberCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={members === undefined ? name : `${name}, ${members}`}
      accessibilityHint={t.groupInfoHint}
      disabled={channel === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
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
        backgroundColor: pressed ? theme.layer.raised.pressed : frosted(theme.layer.raised.fill),
      })}
    >
      <GroupMark avatar={channel?.avatar} size={MARK} corner={radius.round} />
      <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      {members === undefined ? null : (
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {members}
        </Text>
      )}
    </Pressable>
  );
}
