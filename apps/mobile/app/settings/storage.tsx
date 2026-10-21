import { Image } from 'expo-image';
import { useMemo } from 'react';

import { useHostSession } from '../../src/host/host-session';
import {
  confirmStorageCleanup,
  loadStorageUsage,
  previewStorageCleanup,
} from '../../src/host/storage';
import { StorageSettings, type StorageSettingsPort } from '../../src/ui/storage-settings';
import { t } from '../../src/ui/strings';

export default function StorageScreen() {
  const { saved, client } = useHostSession();
  const port = useMemo<StorageSettingsPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            usage: () => loadStorageUsage(client),
            preview: (scope) => previewStorageCleanup(client, scope),
            confirm: (preview) => confirmStorageCleanup(client, preview),
            clearImageCache: async () => {
              const cleared = await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
              if (cleared.includes(false)) throw new Error(t.storage.imageCacheFailed);
            },
          },
    [client],
  );
  if (port === undefined) return null;
  return <StorageSettings key={saved?.hostId} port={port} />;
}
