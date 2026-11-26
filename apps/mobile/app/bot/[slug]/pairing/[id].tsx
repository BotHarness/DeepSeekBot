import { useLocalSearchParams } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../../../src/host/host-session';
import { SheetNote } from '../../../../src/ui/chat/sheet';
import { PairingScreen } from '../../../../src/ui/messaging/external-contacts';
import { useStrings } from '../../../../src/ui/strings';

export default function PairingRoute() {
  const t = useStrings();
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { client } = useHostSession();
  const bot = useHostSnapshot(client).roster?.bots.find((entry) => entry.slug === slug);
  if (client === undefined || bot === undefined) return <SheetNote>{t.noBot}</SheetNote>;
  return <PairingScreen key={`${bot.slug}:${id}`} host={client} bot={bot} id={id} />;
}
