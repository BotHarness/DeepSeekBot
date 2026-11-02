import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import * as storage from '../../../../apps/mobile/src/host/storage.js';
import { loadMemoryActivity, loadUsage } from '../../../../apps/mobile/src/host/usage.js';
import type { UsagePeriod } from '../../../../apps/mobile/src/host/usage.js';

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
