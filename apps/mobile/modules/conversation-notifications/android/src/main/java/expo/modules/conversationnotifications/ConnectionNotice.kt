package expo.modules.conversationnotifications

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

data class ConnectionSummary(
  val hosts: Int = 0,
  val connected: Int = 0,
  val synced: Int = 0,
  val active: Int = 0,
  val needsYou: Int = 0
) {
  init {
    require(hosts >= 0 && connected in 0..hosts && synced in 0..connected)
    require(active >= 0 && needsYou >= 0)
    require(synced > 0 || (active == 0 && needsYou == 0))
  }

  fun text(zh: Boolean): String {
    val connections = if (zh) "电脑连接 $connected/$hosts" else "Hosts connected $connected/$hosts"
    if (synced == 0) return if (zh) "$connections · 状态暂不可用" else "$connections · Status unavailable"
    val counts = if (zh) "运行中 Bot $active · 需要你处理的 Bot $needsYou" else "Active Bots $active · Needs you Bots $needsYou"
    val partial = if (synced < hosts) {
      if (zh) " · 统计不完整（已同步 $synced/$hosts）" else " · Incomplete (synced $synced/$hosts)"
    } else ""
    return "$counts\n$connections$partial"
  }
}

object ConnectionNotice {
  fun build(context: Context, summary: ConnectionSummary, language: String): Notification {
    val zh = language == "zh"
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val text = summary.text(zh)
    return NotificationCompat.Builder(context, ConnectionService.CHANNEL)
      .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle(if (zh) "保持连接" else "Keep connected")
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .apply {
        if (launch != null) setContentIntent(PendingIntent.getActivity(
          context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ))
      }
      .addAction(0, if (zh) "停止" else "Stop", PendingIntent.getService(
        context, 0, Intent(context, ConnectionService::class.java).setAction(ConnectionService.STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ))
      .build()
  }
}
