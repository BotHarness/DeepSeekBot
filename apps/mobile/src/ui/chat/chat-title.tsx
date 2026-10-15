import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { frosted, useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { botDotTone } from './bot-tone';

const AVATAR = 28;
const DOT = space.x3;

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
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        height: theme.touch,
        paddingLeft: bot === undefined ? theme.touch / 2 : (theme.touch - AVATAR) / 2,
        paddingRight: bot === undefined ? theme.touch / 2 : (theme.touch - DOT) / 2,
        borderRadius: radius.round,
        borderWidth: edge.hairline,
        borderColor: theme.layer.raised.edge,
        backgroundColor: pressed ? theme.layer.raised.pressed : frosted(theme.layer.raised.fill),
      })}
    >
      {bot === undefined ? null : <BotAvatar bot={bot} size={AVATAR} ring={false} />}
      <Text strong numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </Text>
      {bot === undefined ? null : (
        <View
          testID="chat-title-state"
          style={{
            width: DOT,
            height: DOT,
            borderRadius: radius.round,
            backgroundColor: theme.color[botDotTone(bot)],
          }}
        />
      )}
    </Pressable>
  );
}
