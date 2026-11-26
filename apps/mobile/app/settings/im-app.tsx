import { useLocalSearchParams } from 'expo-router';

import { useHostSession, useHostSnapshot } from '../../src/host/host-session';
import { ImAppScreen } from '../../src/ui/messaging/im-apps';

export default function ImAppRoute() {
  const { providerId, ref } = useLocalSearchParams<{ providerId: string; ref: string }>();
  const { saved, client } = useHostSession();
  const bots = useHostSnapshot(client).roster?.bots;
  if (client === undefined) return null;
  return (
    <ImAppScreen
      key={`${saved?.hostId}:${providerId}:${ref}`}
      host={client}
      bots={bots}
      providerId={providerId}
      appRef={ref}
    />
  );
}
