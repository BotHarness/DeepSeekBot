package expo.modules.conversationnotifications

import android.app.Notification
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class ConnectionNoticeTest {
  @Test fun unavailableDoesNotPretendZeroBots() {
    assertEquals("Hosts connected 0/2 · Status unavailable", ConnectionSummary(2).text(false))
    assertEquals("电脑连接 1/2 · 状态暂不可用", ConnectionSummary(2, 1).text(true))
  }

  @Test fun partialCountsKeepConnectionAndSynchronizationSeparate() {
    val summary = ConnectionSummary(3, 2, 1, 4, 2)
    assertEquals("Active Bots 4 · Needs you Bots 2\nHosts connected 2/3 · Incomplete (synced 1/3)", summary.text(false))
    assertTrue(summary.text(true).contains("统计不完整（已同步 1/3）"))
    assertFalse(ConnectionSummary(2, 2, 2).text(false).contains("Incomplete"))
  }

  @Test fun updatesAreSilentOngoingWithOnlyTheExistingStopAction() {
    val context = RuntimeEnvironment.getApplication()
    val notification = ConnectionNotice.build(context, ConnectionSummary(2, 2, 2, 1, 1), "en")
    assertTrue(notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
    assertTrue(notification.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0)
    assertNull(notification.sound)
    assertNull(notification.vibrate)
    assertEquals(0, notification.defaults and (Notification.DEFAULT_SOUND or Notification.DEFAULT_VIBRATE))
    assertEquals(1, notification.actions.size)
    val action = notification.actions[0]
    assertEquals("Stop", action.title.toString())
    assertEquals(ConnectionService.STOP, Shadows.shadowOf(action.actionIntent).savedIntent.action)
    assertEquals(notification.extras.getCharSequence(Notification.EXTRA_TEXT), notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT))
  }
}
