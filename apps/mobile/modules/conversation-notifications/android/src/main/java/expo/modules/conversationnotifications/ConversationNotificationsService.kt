package expo.modules.conversationnotifications

import android.content.Context
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate

class ConversationNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ConversationPresentationDelegate(context)
}

class ConversationPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(
    notification: Notification,
    notificationBehavior: NotificationBehaviorRecord?
  ): android.app.Notification {
    val built = super.createNotification(notification, notificationBehavior)
    return runCatching { ConversationStyle.apply(context, notification, built) }.getOrNull() ?: built
  }
}
