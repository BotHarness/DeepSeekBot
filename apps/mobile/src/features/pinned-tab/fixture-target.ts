import { useGlobalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useStrings } from '../../ui/strings';
import type { PinnedTarget } from './prototype-model';

export function usePinnedFixtureTarget(): PinnedTarget {
  const t = useStrings();
  const params = useGlobalSearchParams<{ target?: string }>();
  const [channel] = useState(params.target === 'channel');
  return useMemo<PinnedTarget>(
    () =>
      channel
        ? { kind: 'channel', name: t.pinnedTabFixture.channelName, unread: 3 }
        : { kind: 'bot', slug: 'fixture-steward', name: t.pinnedTabFixture.stewardName, unread: 0 },
    [channel, t],
  );
}
