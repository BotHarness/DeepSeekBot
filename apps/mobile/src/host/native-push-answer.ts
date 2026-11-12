import * as Notifications from 'expo-notifications';

import { t } from '../ui/strings';
import { claimResponse } from './native-notifications';
import { decideOverRoute } from './native-push-decide';
import { answerInPlace } from './push-answer';
import { loadSavedHosts } from './saved-host';

export async function answerResponse(response: Notifications.NotificationResponse): Promise<void> {
  const { identifier, content } = response.notification.request;
  await answerInPlace(
    { id: identifier, action: response.actionIdentifier, title: content.title, data: content.data },
    {
      claim: claimResponse,
      hosts: async () => (await loadSavedHosts()).hosts,
      decide: decideOverRoute,
      dismiss: (id) => Notifications.dismissNotificationAsync(id),
      retry: async (title, data) => {
        await Notifications.scheduleNotificationAsync({
          content: { title, body: t.notificationDecisionFailed, data },
          trigger: null,
        });
      },
    },
  );
}
