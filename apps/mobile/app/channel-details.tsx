import { useLocalSearchParams } from 'expo-router';
import { ChannelDetailsScreen } from '../src/ui/chat/channel-details-screen';

export default function ChannelDetails() {
  const params = useLocalSearchParams<{ channelId: string; hostId: string }>();
  return <ChannelDetailsScreen {...params} />;
}
