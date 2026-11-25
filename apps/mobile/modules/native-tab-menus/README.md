# Native tab menus (iOS)

A zero-size local Expo view that adds two #5111/#5106 behaviors to the UIKit tab bar used by expo-router `NativeTabs`. The phone tab bar (`src/ui/shell/bottom-navigation.ios.tsx`) renders it beside `NativeTabs`.

- **Long-press menu.** It adds one `UIContextMenuInteraction` to the `UITabBar` of the first visible `UITabBarController` in the window. The delegate maps the press location to a tab. It collects the bar's `UIControl` accessibility elements, removes duplicates by center, and orders them by x (reversed for right-to-left). It pairs them with the visible `UITabBarController.tabs`, then matches a `UITab.identifier` to a route name (react-native-screens uses the route key `<name>-<id>`). For a tab with no menu it shows the name pill and returns `nil`, so UIKit handles the touch as usual. A menu's title is the tab's name. The highlight preview is a clear view placed over the item with `UIPreviewTarget`, so UIKit does not lift a snapshot of the glass button.
- **Name pill.** On a long press without a menu, and through a `UITapGestureRecognizer` that recognizes alongside UIKit's own gestures and never cancels touches. It flashes a capsule with the tab's name above the tapped item, using `tabChrome.pillFade` and `tabChrome.pillHold`. The pill is hidden from accessibility, and Reduce Motion drops the fade.

It uses only public UIKit API and no private selectors, swizzling or class names. It does depend on the tab bar's undocumented layout: one `UIControl` per visible tab. If that changes, the interaction finds no item and stays inert. See `docs/research/native-tab-bar-menus.md`.

This is native code: rebuild the dev client before loading the JS that uses it.
