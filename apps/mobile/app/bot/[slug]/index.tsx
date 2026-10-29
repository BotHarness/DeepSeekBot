import { useLocalSearchParams } from 'expo-router';
import { BotProfileScreen, type BotProfileParams } from '../../../src/ui/chat/bot-profile-screen';

export default function BotProfileRoute() {
  const params = useLocalSearchParams<BotProfileParams>();
  return <BotProfileScreen {...params} />;
}
