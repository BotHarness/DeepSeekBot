import { View } from 'react-native';

import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { botStateTone } from './bot-tone';

const AVATAR = 28;

export function ChatTitle({ bot, fallback }: { bot: RosterBot | undefined; fallback: string }) {
  if (bot === undefined)
    return (
      <Text variant="title" numberOfLines={1}>
        {fallback}
      </Text>
    );
  const status = bot.paused ? t.paused : t.state[bot.state];
  return (
    <View
      accessible
      accessibilityLabel={`${bot.displayName}, ${status}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}
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
    </View>
  );
}
