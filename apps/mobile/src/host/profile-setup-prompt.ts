import type { HostClient } from '@botharness/host-client/client';
import { router, useIsFocused } from 'expo-router';
import type { ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { afterSheetsClose } from '../ui/primitives/sheet-closing';
import { useHostSession } from './host-session';
import { useHumanIdentity } from './human-profile';

export const PROFILE_SETUP_SETTLE_MS = 600;

const prompted = new WeakSet<HostClient>();

export function useProfileSetupPrompt() {
  const { client } = useHostSession();
  const human = useHumanIdentity(client);
  const shown = useIsFocused();
  const pending = human.identity?.profileSetup === 'pending';
  const prompt = useMounted<ViewInstance>(() => {
    if (client === undefined || !pending || !shown || prompted.has(client)) return;
    let stopWaiting = () => {};
    const timer = setTimeout(() => {
      stopWaiting = afterSheetsClose(() => {
        prompted.add(client);
        router.push('/settings/profile-setup');
      });
    }, PROFILE_SETUP_SETTLE_MS);
    return () => {
      clearTimeout(timer);
      stopWaiting();
    };
  }, [client, pending, shown]);
  return { load: human.mount, prompt };
}
