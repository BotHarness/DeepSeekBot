import { ConnectionProgress } from '../primitives/connection-progress';
import { Pressable } from 'react-native';

import type { RosterChannel } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import { barLabelStyle } from './native-header';
import { GroupMark } from './group-mark';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
  connectionLabel,
  onPress,
}: {
  channel: RosterChannel | undefined;
  fallback: string;
  connectionLabel?: string | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const name = channel?.name ?? fallback;
  const members = channel === undefined ? undefined : t.members(channel.memberCount);
  return (
    <Pressable
      testID="channel-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[name, members, connectionLabel].filter(Boolean).join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.groupInfoHint}
      disabled={channel === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3),
        paddingLeft: (theme.touch - MARK) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
      })}
    >
      <GroupMark avatar={channel?.avatar} size={MARK} corner={radius.round} />
      <Text strong numberOfLines={1} style={[{ flexShrink: 1 }, barLabelStyle]}>
        {name}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
    </Pressable>
  );
}
