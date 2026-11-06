import { useHeaderStatus } from './use-header-status';
import { HeaderTitleButton } from './header-title-button';
import { ConnectionProgress } from '../primitives/connection-progress';
import { View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import { barLabelStyle, barLabelProps, headerControlHeight } from './native-header';

const AVATAR = 28;

export function ChatTitle({
  bot,
  fallback,
  connectionLabel,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  connectionLabel?: string | undefined;
  onPress(): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const headerStatus = useHeaderStatus(bot, undefined);
  const name = bot?.displayName ?? fallback;
  const chip = (press: () => void) => (
    <HeaderTitleButton
      testID="bot-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[name, headerStatus.label, connectionLabel].filter(Boolean).join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={press}
      style={({ pressed }) => ({
        flexShrink: 1,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: headerControlHeight(theme),
        paddingLeft: (theme.touch - AVATAR) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        ...titleChipFill(theme, pressed),
      })}
    >
      {bot ? (
        <BotAvatar bot={bot} size={AVATAR} ring={false} />
      ) : (
        <View style={{ width: AVATAR, height: AVATAR }} />
      )}
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
      <ConnectionProgress active={connectionLabel !== undefined} label={connectionLabel} />
    </HeaderTitleButton>
  );
  return chip(onPress);
}
