import { Image } from 'expo-image';
import { useMemo } from 'react';

import { useHostSession } from '../../src/host/host-session';
import {
  autoCleanupEnabled,
  clearHostMedia,
  evictMedia,
  mediaUsage,
  setAutoCleanup,
} from '../../src/host/media-cache';
import { forgetSharedCopies } from '../../src/host/share-attachment';
import {
  confirmStorageCleanup,
  confirmStorageMessages,
  loadStorageUsage,
  previewStorageCleanup,
  previewStorageMessages,
} from '../../src/host/storage';
import { StorageSettings, type StorageSettingsPort } from '../../src/ui/storage-settings';
import { useStrings } from '../../src/ui/strings';

export default function StorageScreen() {
  const t = useStrings();
  const { saved, client } = useHostSession();
  const hostId = saved?.hostId;
  const port = useMemo<StorageSettingsPort | undefined>(
    () =>
      client === undefined
        ? undefined
        : {
            ...(hostId === undefined
              ? {}
              : {
                  phone: {
                    usage: () => mediaUsage(hostId),
                    clearOlder: (days: number) => {
                      const before = mediaUsage(hostId);
                      const files = evictMedia({
                        hostId,
                        olderThan: Date.now() - days * 24 * 60 * 60 * 1000,
                      });
                      return { files, bytes: Math.max(0, before - mediaUsage(hostId)) };
                    },
                    autoCleanup: autoCleanupEnabled,
                    setAutoCleanup,
                  },
                }),
            usage: () => loadStorageUsage(client),
            preview: (scope) => previewStorageCleanup(client, scope),
            confirm: (preview) => confirmStorageCleanup(client, preview),
            previewMessages: (scope) => previewStorageMessages(client, scope),
            confirmMessages: (preview) => confirmStorageMessages(client, preview),
            clearImageCache: async () => {
              if (hostId !== undefined) {
                clearHostMedia(hostId);
                forgetSharedCopies([`${hostId}/`]);
              }
              const cleared = await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
              if (cleared.includes(false)) throw new Error(t.storage.imageCacheFailed);
            },
          },
    [t, client, hostId],
  );
  if (port === undefined) return null;
  return <StorageSettings key={saved?.hostId} port={port} />;
}
