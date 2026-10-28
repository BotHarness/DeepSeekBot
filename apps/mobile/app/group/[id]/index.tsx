import { useLocalSearchParams } from 'expo-router';
import { GroupProfileScreen } from '../../../src/ui/chat/group-profile-screen';

export default function GroupProfileRoute() {
  const params = useLocalSearchParams<{ id: string; hostId?: string }>();
  return <GroupProfileScreen {...params} />;
}
