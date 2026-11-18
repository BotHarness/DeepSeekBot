import type { HostClient } from '@botharness/host-client/client';
import { router } from 'expo-router';
import type { ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { useHostSession } from './host-session';
import { useHumanIdentity } from './human-profile';

const prompted = new WeakSet<HostClient>();

export function useProfileSetupPrompt() {
  const { client } = useHostSession();
  const human = useHumanIdentity(client);
  const pending = human.identity?.profileSetup === 'pending';
  const prompt = useMounted<ViewInstance>(() => {
    if (client === undefined || !pending || prompted.has(client)) return;
    prompted.add(client);
    router.push('/settings/profile-setup');
  }, [client, pending]);
  return { load: human.mount, prompt };
}
