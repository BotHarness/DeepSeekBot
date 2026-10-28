import { useLocalSearchParams } from 'expo-router';
import {
  GroupProfileContent,
  type GroupProfileParams,
} from '../../../src/ui/chat/group-profile-content';

export default function GroupProfileScreen() {
  const params = useLocalSearchParams<GroupProfileParams>();
  return <GroupProfileContent {...params} />;
}
