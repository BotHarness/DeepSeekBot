package expo.modules.dismissibledrawer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DrawerModelTest {
  @Test
  fun capsThePanelAtTheMaterialMaximumAndKeepsAChatsGutter() {
    assertEquals(304f, panelWidthDp(360f))
    assertEquals(356f, panelWidthDp(412f))
    assertEquals(360f, panelWidthDp(915f))
    assertEquals(0f, panelWidthDp(40f))
  }

  @Test
  fun movesOnlyWhenJavaScriptAsksForTheOtherSide() {
    assertEquals(DrawerCommand.None, drawerCommand(requested = true, targetOpen = true))
    assertEquals(DrawerCommand.None, drawerCommand(requested = false, targetOpen = false))
    assertEquals(DrawerCommand.Open, drawerCommand(requested = true, targetOpen = false))
    assertEquals(DrawerCommand.Close, drawerCommand(requested = false, targetOpen = true))
  }

  @Test
  fun reportsASettledValueOnce() {
    assertEquals(true, settledReport(settledOpen = true, lastReported = false))
    assertEquals(false, settledReport(settledOpen = false, lastReported = true))
    assertNull(settledReport(settledOpen = true, lastReported = true))
  }

  @Test
  fun mapsTheOffsetToOpenProgress() {
    assertEquals(0f, openProgress(-300f, 300f))
    assertEquals(0.5f, openProgress(-150f, 300f))
    assertEquals(1f, openProgress(0f, 300f))
    assertEquals(1f, openProgress(20f, 300f))
    assertEquals(0f, openProgress(Float.NaN, 300f))
    assertEquals(0f, openProgress(-10f, 0f))
  }

  @Test
  fun treatsOnlyRealOffsetChangesAsADrag() {
    assertTrue(movedUnderFinger(-300f, -290f))
    assertFalse(movedUnderFinger(-300f, -300.2f))
    assertFalse(movedUnderFinger(Float.NaN, -290f))
    assertFalse(movedUnderFinger(-300f, Float.NaN))
  }
}
