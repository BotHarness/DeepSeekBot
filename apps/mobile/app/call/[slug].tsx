import { useLocalSearchParams } from 'expo-router';

import { HostScope } from '../../src/host/host-scope';
import { CallScreen } from '../../src/ui/chat/call-screen';

export default function CallRoute() {
  const { slug, hostId, script } = useLocalSearchParams<{
    slug: string;
    hostId?: string;
    script?: string;
  }>();
  return (
    <HostScope value={hostId}>
      <CallScreen slug={slug} hostId={hostId} script={script} />
    </HostScope>
  );
}
