import UIKit

@main
@MainActor
final class HardwareSendTestAppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    configurationForConnecting session: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "HardwareSend Tests", sessionRole: session.role)
    configuration.delegateClass = HardwareSendTestSceneDelegate.self
    return configuration
  }
}

@MainActor
final class HardwareSendTestSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options: UIScene.ConnectionOptions
  ) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = UIViewController()
    self.window = window
    window.makeKeyAndVisible()
  }
}
