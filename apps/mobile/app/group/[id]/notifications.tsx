import { useLocalSearchParams } from 'expo-router';

import ChannelNotificationScreen from '../../../src/ui/shell/channel-notification-screen';

export default function GroupNotificationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id === undefined) return null;
  return <ChannelNotificationScreen channelId={id} />;
}
