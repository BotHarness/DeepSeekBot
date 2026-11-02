import XCTest
import UIKit
@testable import StreamSurface

@MainActor
final class StreamSurfaceTests: XCTestCase {
  func testChildrenKeepTheirFramesAndIdentityThroughGrowthAndCompletion() {
    let view = StreamSurfaceView()
    let child = UIView(frame: CGRect(x: 12, y: 10, width: 60, height: 70))
    view.mountChildComponentView(child, index: 0)
    view.active = true
    view.corners = [16, 16, 16, 4]
    view.frame = CGRect(x: 0, y: 0, width: 100, height: 40)
    view.sync()
    view.frame.size.height = 100
    view.sync()
    view.active = false
    view.sync()
    XCTAssertTrue(child.superview === view.surface)
    XCTAssertTrue(view.surface.layer.sublayers?.first === view.background)
    XCTAssertEqual(child.frame, CGRect(x: 12, y: 10, width: 60, height: 70))
    XCTAssertNil(view.surface.layer.mask)
    XCTAssertEqual(view.background.path?.boundingBox, CGRect(x: 0, y: 0, width: 100, height: 100))
    view.unmountChildComponentView(child, index: 0)
    XCTAssertNil(child.superview)
  }

  func testShrinkingAndWidthChangesSnapWithoutChangingChildLayout() {
    let view = StreamSurfaceView()
    view.active = true
    view.corners = [16, 16, 16, 4]
    view.frame = CGRect(x: 0, y: 0, width: 100, height: 100)
    view.sync()
    view.frame.size = CGSize(width: 80, height: 20)
    view.sync()
    XCTAssertEqual((view.surface.layer.mask as? CAShapeLayer)?.path?.boundingBox,
                   CGRect(x: 0, y: 0, width: 80, height: 20))
    XCTAssertNil(view.surface.layer.mask?.animationKeys())
  }

  func testCornerNormalizationProducesFiniteBoundsOnShortSurfaces() {
    let view = StreamSurfaceView()
    view.active = true
    view.corners = [100, 100, 100, 4]
    view.frame = CGRect(x: 0, y: 0, width: 20, height: 8)
    view.sync()
    XCTAssertEqual(view.background.path?.boundingBox, CGRect(x: 0, y: 0, width: 20, height: 8))
  }
}
