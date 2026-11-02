import { useLocalSearchParams } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { BotInboxScreen } from '../../../src/ui/chat/bot-inbox-screen';

export default function BotInboxRoute() {
  const { slug, messageId, missing } = useLocalSearchParams<{
    slug: string;
    messageId?: string;
    missing?: string;
  }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return client === undefined ? null : (
    <BotInboxScreen
      key={slug}
      client={client}
      slug={slug}
      botName={bot?.displayName ?? slug}
      messageId={messageId}
      missing={missing === '1'}
    />
  );
}
