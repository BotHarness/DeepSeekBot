import { View } from 'react-native';
import type { RosterBot } from '../../host/client';
import { BotAvatar } from '../bot-avatar';
import { space } from '../design/tokens';

export function HeaderBotStack({ bots, size }: { bots: readonly RosterBot[]; size: number }) {
  return (
    <View
      testID="header-bot-stack"
      accessible={false}
      style={{ flexDirection: 'row', flexShrink: 0 }}
    >
      {bots.slice(0, 3).map((bot, index) => (
        <View key={bot.slug} style={{ marginLeft: index === 0 ? 0 : -space.x2 }}>
          <BotAvatar bot={bot} size={size} ring={false} />
        </View>
      ))}
    </View>
  );
}
