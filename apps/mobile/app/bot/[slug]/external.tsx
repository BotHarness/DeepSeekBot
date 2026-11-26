import { useLocalSearchParams, useRouter } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../src/host/host-session';
import { SheetNote } from '../../../src/ui/chat/sheet';
import { ExternalContactsScreen } from '../../../src/ui/messaging/external-contacts';
import { useStrings } from '../../../src/ui/strings';

export default function ExternalContactsRoute() {
  const t = useStrings();
  const router = useRouter();
  const { slug, hostId } = useLocalSearchParams<{ slug: string; hostId?: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  if (client === undefined || bot === undefined) return <SheetNote>{t.noBot}</SheetNote>;
  return (
    <ExternalContactsScreen
      key={bot.slug}
      host={client}
      bot={bot}
      onBind={() =>
        router.push({ pathname: '/bot/[slug]/im-bind', params: { slug: bot.slug, hostId } })
      }
      onOpen={(pairing) =>
        router.push({
          pathname: '/bot/[slug]/pairing/[id]',
          params: { slug: bot.slug, hostId, id: pairing.id },
        })
      }
    />
  );
}
