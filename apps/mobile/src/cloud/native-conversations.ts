import { sourceDrafts } from '../host/native-source-drafts';
import { cloudViewScope } from './workspace-directory';
import { useSyncExternalStore } from 'react';
import { cloudClient, useCloudSnapshot } from './native';
import { createCloudConversations } from './conversations';
export const cloudConversations = createCloudConversations(cloudClient);
cloudClient.subscribe(() => {
  const snapshot = cloudClient.getSnapshot();
  cloudConversations.enroll(snapshot.rows);
  if (snapshot.ready)
    void sourceDrafts.ready.then(() => {
      const scopes = new Set(
        cloudClient
          .getSnapshot()
          .rows.filter((r) => r.hasSession)
          .map(cloudViewScope),
      );
      sourceDrafts.removeWhere((key) => {
        try {
          const parts = JSON.parse(key);
          return parts[0] === 'cloud' && !scopes.has(parts[1]);
        } catch {
          return false;
        }
      });
    });
});
export function useCloudConversations() {
  useCloudSnapshot();
  return useSyncExternalStore(cloudConversations.subscribe, cloudConversations.getSnapshot);
}
