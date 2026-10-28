import { useLocalSearchParams } from 'expo-router';
import { BotProfileContent, type BotProfileParams } from '../../../src/ui/chat/bot-profile-content';

export default function BotProfileScreen() {
  const params = useLocalSearchParams<BotProfileParams>();
  return <BotProfileContent {...params} />;
}
