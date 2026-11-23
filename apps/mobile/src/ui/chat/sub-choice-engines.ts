import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { HostClient } from '@botharness/host-client/client';
import { loadRoutingGroupEngines } from '@botharness/host-client/model-catalog';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';

export function useEngineOptions(client: HostClient): readonly RoutingGroupEngineOptions[] {
  const [engines, setEngines] = useState<readonly RoutingGroupEngineOptions[]>([]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadRoutingGroupEngines(client).then(
        (options) => {
          if (active) setEngines(options);
        },
        () => undefined,
      );
      return () => {
        active = false;
      };
    }, [client]),
  );
  return engines;
}
