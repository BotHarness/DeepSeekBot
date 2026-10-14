import { Pressable, View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { botStateTone } from './bot-tone';

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
  if (bot === undefined)
    return (
      <Text variant="title" numberOfLines={1}>
        {fallback}
      </Text>
    );
  const status = bot.paused ? t.paused : t.state[bot.state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bot.displayName}, ${status}`}
      accessibilityHint={t.openProfile}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <BotAvatar bot={bot} size={AVATAR} />
      <View>
        <Text strong numberOfLines={1}>
          {bot.displayName}
        </Text>
        <Text variant="meta" tone={botStateTone(bot)} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </Pressable>
  );
}
