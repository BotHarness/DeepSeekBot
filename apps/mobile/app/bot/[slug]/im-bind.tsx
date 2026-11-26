import { useLocalSearchParams, useRouter } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { SheetNote } from '../../../src/ui/chat/sheet';
import { BotImBindScreen } from '../../../src/ui/messaging/im-apps';
import { useStrings } from '../../../src/ui/strings';

export default function BotImBindRoute() {
  const t = useStrings();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bots = useHostSnapshot(client).roster?.bots;
  const bot = bots?.find((entry) => entry.slug === slug);
  if (client === undefined || bot === undefined) return <SheetNote>{t.noBot}</SheetNote>;
  return (
    <BotImBindScreen
      key={bot.slug}
      host={client}
      bot={bot}
      bots={bots}
      onDone={() => router.back()}
    />
  );
}
