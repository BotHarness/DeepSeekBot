import XCTest
import UIKit
@testable import LatestAnchor

@MainActor
final class LatestAnchorTests: XCTestCase {
  func testLatestOffsetKeepsTheLastRowAboveTheBottomInset() {
    let inset = UIEdgeInsets(top: 100, left: 0, bottom: 80, right: 0)
    XCTAssertEqual(latestOffset(content: 2000, viewport: 800, inset: inset), 1280)
    XCTAssertEqual(latestOffset(content: 300, viewport: 800, inset: inset), -100)
  }

  func testSpringGlidesToTheTargetWithoutOvershoot() {
    var position: CGFloat = 0
    var velocity: CGFloat = 0
    var previous = position
    for _ in 0..<60 {
      let step = latestStep(
        position: position, velocity: velocity, target: 120, omega: latestStiffness, dt: 1.0 / 60)
      position = step.position
      velocity = step.velocity
      XCTAssertGreaterThanOrEqual(position, previous)
      XCTAssertLessThanOrEqual(position, 120.0001)
      previous = position
    }
    XCTAssertEqual(position, 120, accuracy: 0.5)
  }

  func testRetargetingMidGlideKeepsVelocityContinuous() {
    let first = latestStep(position: 0, velocity: 0, target: 100, omega: latestStiffness, dt: 1.0 / 60)
    let second = latestStep(
      position: first.position, velocity: first.velocity, target: 160, omega: latestStiffness,
      dt: 1.0 / 60)
    XCTAssertGreaterThan(second.velocity, first.velocity)
  }

  func testGrowthWhileFollowingStartsAGlide() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
    let scroll = UIScrollView(frame: window.bounds)
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.contentSize = CGSize(width: 300, height: 1000)
    scroll.contentOffset.y = 400
    window.addSubview(scroll)
    let anchor = LatestAnchorView()
    scroll.addSubview(anchor)
    scroll.contentSize = CGSize(width: 300, height: 1100)
    XCTAssertTrue(anchor.gliding)
    anchor.stop()
  }

  func testReducedMotionSnapsToTheLatestRow() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
    let scroll = UIScrollView(frame: window.bounds)
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.contentSize = CGSize(width: 300, height: 1000)
    scroll.contentOffset.y = 400
    window.addSubview(scroll)
    let anchor = LatestAnchorView()
    anchor.animated = false
    scroll.addSubview(anchor)
    scroll.contentSize = CGSize(width: 300, height: 1100)
    XCTAssertFalse(anchor.gliding)
    XCTAssertEqual(scroll.contentOffset.y, 500)
  }

  func testHoldingStopsFollowing() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
    let scroll = UIScrollView(frame: window.bounds)
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.contentSize = CGSize(width: 300, height: 1000)
    scroll.contentOffset.y = 400
    window.addSubview(scroll)
    let anchor = LatestAnchorView()
    anchor.following = false
    scroll.addSubview(anchor)
    scroll.contentSize = CGSize(width: 300, height: 1100)
    XCTAssertFalse(anchor.gliding)
    XCTAssertEqual(scroll.contentOffset.y, 400)
  }
}
