import { useLocalSearchParams } from 'expo-router';
import { ChannelFilesScreen } from '../src/ui/chat/channel-files-screen';

export default function FilesScreen() {
  const params = useLocalSearchParams<{ channelId: string; hostId: string; botSlug?: string }>();
  return <ChannelFilesScreen {...params} />;
}
