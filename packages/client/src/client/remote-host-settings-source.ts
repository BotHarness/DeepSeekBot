import type { HostClient } from '@botharness/host-client/client';
import * as storage from '@botharness/host-client/storage';
import { loadMemoryActivity, loadUsage } from '@botharness/host-client/usage';
import type { UsagePeriod } from '@botharness/host-client/usage';

export function remoteHostSettingsSource(client: HostClient) {
  return {
    usage: {
      overviewUsage: (period: UsagePeriod, after?: string) => loadUsage(client, period, after),
      overviewMemory: (after?: string) => loadMemoryActivity(client, after),
    },
    storage: {
      usage: () => storage.loadStorageUsage(client),
      previewMedia: (scope: storage.StorageCleanupScope) =>
        storage.previewStorageCleanup(client, scope),
      confirmMedia: (preview: storage.StorageCleanupPreview) =>
        storage.confirmStorageCleanup(client, preview),
      previewMessages: (scope: { before: string; channelIds?: string[] }) =>
        storage.previewStorageMessages(client, scope),
      confirmMessages: (preview: storage.StorageMessagesPreview) =>
        storage.confirmStorageMessages(client, preview),
    },
  };
}
