package expo.modules.conversationnotifications

import android.content.Context
import android.os.Bundle
import android.os.Parcel
import android.os.Parcelable
import expo.modules.notifications.notifications.interfaces.NotificationTrigger
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.HandlingDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate

class ConversationNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ConversationPresentationDelegate(context)

  override fun getHandlingDelegate(context: Context): HandlingDelegate =
    ConversationHandlingDelegate(ExpoHandlingDelegate(context))
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

/**
 * The Host sends Android pushes data-only, with the shown title and message inside the data, so the
 * system leaves them to the app (src/push/delivery.ts in packages/core). Expo only presents a
 * background data-only push that has a title or text, so this fills them in from the data first.
 */
class ConversationHandlingDelegate(private val base: HandlingDelegate) : HandlingDelegate by base {
  override fun handleNotification(notification: Notification) {
    base.handleNotification(runCatching { titled(notification) }.getOrNull() ?: notification)
  }

  private fun titled(notification: Notification): Notification? {
    val request = notification.notificationRequest
    val content = request.content
    if (!content.title.isNullOrEmpty() || !content.text.isNullOrEmpty()) return null
    val data = content.body ?: return null
    val title = data.optString("title").ifEmpty { null } ?: return null
    val text = data.optString("message").ifEmpty { null } ?: return null
    val filled = NotificationContent.Builder()
      .setTitle(title)
      .setText(text)
      .setBody(data)
      .setBadgeCount(content.badgeCount ?: data.optInt("badge", -1).takeIf { it >= 0 })
      .setPriority(content.priority)
      .setColor(content.color)
      .setAutoDismiss(content.isAutoDismiss)
      .setSticky(content.isSticky)
      .setCategoryId(content.categoryId ?: data.optString("categoryId").ifEmpty { null })
      .apply {
        useDefaultSound()
        useDefaultVibrationPattern()
        content.group?.let { setGroup(it) }
      }
      .build()
    return Notification(
      NotificationRequest(request.identifier, filled, RequestsTrigger(request.trigger)),
      notification.originDate
    )
  }
}

/**
 * A data-only push names no Android channel the app can read (Expo wraps the data into one JSON
 * field), so Bot notifications are pinned to the "requests" channel the app creates.
 */
class RequestsTrigger(private val base: NotificationTrigger) : NotificationTrigger {
  override fun getNotificationChannel(): String = REQUESTS

  override fun toBundle(): Bundle = base.toBundle()

  override fun describeContents(): Int = 0

  override fun writeToParcel(dest: Parcel, flags: Int) {
    dest.writeParcelable(base, flags)
  }

  companion object {
    const val REQUESTS = "requests"

    @JvmField
    val CREATOR = object : Parcelable.Creator<RequestsTrigger> {
      override fun createFromParcel(parcel: Parcel): RequestsTrigger =
        RequestsTrigger(
          parcel.readParcelable(RequestsTrigger::class.java.classLoader)
            ?: throw IllegalArgumentException("RequestsTrigger needs its base trigger")
        )

      override fun newArray(size: Int) = arrayOfNulls<RequestsTrigger>(size)
    }
  }
}
