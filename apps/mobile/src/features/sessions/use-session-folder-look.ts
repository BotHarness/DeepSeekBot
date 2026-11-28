import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { readWorkspaceLook } from '@botharness/host-client/host-sessions';
import type { WorkspaceLook } from '@botharness/host-protocol/host-sessions';

export function useSessionFolderLook(client: HostClient | undefined, path: string | undefined) {
  const target = useMemo(() => ({ client, path }), [client, path]);
  const [loaded, setLoaded] = useState<{
    target: typeof target;
    look: WorkspaceLook | null | 'failed';
  }>();
  useFocusEffect(
    useCallback(() => {
      if (target.client === undefined || target.path === undefined) return;
      let current = true;
      readWorkspaceLook(target.client, target.path).then(
        (look) => current && setLoaded({ target, look }),
        () => current && setLoaded({ target, look: 'failed' }),
      );
      return () => {
        current = false;
      };
    }, [target]),
  );
  return loaded?.target === target ? loaded.look : undefined;
}
