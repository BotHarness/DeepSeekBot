import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { ImAppsScreen } from '../../src/ui/messaging/im-apps';

export default function ImAppsRoute() {
  const { saved, client } = useHostSession();
  const bots = useHostSnapshot(client).roster?.bots;
  if (client === undefined) return null;
  return <ImAppsScreen key={saved?.hostId} host={client} bots={bots} />;
}
