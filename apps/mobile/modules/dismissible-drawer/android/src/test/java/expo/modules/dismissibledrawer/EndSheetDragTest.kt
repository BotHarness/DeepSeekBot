package expo.modules.dismissibledrawer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EndSheetDragTest {
  @Test fun deliberateLeftDragCanOpenTheSheet() {
    assertTrue(startsEndDrag(-40f, 3f, 8))
  }

  @Test fun rightDragAndVerticalScrollDoNotOpenTheSheet() {
    assertFalse(startsEndDrag(40f, 3f, 8))
    assertFalse(startsEndDrag(-15f, 40f, 8))
    assertFalse(startsEndDrag(-40f, 30f, 8))
  }

  @Test fun replyableMessageRowsKeepTheirSwipeLeft() {
    assertTrue(ownsHorizontalSwipe("horizontal-swipe-owner"))
    assertFalse(ownsHorizontalSwipe(null))
    assertFalse(ownsHorizontalSwipe("chat-profile-swipe"))
  }

  @Test fun smallMovementRetainsTapOwnership() {
    assertFalse(startsEndDrag(-7f, 0f, 8))
    assertFalse(startsEndDrag(-8f, 0f, 8))
  }
}
