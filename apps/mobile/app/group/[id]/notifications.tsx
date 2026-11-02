import { useLocalSearchParams } from 'expo-router';
import { HostScope } from '../../../src/host/host-scope';

import ChannelNotificationScreen from '../../../src/ui/shell/channel-notification-screen';

export default function GroupNotificationsScreen() {
  const { id, hostId } = useLocalSearchParams<{ id: string; hostId?: string }>();
  if (id === undefined) return null;
  return hostId === undefined ? (
    <ChannelNotificationScreen channelId={id} />
  ) : (
    <HostScope value={hostId}>
      <ChannelNotificationScreen channelId={id} />
    </HostScope>
  );
}
