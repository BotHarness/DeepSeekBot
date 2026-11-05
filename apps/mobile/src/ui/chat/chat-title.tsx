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
import { barLabelStyle, barLabelProps } from './native-header';
import { botBusy } from './bot-tone';
import { stepLabel } from './bot-steps';
import { runningSessions } from '../../host/session-stop';
import { SessionCountChip } from './session-count-chip';

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
  const status = bot === undefined ? undefined : bot.paused ? t.paused : t.state[bot.state];
  const name = bot?.displayName ?? fallback;
  const activity =
    bot !== undefined && botBusy(bot) ? stepLabel(bot.activity, bot.state) : undefined;
  const sessions = runningSessions(bot).length;
  const chip = (press: () => void) => (
    <HeaderTitleButton
      testID="bot-details-chip"
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        activity ?? status,
        sessions > 0 ? t.sessionCount(sessions) : undefined,
        connectionLabel,
      ]
        .filter(Boolean)
        .join(', ')}
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
        minHeight: Math.max(
          theme.touch,
          theme.type.body.line *
            Math.min(theme.fontScale, barLabelProps.maxFontSizeMultiplier ?? Infinity) +
            space.x3,
        ),
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
      <Text
        {...barLabelProps}
        strong
        numberOfLines={1}
        style={[{ flex: 1, minWidth: 0 }, barLabelStyle]}
      >
        {activity ?? name}
      </Text>
      <SessionCountChip count={sessions} />
      <ConnectionProgress active={connectionLabel !== undefined} label={connectionLabel} />
    </HeaderTitleButton>
  );
  return chip(onPress);
}
