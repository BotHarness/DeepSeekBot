import XCTest
import UIKit
import ObjectiveC
@testable import LatestAnchor

@MainActor
final class KeyboardDecoratorTests: XCTestCase {
  func testReenteringAWindowKeepsTheObservedChatScrollViewWritable() throws {
    let decoratorClass = try XCTUnwrap(
      NSClassFromString("ClippingScrollViewDecoratorView") as? NSObject.Type)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
    let decorator = try XCTUnwrap(decoratorClass.init() as? UIView)
    decorator.frame = window.bounds
    let scroll = UIScrollView(frame: window.bounds)
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.contentSize = CGSize(width: 300, height: 1000)
    decorator.addSubview(scroll)
    let anchor = LatestAnchorView()
    scroll.addSubview(anchor)
    var offsets = 0
    let observation = scroll.observe(\.contentOffset) { _, _ in offsets += 1 }
    defer { observation.invalidate() }

    window.addSubview(decorator)
    settle()
    decorator.removeFromSuperview()
    settle()
    window.addSubview(decorator)
    settle()

    let chain = classChain(scroll)
    XCTAssertEqual(chain.filter { $0.hasPrefix("KC_NoScrollRect_") }.count, 1, "\(chain)")
    XCTAssertTrue(chain[0].hasPrefix("NSKVONotifying_"), "\(chain)")
    scroll.contentOffset.y = 400
    XCTAssertGreaterThan(offsets, 0)
    scroll.contentSize = CGSize(width: 300, height: 1100)
    XCTAssertTrue(anchor.gliding)
    anchor.stop()
  }
}

private func settle() {
  RunLoop.main.run(until: Date().addingTimeInterval(0.01))
}

private func classChain(_ object: AnyObject) -> [String] {
  var names: [String] = []
  var current: AnyClass? = object_getClass(object)
  while let type = current {
    names.append(NSStringFromClass(type))
    current = class_getSuperclass(type)
  }
  return names
}
