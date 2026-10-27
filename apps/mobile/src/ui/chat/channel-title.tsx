import { ConnectionProgress } from '../primitives/connection-progress';
import { Pressable } from 'react-native';

import type { RosterBot, RosterChannel } from '../../host/client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import { barLabelStyle } from './native-header';
import { GroupMark } from './group-mark';
import { WorkingStatus, workingLabel } from './working-status';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
  connectionLabel,
  working = [],
  onPress,
}: {
  channel: RosterChannel | undefined;
  fallback: string;
  working?: readonly RosterBot[];
  connectionLabel?: string | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const name = channel?.name ?? fallback;
  const members = channel === undefined ? undefined : t.members(channel.memberCount);
  const chip = (press: () => void) => (
    <Pressable
      testID="channel-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        members,
        connectionLabel,
        working.length
          ? `${working.map((bot) => bot.displayName).join(', ')}: ${workingLabel(working)}`
          : undefined,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.groupInfoHint}
      disabled={channel === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flexShrink: 1,
        width: '100%',
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
      <Text strong numberOfLines={1} style={[{ flex: 1, minWidth: 0 }, barLabelStyle]}>
        {name}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
      <WorkingStatus bots={working} />
    </Pressable>
  );
  return chip(onPress);
}
