import { ConnectionProgress } from '../primitives/connection-progress';
import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { titleChipFill } from './header-chrome';
import { barLabelStyle } from './native-header';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, status, connectionLabel].filter(Boolean).join(', ')}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3),
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
      <Text strong numberOfLines={1} style={[{ flexShrink: 1 }, barLabelStyle]}>
        {name}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
    </Pressable>
  );
}
