import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { dismissResolved, parsePushResolved } from './push-resolve';

export const PUSH_RESOLVE_TASK = 'deepseekbot-push-resolve';

const port = {
  async presented() {
    return (await Notifications.getPresentedNotificationsAsync()).map((notification) => ({
      id: notification.request.identifier,
      data: notification.request.content.data,
    }));
  },
  async dismiss(id: string) {
    await Notifications.dismissNotificationAsync(id);
  },
};

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  PUSH_RESOLVE_TASK,
  async ({ data, error }) => {
    if (error !== null || data === undefined) return;
    const resolved = parsePushResolved(data);
    if (resolved !== undefined) await dismissResolved(port, resolved).catch(() => undefined);
  },
);

let registered: Promise<unknown> | undefined;

export function registerPushResolveTask(): void {
  registered ??= Notifications.registerTaskAsync(PUSH_RESOLVE_TASK).catch(() => {
    registered = undefined;
  });
}
