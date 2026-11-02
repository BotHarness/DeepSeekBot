import { Stack, useLocalSearchParams } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { BotAccessScreen } from '../../../src/ui/chat/bot-access-screen';
import { SheetNote } from '../../../src/ui/chat/sheet';
import { useStrings } from '../../../src/ui/strings';

export default function BotAccessRoute() {
  const t = useStrings();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  return (
    <>
      <Stack.Screen options={{ title: t.profilePermissions.access }} />
      {client === undefined || bot === undefined ? (
        <SheetNote>{t.noBot}</SheetNote>
      ) : (
        <BotAccessScreen key={bot.slug} client={client} bot={bot} />
      )}
    </>
  );
}
