import XCTest
import UIKit
@testable import SpeakerAnchor

@MainActor
final class SpeakerAnchorTests: XCTestCase {
  func testRestsAtTheBubbleRidesTheFloorAndStopsAtTheFirstBubble() {
    XCTAssertEqual(speakerOffset(top: 400, height: 32, rest: 40, span: 100, floor: 700), 40)
    XCTAssertEqual(speakerOffset(top: 688, height: 32, rest: 40, span: 100, floor: 700), -20)
    XCTAssertEqual(speakerOffset(top: 900, height: 32, rest: 40, span: 100, floor: 700), -100)
  }

  func testFollowsTheScrollOffsetInTheSameUpdate() {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
    let scroll = UIScrollView(frame: window.bounds)
    scroll.contentSize = CGSize(width: 300, height: 2000)
    window.addSubview(scroll)
    let anchor = SpeakerAnchorView()
    anchor.frame = CGRect(x: 0, y: 1000, width: 32, height: 32)
    anchor.rest = 40
    anchor.span = 200
    anchor.floor = 100
    scroll.addSubview(anchor)
    window.isHidden = false
    scroll.contentOffset = CGPoint(x: 0, y: 700)
    XCTAssertEqual(anchor.host.transform.ty, 40)
    scroll.contentOffset = CGPoint(x: 0, y: 500)
    XCTAssertEqual(anchor.host.transform.ty, -32)
    scroll.contentOffset = CGPoint(x: 0, y: 200)
    XCTAssertEqual(anchor.host.transform.ty, -200)
  }

  func testChildrenMountInsideTheMovingHost() {
    let anchor = SpeakerAnchorView()
    let child = UIView(frame: CGRect(x: 0, y: 0, width: 32, height: 32))
    anchor.mountChildComponentView(child, index: 0)
    XCTAssertTrue(child.superview === anchor.host)
    anchor.unmountChildComponentView(child, index: 0)
    XCTAssertNil(child.superview)
  }
}
