import { useHeaderStatus } from './use-header-status';
import { HeaderBotStack } from './header-bot-stack';
import { View } from 'react-native';
import { HeaderTitleButton } from './header-title-button';
import { ConnectionProgress } from '../primitives/connection-progress';

import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import {
  barLabelStyle,
  barLabelProps,
  headerContentScale,
  headerControlHeight,
  glassHeader,
} from './native-header';
import { GroupMark } from './group-mark';
import { humanInitial } from '../shell/human-avatar-initial';

const MARK = 28;

export function ChannelTitle({
  channel,
  fallback,
  connectionLabel,
  bots = [],
  sessions = 0,
  person = false,
  onPress,
}: {
  channel: RosterChannel | undefined;
  person?: boolean;
  fallback: string;
  bots?: readonly RosterBot[];
  sessions?: number;
  connectionLabel?: string | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const contentScale = glassHeader ? headerContentScale(theme) : 1;
  const avatarSize = MARK * contentScale;
  const headerStatus = useHeaderStatus(undefined, channel, bots);
  const name = channel?.name ?? fallback;
  const members = channel === undefined || person ? undefined : t.members(channel.memberCount);
  const chip = (press: () => void) => (
    <HeaderTitleButton
      kind="button"
      testID="channel-details-chip"
      accessibilityLabel={[
        name,
        members,
        connectionLabel,
        headerStatus.label,
        headerStatus.bots.map((bot) => bot.displayName).join(', '),
        sessions > 0 ? t.sessionCount(sessions) : undefined,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      {...(person ? {} : { accessibilityHint: t.groupInfoHint })}
      disabled={channel === undefined || person}
      onPress={press}
      style={({ pressed }) => ({
        flexShrink: 1,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: headerControlHeight(theme),
        paddingLeft: ((glassHeader ? headerControlHeight(theme) : theme.touch) - avatarSize) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
      })}
    >
      <GroupMark
        avatar={person ? undefined : channel?.avatar}
        {...(person ? { initial: humanInitial(name) ?? '#' } : {})}
        size={avatarSize}
        labelScale={contentScale}
        corner={radius.round}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          {...barLabelProps}
          strong
          numberOfLines={1}
          ellipsizeMode="tail"
          style={barLabelStyle}
        >
          {name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
          <HeaderBotStack bots={headerStatus.bots} size={theme.type.meta.line * contentScale} />
          <Text
            {...barLabelProps}
            variant="meta"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, minWidth: 0 }}
          >
            {connectionLabel ?? headerStatus.label}
          </Text>
        </View>
      </View>
      <ConnectionProgress active={connectionLabel !== undefined} />
    </HeaderTitleButton>
  );
  return chip(onPress);
}
