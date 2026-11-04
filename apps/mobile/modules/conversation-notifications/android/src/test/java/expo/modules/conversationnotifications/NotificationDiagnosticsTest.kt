package expo.modules.conversationnotifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class NotificationDiagnosticsTest {
  private lateinit var context: Context
  private lateinit var manager: NotificationManager

  @Before fun setup() {
    context = RuntimeEnvironment.getApplication()
    manager = context.getSystemService(NotificationManager::class.java)
    context.getSharedPreferences("notification-setup", Context.MODE_PRIVATE).edit().clear().commit()
  }

  @Test fun readsWithoutCreatingChannelsOrChangingConnectionPreference() {
    val before = ConnectionService.state(context)
    val facts = NotificationDiagnostics.read(context)
    assertEquals("missing", facts["requests"])
    assertEquals("missing", facts["connection"])
    assertEquals(before, ConnectionService.state(context))
    NotificationDiagnostics.dismissSetup(context)
    assertEquals(true, NotificationDiagnostics.read(context)["setupDismissed"])
    assertEquals(before, ConnectionService.state(context))
  }

  @Test fun blockedPermissionRetainsModeAndDoesNotPost() {
    context.getSharedPreferences("connection-mode", Context.MODE_PRIVATE).edit().putBoolean("enabled", true).commit()
    shadowOf(manager).setNotificationsEnabled(false)
    assertEquals("permission-blocked", NotificationDiagnostics.test(context, "en"))
    assertEquals(false, NotificationDiagnostics.read(context)["permission"])
    assertEquals(true, ConnectionService.state(context)["enabled"])
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test fun blockedChannelIsNotResetByTest() {
    manager.createNotificationChannel(NotificationChannel("requests", "Requests", NotificationManager.IMPORTANCE_NONE))
    assertEquals("channel-blocked", NotificationDiagnostics.test(context, "en"))
    assertEquals("blocked", NotificationDiagnostics.read(context)["requests"])
    assertTrue(manager.activeNotifications.isEmpty())
  }

  @Test fun localTestIsBoundedPrivateAndDoesNotClaimVisible() {
    assertEquals("posted", NotificationDiagnostics.test(context, "zh"))
    assertEquals("posted", NotificationDiagnostics.test(context, "zh"))
    val posted = manager.activeNotifications.single().notification
    assertEquals("requests", posted.channelId)
    assertEquals(Notification.VISIBILITY_PRIVATE, posted.visibility)
    assertEquals(60000L, posted.timeoutAfter)
    assertEquals("本机通知测试", posted.extras.getString(Notification.EXTRA_TITLE))
    assertFalse(posted.extras.containsKey("hostId"))
  }
}
