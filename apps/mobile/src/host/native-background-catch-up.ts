import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_INTERVAL_MINUTES,
  CATCH_UP_TASK,
  runBackgroundCatchUp,
} from './background-catch-up';
import { createHostClient, deviceRefusal } from './client';
import { liveConversationKeys } from './host-session';
import { nativeCarrier } from './native-carrier';
import { catchUpInBackground } from './native-conversations';
import { powerConstrained } from './native-power';
import { loadSavedHosts } from './saved-host';

TaskManager.defineTask(CATCH_UP_TASK, async () => {
  const result = await runBackgroundCatchUp({
    hosts: async () => (await loadSavedHosts()).hosts,
    call: (saved, route) => {
      const client = createHostClient({
        ...saved,
        routes: [route],
        carrier: nativeCarrier(),
        timeoutMs: 5000,
      });
      return (method, args) => client.call(method, args);
    },
    refused: (error) => deviceRefusal(error) !== undefined,
    liveKeys: liveConversationKeys,
    sync: catchUpInBackground,
    constrained: powerConstrained,
  });
  return result === 'failed'
    ? BackgroundTask.BackgroundTaskResult.Failed
    : BackgroundTask.BackgroundTaskResult.Success;
});

export function scheduleBackgroundCatchUp(): void {
  void BackgroundTask.registerTaskAsync(CATCH_UP_TASK, {
    minimumInterval: BACKGROUND_INTERVAL_MINUTES,
  }).catch(() => undefined);
}

export function runBackgroundCatchUpNow(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}
