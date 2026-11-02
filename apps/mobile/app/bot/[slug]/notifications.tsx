import { useLocalSearchParams } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import ChannelNotificationScreen from '../../../src/ui/shell/channel-notification-screen';

export default function BotNotificationsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  if (bot?.dmChannelId === undefined) return null;
  return <ChannelNotificationScreen channelId={bot.dmChannelId} />;
}
