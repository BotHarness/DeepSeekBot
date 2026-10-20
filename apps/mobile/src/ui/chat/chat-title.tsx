import { Pressable } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { barLabelStyle } from './native-header';

const AVATAR = 28;

export function ChatTitle({
  bot,
  fallback,
  onPress,
}: {
  bot: RosterBot | undefined;
  fallback: string;
  onPress(): void;
}) {
  const theme = useDesignTheme();
  const status = bot === undefined ? undefined : bot.paused ? t.paused : t.state[bot.state];
  const name = bot?.displayName ?? fallback;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status === undefined ? name : `${name}, ${status}`}
      accessibilityHint={t.openProfile}
      disabled={bot === undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: Math.max(theme.touch, theme.type.body.line * theme.fontScale + space.x3),
        paddingLeft: bot === undefined ? theme.touch / 2 : (theme.touch - AVATAR) / 2,
        paddingRight: theme.touch / 2,
        borderRadius: radius.round,
        backgroundColor: pressed ? theme.layer.raised.pressed : undefined,
      })}
    >
      {bot === undefined ? null : <BotAvatar bot={bot} size={AVATAR} ring={false} />}
      <Text strong numberOfLines={1} style={[{ flexShrink: 1 }, barLabelStyle]}>
        {name}
      </Text>
    </Pressable>
  );
}
