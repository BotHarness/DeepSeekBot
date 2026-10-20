package expo.modules.conversationnotifications

import android.app.Person
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.os.Build
import expo.modules.notifications.notifications.model.Notification
import java.io.File
import java.util.Locale

/**
 * Re-styles a Bot notification as a conversation: the Bot is the sender with its avatar, and a
 * group Channel is the conversation with the Channel avatar. The avatars are PNGs the app caches
 * under files/notification-avatars/<host>/ (see src/host/notification-avatars.ts); a missing file
 * falls back to the system monogram.
 */
object ConversationStyle {
  private const val AVATARS = "notification-avatars"

  fun safe(value: String): String = value.replace(Regex("[^A-Za-z0-9._-]"), "_")

  private fun icon(context: Context, host: String, key: String): Icon? {
    val file = File(File(File(context.filesDir, AVATARS), safe(host)), "${safe(key)}.png")
    if (!file.isFile) return null
    val bitmap = BitmapFactory.decodeFile(file.path) ?: return null
    return Icon.createWithBitmap(bitmap)
  }

  fun apply(
    context: Context,
    notification: Notification,
    built: android.app.Notification
  ): android.app.Notification? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
    val data = notification.notificationRequest.content.body ?: return null
    val host = data.optString("hostId")
    val slug = data.optString("botSlug")
    val sender = data.optString("sender")
    val text = data.optString("text")
    if (host.isEmpty() || slug.isEmpty() || sender.isEmpty() || text.isEmpty()) return null
    val channel = data.optString("channelId").ifEmpty { null }
    val group = data.optString("group").ifEmpty { null }

    val botIcon = icon(context, host, "bot-$slug")
    val groupIcon = if (group != null && channel != null) icon(context, host, "channel-$channel") else null
    val bot = Person.Builder()
      .setKey("bot:$host:$slug")
      .setName(sender)
      .setBot(true)
      .apply { botIcon?.let { setIcon(it) } }
      .build()
    val me = Person.Builder()
      .setName(if (Locale.getDefault().language == "zh") "我" else "You")
      .build()
    val style = android.app.Notification.MessagingStyle(me)
      .addMessage(android.app.Notification.MessagingStyle.Message(text, notification.originDate.time, bot))
    if (group != null) {
      style.conversationTitle = "#$group"
      style.isGroupConversation = true
    }

    val builder = android.app.Notification.Builder.recoverBuilder(context, built)
      .setStyle(style)
      .setCategory(android.app.Notification.CATEGORY_MESSAGE)
    groupIcon?.let { builder.setLargeIcon(it) }
    if (channel != null) {
      val id = "conversation:${safe(host)}:${safe(channel)}"
      if (publishShortcut(context, id, group?.let { "#$it" } ?: sender, groupIcon ?: botIcon))
        builder.setShortcutId(id)
    }
    return builder.build()
  }

  private fun publishShortcut(
    context: Context,
    id: String,
    label: String,
    icon: Icon?
  ): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
    launch.action = Intent.ACTION_VIEW
    val shortcut = ShortcutInfo.Builder(context, id)
      .setShortLabel(label)
      .setLongLived(true)
      .setIntent(launch)
      .setCategories(setOf(ShortcutInfo.SHORTCUT_CATEGORY_CONVERSATION))
      .apply { icon?.let { setIcon(it) } }
      .build()
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return false
    return runCatching { manager.pushDynamicShortcut(shortcut) }.isSuccess
  }
}
