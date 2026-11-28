import XCTest
import UIKit
import ObjectiveC
@testable import LatestAnchor

@MainActor
final class KeyboardDecoratorTests: XCTestCase {
  func testObservingBeforeTheDecoratorFirstEntersAWindowKeepsTheChatScrollViewWritable() throws {
    let chat = try ChatFixture()
    var offsets = 0
    let observation = chat.scroll.observe(\.contentOffset) { _, _ in offsets += 1 }
    defer { observation.invalidate() }
    let observed: AnyClass = try XCTUnwrap(object_getClass(chat.scroll))

    chat.enterLeaveAndReenter()

    XCTAssertTrue(object_getClass(chat.scroll) === observed, "\(classChain(chat.scroll))")
    chat.assertWritable()
    XCTAssertGreaterThan(offsets, 0)
  }

  func testObservingAfterTheDecoratorFirstEntersAWindowKeepsTheChatScrollViewWritable() throws {
    let chat = try ChatFixture()
    chat.enter()
    var offsets = 0
    let observation = chat.scroll.observe(\.contentOffset) { _, _ in offsets += 1 }
    defer { observation.invalidate() }
    let observed: AnyClass = try XCTUnwrap(object_getClass(chat.scroll))

    chat.leave()
    chat.enter()

    XCTAssertTrue(object_getClass(chat.scroll) === observed, "\(classChain(chat.scroll))")
    chat.assertWritable()
    XCTAssertGreaterThan(offsets, 0)
  }

  func testTheDecoratorNeverChangesTheChatScrollViewClass() throws {
    let chat = try ChatFixture()
    let created: AnyClass = try XCTUnwrap(object_getClass(chat.scroll))

    chat.enterLeaveAndReenter()

    XCTAssertTrue(object_getClass(chat.scroll) === created, "\(classChain(chat.scroll))")
    XCTAssertFalse(classChain(chat.scroll).contains { $0.hasPrefix("KC_") })

    chat.recycle()

    XCTAssertTrue(object_getClass(chat.scroll) === created, "\(classChain(chat.scroll))")
  }

  func testOnlyTheDecoratedScrollViewIgnoresScrollRectToVisibleUntilRecycled() throws {
    let chat = try ChatFixture()
    let observation = chat.scroll.observe(\.contentOffset) { _, _ in }
    defer { observation.invalidate() }
    let plain = UIScrollView(frame: chat.window.bounds)
    plain.contentSize = CGSize(width: 300, height: 2000)
    chat.window.addSubview(plain)

    chat.enterLeaveAndReenter()
    chat.scroll.scrollRectToVisible(CGRect(x: 0, y: 1500, width: 10, height: 10), animated: false)
    plain.scrollRectToVisible(CGRect(x: 0, y: 1500, width: 10, height: 10), animated: false)

    XCTAssertEqual(chat.scroll.contentOffset.y, 0)
    XCTAssertGreaterThan(plain.contentOffset.y, 0)

    chat.recycle()
    chat.scroll.scrollRectToVisible(CGRect(x: 0, y: 1500, width: 10, height: 10), animated: false)

    XCTAssertGreaterThan(chat.scroll.contentOffset.y, 0)
    chat.assertWritable()
  }

  func testTheHitTestWorkaroundKeepsAnObservedContainerWritable() throws {
    let chat = try ChatFixture(hitTestWorkaround: true)
    let observation = chat.container.observe(\.bounds) { _, _ in }
    defer { observation.invalidate() }
    let observed: AnyClass = try XCTUnwrap(object_getClass(chat.container))
    let plain = UIView(frame: chat.container.frame)
    let below = CGPoint(x: 150, y: 560)

    chat.enterLeaveAndReenter()

    XCTAssertTrue(object_getClass(chat.container) === observed, "\(classChain(chat.container))")
    XCTAssertTrue(chat.container.hitTest(below, with: nil) === chat.scroll)
    XCTAssertTrue(plain.hitTest(below, with: nil) === plain)
    chat.container.bounds = CGRect(x: 0, y: 0, width: 300, height: 580)

    chat.recycle()

    XCTAssertTrue(chat.container.hitTest(below, with: nil) === chat.container)
  }

  func testTheLatestAnchorStillGlidesInADecoratedObservedChatScrollView() throws {
    let chat = try ChatFixture()
    let observation = chat.scroll.observe(\.contentOffset) { _, _ in }
    defer { observation.invalidate() }
    let anchor = LatestAnchorView()
    chat.scroll.addSubview(anchor)

    chat.enterLeaveAndReenter()
    chat.scroll.contentOffset.y = 400
    chat.scroll.contentSize = CGSize(width: 300, height: 2100)

    XCTAssertTrue(anchor.gliding)
    anchor.stop()
  }
}

@MainActor
private final class ChatFixture {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
  let screen = UIViewController()
  let decorator: UIView
  let container = UIView(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
  let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 300, height: 500))

  init(hitTestWorkaround: Bool = false) throws {
    let decoratorClass = try XCTUnwrap(
      NSClassFromString("ClippingScrollViewDecoratorView") as? NSObject.Type)
    decorator = try XCTUnwrap(decoratorClass.init() as? UIView)
    decorator.frame = window.bounds
    decorator.setValue(hitTestWorkaround, forKey: "applyWorkaroundForContentInsetHitTestBug")
    scroll.contentInsetAdjustmentBehavior = .always
    scroll.contentSize = CGSize(width: 300, height: 2000)
    container.addSubview(scroll)
    decorator.addSubview(container)
    window.rootViewController = screen
    if screen.view.superview == nil { window.addSubview(screen.view) }
    screen.view.frame = window.bounds
  }

  func enter() {
    screen.view.addSubview(decorator)
    settle()
  }

  func leave() {
    decorator.removeFromSuperview()
    settle()
  }

  func enterLeaveAndReenter() {
    enter()
    leave()
    enter()
  }

  func recycle() {
    let selector = NSSelectorFromString("prepareForRecycle")
    XCTAssertTrue(decorator.responds(to: selector))
    decorator.perform(selector)
  }

  func assertWritable() {
    screen.additionalSafeAreaInsets = UIEdgeInsets(top: 44, left: 0, bottom: 34, right: 0)
    screen.view.layoutIfNeeded()
    scroll.contentOffset.y = 400
    scroll.contentInset.bottom = 120
    scroll.contentSize = CGSize(width: 300, height: 2100)
    screen.additionalSafeAreaInsets = .zero
    screen.view.layoutIfNeeded()
    leave()
    enter()
    XCTAssertEqual(scroll.contentSize.height, 2100)
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
