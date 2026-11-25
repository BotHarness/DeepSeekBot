# Native tab bar: long-press menus, name pill, hide on scroll, reorder

Researched on 2026-11-25 for [#5194](https://github.com/BotHarness/DeepSeekBot/issues/5194) and the (d) variant in [PR #5203](https://github.com/BotHarness/DeepSeekBot/pull/5203). Checked against the Xcode iOS 27.2 Simulator SDK, react-native-screens 4.30.1 (with our pnpm patch), and expo-router 58.0.32 (with our pnpm patch). Ran on an iPhone 18 Pro Simulator with iOS 27.2 in zh-Hans.

Question: can the native `UITabBarController` bar from expo-router `NativeTabs` keep what our custom SwiftUI island does today? That is: (1) the #5111 long-press menu of recent items, (2) the #5106 name pill and cross-fade, (3) hiding fully on scroll, and (4) keeping tab state when the order changes. Or should the custom island be made to look native instead?

## Result

All four work on the native bar. The spike is commit `fa2e55289` on `t3/pinned-tab-prototypes-5194`. It adds the dev-only module `apps/mobile/modules/native-tab-menus` and wires it into the (d) fixture.

| Gap from #5203              | Result                                                                                                                                                                      | How                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| (1) Long-press menu         | **Works.** Native `UIMenu` with 4 fixture recents and New Group. A tap still switches tabs, press-and-drag scrubbing still works, and a tab with no menu behaves as before. | Local Expo module: one `UIContextMenuInteraction` on the `UITabBar`. Public API only.                                         |
| (2) Name pill + cross-fade  | **Works.** The pill flashes above the native item. The content fades from the old tab over `tabChrome.tabFade`.                                                             | Same module: a simultaneous `UITapGestureRecognizer`, then an overlay label plus a snapshot fade.                             |
| (3) Hide fully on scroll    | **Works without native code.**                                                                                                                                              | `NativeTabs hidden`, which react-native-screens maps to `setTabBarHidden:animated:`, driven from the list's scroll direction. |
| (4) Reorder without remount | **Works with a one-line expo-router change** (tested locally, not committed).                                                                                               | react-native-screens already reorders the same `UITab` objects in place. Only expo-router's `key` forces the remount.         |

**Recommendation: keep the native bar (d), and productionize this module plus the one-line expo-router patch.** Do not rebuild a native-looking custom island. Reasons and caveats are under [Recommendation](#recommendation).

## Evidence

Fixture data only. The (d) fixture runs at `deepseekbot-dev://qa/pinned-native-tabs-regular` (dev builds only).

- Long-press Chats → native menu, light mode (left). A tap on Settings → name pill above the native item (right):
  <img src="https://media.botharness.ai/pr/fa2e55289641/fce1cdc9278ce7faf11b77653b5c262dbb2e8e87f817aafb69650530290eb96b.png" width="480" alt="Native tab bar long-press menu and name pill, light">
- The same in dark mode. The pill is on the avatar tab after a reorder, which shows the mapping follows the new order:
  <img src="https://media.botharness.ai/pr/fa2e55289641/1337cffa24085865387a31e2919d687a8ec443db22d1cdd552a9919ef1eb6b0e.png" width="480" alt="Native tab bar long-press menu and name pill, dark">
- Recording: long-press → menu → pick "Fixture Ops" (the fixture shows the picked item, which proves `onSelect` reaches JS) → tap Sessions (pill) → tap Chats (pill): <https://media.botharness.ai/pr/fa2e55289641/6734e4ee32b35d79e9993be357934856e882175106bb01f50f09be8e14303fe7.mp4>
- Pill frames from a screen recording, 5 fps, bottom of the screen. The Liquid Glass lens moves to Settings and "设置" flashes and fades: <https://media.botharness.ai/pr/fa2e55289641/55047b992d4ad6b6055584b98944d549c6c0b9092d1cbc6a5d6ebcb601103338.png>
- Cross-fade frames at 60 fps around a Chats → Settings switch. The titles 聊天 and 设置 blend over about 7 frames: <https://media.botharness.ai/pr/fa2e55289641/693e13e603e003249468688effffccfa7d822660a271946c49bf68f2fc2639a2.png>
- AX5 (largest accessibility size): the menu still opens and scrolls as usual for UIKit:
  <img src="https://media.botharness.ai/pr/fa2e55289641/d66c8e804162e5722e7e4e2b785f141df152c5b4c663a35797e868157f111baa.png" width="200" alt="Menu at AX5">
- `?hide=scroll`: scrolled down, the bar is fully hidden (left). Scrolled up, it is back (right):
  <img src="https://media.botharness.ai/pr/fa2e55289641/98b71b5a56466f83177784642c3dc91444b45d2dd610e0d2dfeb839002fc2c90.png" width="480" alt="Native tab bar hidden on scroll down and shown on scroll up">
- Reorder with the expo-router key change. Left: Pinned has 1 tap. Middle: after "Move Pinned tab to the end", Pinned still has 1 tap. Right: Chats keeps its scroll position (row 11). PR #5203 finding 1 shows both resetting without the change.
  <img src="https://media.botharness.ai/pr/fa2e55289641/753cced409008ebb3bf2731624c0a23dcea93552d7df30e66264f75ca9842ef0.png" width="600" alt="Reorder keeps tab state">

Interaction checks (agent-device on the Simulator):

- A tap on any tab still selects it. A long press on Chats opens the menu and does not change the selected tab.
- A long press on a tab with no menu (Activity) returns `nil` from the delegate, so UIKit handles the touch and selects the tab, as it does today.
- Press-and-drag from Chats to Settings still moves the Liquid Glass lens and selects Settings.
- Selecting a menu item fires `onSelect`, and the menu still works after a reorder.
- VoiceOver: the accessibility tree is unchanged. Each tab keeps its label ("聊天", "Fixture Steward，固定标签页", …), the selected trait and the tab-bar container. The open menu exposes each row as a button. The pill and fade snapshot are hidden from accessibility. VoiceOver itself was not run (see [Open items](#open-items)).

## (1) Long-press menus on a native tab

### What the platform offers

- **No per-item API on the iPhone tab bar.** `UITab`, `UITabGroup`, `UITabBarItem` and `UITabBarControllerDelegate` in the iOS 27.2 SDK have no menu or long-press hook. The only tab context-menu API is `UITabBarControllerSidebarDelegate tabBarController:sidebar:contextMenuConfigurationForTab:` (`UITabBarControllerSidebar.h`), which is for the iPad sidebar.
- **SwiftUI `Tab.contextMenu` is sidebar-only.** Apple: "Use this modifier to add a context menu to a tab's sidebar representation" ([TabContent.contextMenu](<https://developer.apple.com/documentation/swiftui/tabcontent/contextmenu(menuitems:)>)). A SwiftUI `TabView` probe with `.contextMenu` on every `Tab`, on the iOS 27.2 iPhone Simulator, showed no menu on long press.
- **react-native-screens and expo-router** expose no long-press or menu prop on tabs. NativeTabs only emits `tabPress`.
- **`UIContextMenuInteraction` can go on any view**, including `UITabBar` ([docs](https://developer.apple.com/documentation/uikit/uicontextmenuinteraction)). Its delegate gets the press location and may return `nil`. With `nil` there is no menu, and the touch continues to the bar.

### What the spike does

`NativeTabMenusView`, a zero-size view rendered next to `NativeTabs`:

1. Finds the visible `UITabBarController` in its window (a public view-controller walk) and adds one `UIContextMenuInteraction` and one tap recognizer to its `tabBar`. It retries for about 3 s after mount, because the native host mounts after the avatar icons are captured.
2. Maps a point to a tab. It collects the bar's `UIControl` descendants that are accessibility elements, removes duplicates by center (iOS 26+ draws every item twice, once in the selected-content layer and once in the content layer), sorts them by x (reversed for right-to-left), and pairs them with `UITabBarController.tabs` filtered to visible. If the counts differ, it returns no tab: it fails closed. A spec matches a `UITab.identifier` equal to the route name or starting with `<name>-`, because react-native-screens uses the route key as the identifier.
3. Builds the menu: the recents in an inline section, then the actions (New Group), using SF Symbols from JS. Selecting a row fires `onSelect({ tab, id })`.
4. For the highlight and dismissal previews, it uses a clear view placed over the item with `UIPreviewTarget`. The default preview lifts a snapshot of the glass button, which drew a misplaced black glyph above the bar on iOS 27.2 (seen in the probe app). With the clear anchor, the menu attaches to the item and the bar itself does not change.

Every call is public UIKit API, with no private selectors, swizzling or class-name checks. The hierarchy dump in the probe showed the private `_UITabButton`, `_UILiquidLensView` and similar classes. The code never names them; it relies only on "one `UIControl` per visible tab".

### Prior art and what Claude's iOS app likely does

- [lynnswap/TabBarMenu](https://github.com/lynnswap/TabBarMenu) (MIT, iOS 18.4+) does the same job with a long-press recognizer on each item view, plus a hidden `UIButton` with `performPrimaryAction()` to show the `UIMenu`. It finds item views through the private `UITabBarItem view` selector and hooks private `UITabBar` and `UITabBarController` methods (`_didSelectButtonForItem:`, `_buttonUp:`, `_tabElements`, …). Its README warns: "This package relies on undocumented APIs and runtime behavior, so extra care is needed before using it in App Store-bound projects." Our spike avoids all of that.
- [ryanashcraft/fabbar](https://github.com/ryanashcraft/fabbar) recreates the iOS 26 tab bar in SwiftUI. Per its README, as summarized in search results (not verified), it depends on internal UIKit view-hierarchy manipulation.
- **Claude's iOS app: no direct evidence.** I could not inspect the app binary or find a public write-up. Inference: no public API puts per-item menus on the iPhone tab bar. So the app either draws its own bar, or attaches an interaction to the system bar as this spike or TabBarMenu does. Someone with the app can tell which:
  - Press and drag across the bar. The system bar's Liquid Glass lens magnifies and morphs as it follows the finger; custom bars rarely copy that.
  - At AX5, long-press a tab without a menu. The system bar should offer the Large Content Viewer.

## (2) Name pill and cross-fade

- **Pill.** A `UITapGestureRecognizer` on the bar with `cancelsTouchesInView = false`, `delaysTouchesEnded = false` and simultaneous recognition. It never delays or blocks the bar's own handling. On `.ended` it maps the point to a tab, then adds a capsule (`label` fill, `systemBackground` semibold footnote text, scaled with Dynamic Type) to the tab controller's view above the item, clamped 8 pt from the screen edges. The capsule fades in over `tabChrome.pillFade`, holds for `tabChrome.pillHold`, then fades out. With Reduce Motion it shows and hides without fading. It is hidden from accessibility, as the #5106 pill is.
- **Cross-fade.** When the touch began, the recognizer recorded `selectedTab`. If the tapped tab differs, it adds `snapshotView(afterScreenUpdates: false)` of the tab controller's view, masked to stop at the top of the bar, and fades it out over `tabChrome.tabFade`. The snapshot is taken before UIKit commits the new tab, so it shows the old content. Reduce Motion skips the fade, as the `tabTransition` `'none'` case does today. This is the one part that depends on timing: it relies on the recognizer's action running before the next frame commits. It held in every Simulator run, but needs a check on a device under load.
- The lens movement and the instant content swap stay UIKit's own. The pill and the fade are layered on top.

## (3) Hiding the bar fully on scroll

`UITabBarController.setTabBarHidden(_:animated:)` (iOS 18+, [docs](<https://developer.apple.com/documentation/uikit/uitabbarcontroller/settabbarhidden(_:animated:)>)) hides the bar completely. `tabBarMinimizeBehavior` (iOS 26) only shrinks it. react-native-screens already calls `setTabBarHidden:_tabBarHidden animated:` when the `tabBarHidden` prop changes (`RNSTabsHostComponentView.mm`). expo-router passes `NativeTabs hidden` through as `tabBarHidden` (`NativeTabsView.ios.js`). The fixture's `?hide=scroll` sets `hidden` from scroll direction with an 8 pt slop. Production would reuse the existing `useTabChrome` / `chromeScroll` rules, so Chats keeps its current behavior. The show and hide animation is UIKit's, so it can't be retimed to `tabChrome.hideDuration`.

## (4) Reordering without a remount

- react-native-screens is already safe. `installScreenControllers` reuses each screen's `UITab` (`tabForTabScreenController` returns `screenController.tab` when present) and calls `setTabs:animated:` with the new order (`RNSTabBarController.mm`). iOS 27 also adds `UITabBarController.performBatchUpdates:` to merge several tab changes into one animated pass.
- The remount comes from expo-router alone. `NativeBottomTabsNavigator.js` renders `NativeTabsView` with `key: tabConfigurationKey`, and that key is `triggerChildren.map(name).join(';')`, which is order-sensitive. Sorting the names first (`….map(name).sort().join(';')`) keeps the key stable across reorders but still remounts when the set of tabs changes. With that one change, both the counter and the scroll position survived a reorder (evidence above).
- I tested the change by editing the installed file in this worktree only, then restored it. Shipping it means adding it to `patches/expo-router@58.0.32.patch`. Production doesn't render `NativeTabs` today, so that patch only affects the fixtures until the bar is adopted.

## Option B: a native-looking custom island

The production island ([DESIGN.md](../../apps/mobile/DESIGN.md), #5106) is a full-width band in `base` color: SwiftUI buttons, no glass, no selection indicator. Making it look native means rebuilding it with `GlassEffectContainer`, a `.glassEffect(.regular.interactive())` capsule and a `matchedGeometryEffect` selection capsule. The visible differences that remain:

- **Press-and-drag lens.** The system bar's selection lens magnifies, follows the finger and morphs between items (`_UILiquidLensView`, `SDFView` in the probe dump). There is no public API for that lens. `interactive()` glass gives press feedback, not a draggable lens.
- **Minimize, bottom accessory, prominent tab.** `tabBarMinimizeBehavior`, `bottomAccessory` (iOS 26) and `prominentTabIdentifier` (iOS 27) come with the system bar. Each needs a hand-built copy.
- **Accessibility.** The system bar gives tab-bar semantics, the Large Content Viewer at AX sizes and Full Keyboard Access focus for free. A custom island must add each one.
- **Following iOS updates.** The SDK shows steady change to the system bar: iOS 26.1 added `UITab.selectedImage` and `UITabGroup.collapsedByDefault`, and iOS 27 added `prominentTabIdentifier`, sidebar placement and `performBatchUpdates:`. A custom island keeps the old look until someone copies the change.
- **Performance.** Not measured in this spike. Both draw a backdrop-sampling glass layer, so steady-state cost is probably similar. A custom island adds an RN `Host` re-render and a SwiftUI animation on every switch. The system bar's switch runs entirely in UIKit.

## Recommendation

Keep (d) and productionize the module.

|                              | Patch the native bar (this spike)                                                                                                                                                                                                                                                             | Native-looking custom island                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Effort                       | Small. The module is about 300 lines of Swift. Productionizing means wiring real `useTabMenus` entries, the scroll rules, the expo-router patch and tests: about 2–3 days.                                                                                                                    | Larger. Glass island, selection morph, minimize, accessibility parity and per-release visual catch-up: about 1–2 weeks, then ongoing work. |
| Fragility across iOS updates | Two assumptions: one `UIControl` per visible tab in the bar, and react-native-screens' `UITab.identifier` = route key. If either breaks, the interaction finds no tab and does nothing; taps and selection are unaffected. The cross-fade depends on snapshot timing. Re-check each iOS beta. | No dependence on UIKit internals, but it drifts away from the system look with every release.                                              |
| App Review                   | Public API only. Walking the view hierarchy and adding interactions to system views is allowed. Low risk. TabBarMenu's private selectors would be a real risk.                                                                                                                                | None.                                                                                                                                      |
| Look                         | It is the system bar: lens, minimize and accessories.                                                                                                                                                                                                                                         | Close, never identical: no draggable lens.                                                                                                 |
| Performance                  | No new per-frame work. The menu and pill are created only on press. The fade costs one snapshot per tab switch.                                                                                                                                                                               | Not measured. Probably similar steady-state cost, with SwiftUI work on each switch.                                                        |

If the Human wants zero dependence on UIKit's internal layout, the fallback is the custom island (b) from #5203. It keeps everything we have today, without the native lens.

## Open items

- **VoiceOver on a real device.** The accessibility tree is unchanged, but I did not run VoiceOver itself. Its double-tap-and-hold should deliver the long press to the interaction; that needs a device check. If it doesn't, add `accessibilityCustomActions` for the menu rows.
- **Large Content Viewer.** At AX5 the menu takes the long press on tabs that have a menu. On tabs without one, UIKit keeps the gesture. The Simulator never showed the viewer, with or without the module (#5203 finding 6), so this needs a device check.
- **iPad.** On iPad the iOS 18+ tab bar is at the top, and the sidebar has its own `contextMenuConfigurationForTab` delegate. react-native-screens owns the controller's delegate, so that path needs a react-native-screens hook or patch. Not tested.
- **Programmatic switches** (from a menu row or a deep link) get no pill or fade. #5111 only wants them on presses.

## Sources

- UIKit headers, iOS 27.2 Simulator SDK: `UITabBarController.h` (`tabs`, `setTabs:animated:`, `performBatchUpdates:`, `setTabBarHidden:animated:`, `tabBarMinimizeBehavior`, `prominentTabIdentifier`), `UITabBarControllerSidebar.h` (`contextMenuConfigurationForTab:`), `UITab.h`, `UITabBar.h`.
- Apple docs: [UIContextMenuInteraction](https://developer.apple.com/documentation/uikit/uicontextmenuinteraction), [TabContent.contextMenu(menuItems:)](<https://developer.apple.com/documentation/swiftui/tabcontent/contextmenu(menuitems:)>), [setTabBarHidden(_:animated:)](<https://developer.apple.com/documentation/uikit/uitabbarcontroller/settabbarhidden(_:animated:)>), [Adding context menus in your app](https://developer.apple.com/documentation/uikit/adding-context-menus-in-your-app).
- react-native-screens 4.30.1: `ios/tabs/host/RNSTabBarController.mm` (`installScreenControllers`, `tabForTabScreenController`, `makeTabForTabScreenController`) and `ios/tabs/host/RNSTabsHostComponentView.mm` (`tabBarHidden`).
- expo-router 58.0.32: `build/native-tabs/NativeBottomTabsNavigator.js` (`tabConfigurationKey`) and `build/native-tabs/NativeTabsView.ios.js` (`tabBarHidden: props.hidden`).
- Prior art: [lynnswap/TabBarMenu](https://github.com/lynnswap/TabBarMenu), [ryanashcraft/fabbar](https://github.com/ryanashcraft/fabbar).
- Spike: `apps/mobile/modules/native-tab-menus/` and `apps/mobile/app/qa/pinned-native-tabs-regular/_layout.tsx` on `t3/pinned-tab-prototypes-5194`.
