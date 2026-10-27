# Native design tokens per platform, and a "-1 screen" for Chats

Date: 2026-10-27. Scope: `apps/mobile` (Expo SDK 58, React Native 0.88, `@expo/ui` 58.0.23). This is source and documentation research. Nothing below has been run on a device.

Context read first: [DESIGN.md › Native first](../../apps/mobile/DESIGN.md#native-first), [ADR-0201](../adr/0201-the-mobile-design-system-maps-web-roles-onto-native-components.md), `src/ui/design/tokens.ts`, `theme.tsx` and `resolve-theme.ts`. Today one TypeScript source serves both platforms. Its colours come from the Web DSH theme (`scripts/generate-palette.mjs` → `palette.generated.ts`), and only type and touch size are split per platform (`typeScale`, `touch`). Many Material component sizes are copied in by hand as constants (`materialMenu`, `fab`, `materialDrawer`, `radius`, …).

Local paths below point at the installed package: `EXPO_UI` = `node_modules/.pnpm/@expo+ui@58.0.23_*/node_modules/@expo/ui`.

## Answers

- **Question 1.** Android has a formal token system: Material 3. It defines colour roles, a type scale, a shape scale, a motion scheme, elevation levels and state-layer opacities, and Compose exposes them through `MaterialTheme` / `MaterialExpressiveTheme`. iOS has no token spec. Its token layer is the set of semantic system colours, the Dynamic Type text styles, materials, the app tint and the SF Symbols rendering modes. Use **two platform token sets fed from one small shared core**: brand accent, status hues, spacing and content-only colours. Let React Native read platform values (`useMaterialColors()`, `PlatformColor`, text styles) for chrome instead of our constants. A DTCG + Style Dictionary pipeline is not worth adopting yet. If we adopt it later, it fits behind `generate-palette`.
- **Question 2.** Material 3 Expressive is deprecating the navigation drawer. Compose still ships `DismissibleNavigationDrawer`: it is not marked `@Deprecated`, it pushes the content aside without a scrim, and it supports predictive back. `@expo/ui` 58.0.23 has no drawer, so this would need a small local Expo UI extension. iOS has no in-app "-1 screen" component. The closest native behaviour is the Mail pattern: put the workspace panel at the root of the Chats stack, with Chats pushed above it. On iOS 26 the system pan from anywhere in the content (`interactiveContentPopGestureRecognizer`) then reveals the panel.

## 1. Platform design tokens

### 1.1 Android: what Material 3 tokenises

| Token family   | What Material 3 / Compose defines                                                                                                                                                                                                                                                                                                                                                         | Source                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Colour         | A `ColorScheme` built from five key colours, each a tonal palette mapped to roles (`primary`/`onPrimary`/`primaryContainer`…, `surface`, `surfaceContainer*`, `outline`, `error`, fixed roles). Dynamic colour is available on Android 12+ through `dynamicLight/DarkColorScheme`, with a custom scheme as the fallback. Material Theme Builder can generate a scheme from brand colours. | [M3 in Compose][m3-compose]                                                                             |
| Seeded schemes | `material-color-utilities` generates a scheme from one seed. It offers several variants (`TONAL_SPOT`, `VIBRANT`, `EXPRESSIVE`, `FIDELITY`, `CONTENT`, `MONOCHROME`, `NEUTRAL`, `RAINBOW`, `FRUIT_SALAD`, `CMF`); Material You uses tonal spot.                                                                                                                                           | [variant.ts][mcu-variant]                                                                               |
| Typography     | 15 styles: display / headline / title / body / label, each in large, medium and small. Compose also has `*Emphasized` key tokens.                                                                                                                                                                                                                                                         | [M3 in Compose][m3-compose], [TypographyKeyTokens][tok-type]                                            |
| Shape          | `Shapes(extraSmall…extraLarge)`, plus the key tokens `CornerNone`, `CornerFull`, `…Increased` and `CornerExtraExtraLarge`.                                                                                                                                                                                                                                                                | [M3 in Compose][m3-compose], [ShapeKeyTokens][tok-shape]                                                |
| Motion         | `MotionScheme.standard()` / `.expressive()`, with six key tokens: Default/Fast/Slow × Spatial/Effects.                                                                                                                                                                                                                                                                                    | [MotionScheme.kt][motion], [MotionSchemeKeyTokens][tok-motion]                                          |
| Elevation      | Levels 0–5 = 0/1/3/6/8/12 dp. M3 shows elevation mainly as a tonal overlay (`tonalElevation`), with shadows (`shadowElevation`) in addition.                                                                                                                                                                                                                                              | [ElevationTokens][tok-elev], [M3 in Compose][m3-compose]                                                |
| State layers   | Hover 0.08, focus 0.10, pressed 0.10, dragged 0.16.                                                                                                                                                                                                                                                                                                                                       | [StateTokens][tok-state]                                                                                |
| Touch          | Material components reserve a 48 dp minimum interactive size.                                                                                                                                                                                                                                                                                                                             | [Android accessibility][a11y-android], `EXPO_UI/src/jetpack-compose/CompositionLocalProvider/index.tsx` |

**Compose entry point.** `MaterialExpressiveTheme(colorScheme?, motionScheme?, shapes?, typography?)`. When a parameter is left null, the outermost theme falls back to `expressiveLightColorScheme()`, `MotionScheme.expressive()`, `Shapes()` and `Typography()`. [MaterialTheme.kt][mt]

**Material Theme Builder.** It exports code and imports JSON ([README][mtb]). The Android guide documents the Compose export as `Color.kt` (every role, light and dark) plus `Theme.kt` ([M3 in Compose][m3-compose]). The builder is a design-time tool. Our seed is generated at runtime, so we do not need its export.

**What `@expo/ui` jetpack-compose lets us feed** (`EXPO_UI/src/jetpack-compose/Host/index.tsx`, `EXPO_UI/android/.../HostView.kt`; [Expo SDK 58 Jetpack Compose docs][expo-compose]):

- `Host` takes `colorScheme` (`light` / `dark`, or follow the device), `seedColor` and `colorOverrides` (a partial set of M3 roles).
- With no seed, the palette is the wallpaper's dynamic scheme on Android 12+, otherwise the static baseline. A seed generates a `SchemeTonalSpot` scheme on every API level (`.../colors/MaterialColors.kt`). `isDynamicColorAvailable` reports which case applies.
- `Host` wraps its children in `MaterialExpressiveTheme(colorScheme = …)` only. It has **no prop for typography, shapes or motion**, so those stay at the Expressive defaults listed above. That matches what the owner wants ("default look").
- JS can read the resolved palette: `useMaterialColors()` (inside a `Host` it returns that Host's palette) or `getMaterialColors({ scheme, seedColor })` (`EXPO_UI/src/jetpack-compose/colors.ts`). The roles come back as `#RRGGBBAA` strings, so our existing contrast and mix maths still works on them.
- `Text` takes `typography: 'bodyMedium' | …` and resolves it from `MaterialTheme.typography` (`EXPO_UI/android/.../TextView.kt`).
- Our local Compose modules (for example `modules/material-fab-menu`) build their own `light/darkColorScheme()` and take individual colour props. If they were written as Expo UI extensions placed inside a `Host`, they would inherit the Host theme instead. [Extending with Jetpack Compose][expo-extend]

### 1.2 iOS: what the HIG treats as the token layer

Apple publishes no token format. The HIG instead names semantic, system-resolved values and tells apps to use them as intended:

- **Colour.** Dynamic system colours are "semantically defined by [their] purpose, rather than [their] appearance". There are label levels (label, secondary, tertiary, quaternary), two background sets (system and grouped, each with three levels), separators and links. The HIG says not to redefine their meanings. [HIG Color][hig-color], [UIColor UI element colors][uicolor-ui]
- **Accent / tint.** The system applies the app accent colour to prominent controls. For apps with mostly monochrome content, the HIG suggests the brand colour as the accent. Apply colour to Liquid Glass sparingly. [HIG Color][hig-color], [`tint(_:)`][swiftui-tint]
- **Type.** Text styles (Large Title … Caption 2) bundle size, weight and leading, and they scale with Dynamic Type. Use the built-in styles, and adjust them with symbolic traits (bold, loose or tight leading) rather than fixed sizes. [HIG Typography][hig-type], [`Font.TextStyle`][swiftui-textstyle]
- **Materials.** Liquid Glass (regular and clear variants) is for the controls and navigation layer only. Four standard materials (ultra-thin, thin, regular, thick) are for the content layer. System components adopt Liquid Glass automatically. [HIG Materials][hig-materials]
- **Symbols.** Four rendering modes: monochrome, hierarchical, palette and multicolor. [HIG SF Symbols][hig-symbols]
- **Touch.** The minimum control size is 44×44 pt. [HIG Accessibility][hig-a11y]

**What `@expo/ui` swift-ui exposes** (`EXPO_UI/src/swift-ui/`):

- `font({ textStyle })` for the 11 text styles (these scale with Dynamic Type).
- `foregroundStyle` and `tint`, which take a `ShapeStyle`: a colour, a `hierarchical` level from `primary` to `quinary`, a `material` from `ultraThin` to `bar`, or a gradient.
- Named colours, including `primary` and `secondary`. `PlatformColor` values pass through as colours.
- `glassEffect({ glass: { variant: 'regular' | 'clear' | 'identity' } })`, `preferredColorScheme` and `controlSize`.
- `Host.seedColor`, which is applied as the SwiftUI tint for controls.

For React Native views outside SwiftUI, [`PlatformColor`][rn-platformcolor] resolves UIKit names such as `label` and `systemGroupedBackground`. On Android it resolves `?attr/…` and `@android:color/…`, including the Android 12+ `system_accent1_*` palette ([R.color][r-color]). The app already uses `PlatformColor('label')` in `src/ui/chat/native-header.ts`, and `system-type.ts` maps sizes to `dynamicTypeRamp`.

### 1.3 Cross-platform format and tooling

- **W3C DTCG.** The 2025.10 release is a _Final Community Group Report_ (28 Oct 2025) that the group calls stable. It has three modules: Format, Color and Resolver. Format defines `$value`/`$type` tokens and the types color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, stroke, border, transition, shadow, gradient and typography ([Format][dtcg-format]). Resolver handles contexts through _sets_ and _modifiers_; its examples are light/dark, sizing and accessibility modes ([Resolver][dtcg-resolver]). A `platform: ios | android` modifier is a natural fit for us.
- **Style Dictionary.** DTCG support is first-class from v4, but "the latest format 2025.10 does not have full support yet". That support is a work in progress in v5. [SD DTCG][sd-dtcg] It can emit Swift (`ios-swift/class.swift`, `enum.swift`, `any.swift`) and Kotlin for Compose (`compose/object`), as well as Android XML (`android/resources`). [SD formats][sd-formats]
- **Fit with our pipeline.** `generate-palette.mjs` already reads DSH and writes TypeScript, and `test/design-tokens.test.ts` guards its drift. A DTCG step would emit `shared.tokens.json` plus `ios`/`android` modifiers, and the TypeScript output would come from that. Swift and Kotlin outputs would help only if native code consumed build-time tokens. Ours does not: our native views get colours at runtime (Host seed, props) and use system defaults for type and shape. **So: no Style Dictionary now.** Keep one generator. Optionally make it write DTCG JSON as an intermediate format so a later Style Dictionary step can be added without changing role names.

### 1.4 Recommended token structure

| Layer                           | Contents                                                                                                                                                                                             | Owner on each platform                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared** (generated from DSH) | Brand accent (the seed); status hues (danger, warning, success); spacing (`space`, a 4-pt grid on both platforms); content-only colours (chat bubbles, Host colours, charts, wallpaper); focus width | One generator. The Web-parity test covers only this layer.                                                                                                                                        |
| **Android**                     | Colour = `Host seedColor` = accent → `useMaterialColors()` roles; type = M3 style names; shape = M3 corner scale; elevation levels; `MotionScheme`; state layers; touch 48                           | Compose defaults through `Host`. RN reads them from `useMaterialColors()` and a typed M3 name map. Remove the hand-copied `materialMenu`/`fab`/`radius` numbers when each screen is next touched. |
| **iOS**                         | Colour = semantic `PlatformColor` names (label, background levels, separator); accent = tint; type = text styles; materials; touch 44                                                                | UIKit / SwiftUI. RN uses `PlatformColor` and `dynamicTypeRamp`. SwiftUI uses `font(textStyle)`, `foregroundStyle(hierarchical)` and `tint`.                                                       |

Should RN read platform-native values? **Yes, for chrome and secondary text:** on Android use `useMaterialColors()`, on iOS use `PlatformColor`. **No, for brand and content surfaces**, which must match the Web. One limit: `PlatformColor` values are opaque to JS, so anything we compute (`withAccent`, `mix`, contrast against `base`) must keep a hex input. Material roles come back as hex, so this does not affect Android.

## 2. A "-1 screen" for Chats

### 2.1 Android: `DismissibleNavigationDrawer`

- **Status.** Material Components says: "The navigation drawer is being deprecated in the Material 3 expressive update … use an expanded navigation rail". The expanded rail "is meant to replace the navigation drawer". [MDC NavigationDrawer.md][mdc-drawer], [MDC NavigationRail.md][mdc-rail] The Compose function is still public and not marked `@Deprecated`; only some `DrawerState` members are deprecated. [NavigationDrawer.kt][nd-kt]
- **Behaviour** ([NavigationDrawer.kt][nd-kt]):
  - It is a standard drawer with no scrim. The content is laid out at `sheetWidth + offset`, so the whole screen slides right, as on a launcher's -1 screen.
  - The KDoc recommends it "for layouts that prioritize content … or for apps where users are unlikely to switch destinations often", with a visible menu icon.
  - The drag is `anchoredDraggable(Horizontal)` on the whole container. `gesturesEnabled` is a single boolean with no edge-only option.
  - Opening uses the `DefaultSpatial` motion and closing uses `FastEffects`. Escape and the accessibility `dismiss` action close it, and focus moves into the drawer when it opens.
  - `DismissibleDrawerSheet(drawerState, …)` handles Back on every Android version and animates during predictive back on Android 14+.
  - The sheet's maximum width is 360 dp, with `CornerLargeEnd` and the `surface` colour. [NavigationDrawerTokens][nd-tokens]
- **The M3 Expressive replacement on phones.** `ModalWideNavigationRail(hideOnCollapse = true)` enters from off screen, but it is **modal with a scrim** and sits above the layout. So it gives a modal drawer, not the pushed "-1 screen" feel. Gestures are enabled only when `hideOnCollapse` is true. [WideNavigationRail.kt][wnr-kt] Our current `materialDrawer` (360 width with a scrim gutter) is already this modal shape.
- **`@expo/ui` support.** None. `EXPO_UI/src/jetpack-compose/` has no Drawer and no Rail. It does have `HorizontalPager`, `PullToRefreshBox`, `FloatingActionButton` and `RNHostView`, which hosts RN views inside Compose. The supported route is a local module following [Extending with Jetpack Compose][expo-extend]: a Compose view registered through `ExpoUIView` and placed inside `<Host>`. It would have two slots, each an `RNHostView` holding the RN tree (the workspace panel, and Chats with its `FlatList`, `RefreshControl` and FAB). It would get the Host's `MaterialExpressiveTheme` for free.
- **Gesture and scroll concerns.**
  1. Vertical list scrolling is orthogonal to the drawer drag, so touch slop separates them. No nested-scroll coupling is needed. Compose ↔ View nested-scroll interop works only with cooperating parents and is not needed here. [Nested scroll interop][nested-interop]
  2. A horizontal drag anywhere opens the drawer. That is the feature, but it collides with any horizontal child: swipe rows, carousels, the composer. React Native's JS responder can also cancel the Compose gesture; `HostView` contains special handling for parent `ACTION_CANCEL` (`EXPO_UI/android/.../HostView.kt`). Keep horizontal gestures out of Chats, or switch drawer gestures off while one is active.
  3. Back: the drawer's Compose back handler must cooperate with `holdBack` and the local `predictive-back` module (DESIGN.md › Native first). Expect one owner per surface.
  4. The header and tab bar sit outside this screen unless the drawer wraps the tab navigator. Decide whether the header slides with the content (as on a -1 screen) or stays in place.
- **Alternative.** `@expo/ui` `HorizontalPager` with page 0 as the panel and page 1 as Chats gives a launcher-style pager. Pages are peers rather than a pushed panel, it has no predictive back, and Back has to be wired by hand.

### 2.2 iOS: is there a system "-1 screen"?

- **No in-app component.** Today View, the widgets page to the left of the Home Screen, is a system surface for widgets. Apps cannot provide one. [HIG Widgets][hig-widgets]
- **Sidebar / `NavigationSplitView`.** The HIG says to prefer a split view in regular widths, not compact ones. [HIG Split views][hig-split] On iPhone, `NavigationSplitView` "collapses into a single stack" with the sidebar as the root. `preferredCompactColumn` chooses which column shows on top. [NavigationSplitView][nsv] `@expo/ui` exposes `NavigationSplitView` with `preferredCompactColumn` (`EXPO_UI/src/swift-ui/NavigationSplitView`). Using it would move navigation ownership from Expo Router to SwiftUI.
- **Page style (`TabView` `.page` / `UIPageViewController`).** The HIG reserves page controls for "an ordered list of pages", with no hierarchy; for more complex navigation it points to a sidebar or split view. [HIG Page controls][hig-page], [`PageTabViewStyle`][ptvs] A workspace panel is hierarchy, so this is the wrong metaphor, even though `@expo/ui` has `tabViewStyle({ type: 'page' })`.
- **What Apple's apps do.** Mail opens on a mailbox and shows a **Mailboxes** button at the top left. Mailboxes is the parent of the inbox in the navigation stack. [Apple Support: Mail mailboxes][mail]
- **The system gesture that gives the "-1" feel.** iOS 26 adds `UINavigationController.interactiveContentPopGestureRecognizer`. It pops "when a person initially pans horizontally in a leading to trailing direction" anywhere in the content area. [Apple docs][icpgr] react-native-screens 4.30 (installed) uses it on iOS 26 and turns it on by default; `fullScreenSwipeEnabled` controls it and `gestureResponseDistance` limits its area (`react-native-screens/src/types.tsx`, `ios/RNSScreenStack.mm`).

| Option                                | How                                                                                                                                                                                     | Trade-offs                                                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Stack root (recommended)**       | Chats tab stack: `workspaces` is the stack's anchor and Chats is pushed on top at launch ([Expo Router `anchor`][router-settings]). The header title or chevron is the back affordance. | Fully native: Liquid Glass header, interactive pop, VoiceOver. A swipe right anywhere reveals the panel, like Mail. Costs: "Back" now means "show workspaces"; leading-edge swipe actions on rows would compete; deep links and state restoration must rebuild the root beneath. |
| B. `NavigationSplitView` (`@expo/ui`) | Sidebar = workspaces, detail = Chats; collapses to a stack on iPhone                                                                                                                    | Native on iPad as well, but SwiftUI owns navigation. It does not mix with an Expo Router native stack inside RN screens.                                                                                                                                                         |
| C. Keep the current custom sidebar    | Today's floating Liquid Glass drawer with a left-edge gesture (DESIGN.md › Chats)                                                                                                       | Custom surface. On iOS 26 its edge pan competes with the system content pop on pushed screens.                                                                                                                                                                                   |
| D. Page `TabView`                     | Pager with panel and Chats                                                                                                                                                              | Against the HIG for hierarchy. Has page dots. Not recommended.                                                                                                                                                                                                                   |

## Recommendations

- Keep **one generator** and split its output into `shared` (accent, status hues, spacing, content colours) plus per-platform maps. Do not adopt Style Dictionary or Swift/Kotlin outputs until native code consumes build-time tokens. Writing DTCG 2025.10 JSON as an intermediate format is optional.
- **Android:** treat the `Host seedColor` (the brand accent) as the colour token and read chrome colours from `useMaterialColors()`. Use M3 type names, shapes, motion and elevation as they come, and delete the hand-copied Material numbers as each screen is touched. Move local Compose modules to the Expo UI extension pattern so they inherit the Host theme.
- **iOS:** use `PlatformColor` semantic names for labels, backgrounds and separators; text styles for type; the tint for the accent; system materials. Keep hex only for computed colours and content surfaces.
- Limit the Web-parity tests to the shared layer. Platform layers are tested against platform names, not Web values.
- **Android -1 screen:** spike a local `DismissibleNavigationDrawer` Expo UI extension with two `RNHostView` slots and `DismissibleDrawerSheet(drawerState)` for predictive back. Record why it is used even though M3 Expressive deprecates the drawer: no scrim, pushed content. The documented fallback is `ModalWideNavigationRail(hideOnCollapse = true)`. Check horizontal-gesture conflicts and the `holdBack` handoff before shipping.
- **iOS -1 screen:** make the workspace panel the root of the Chats stack (Expo Router `anchor`), with Chats pushed above it. iOS 26's content pop gesture then gives "swipe right into the panel" natively, as in Mail. Then retire the custom left-edge sidebar on iOS 26 and record the change in DESIGN.md.
- Before either change ships, write the decision into DESIGN.md (Native first requires that for any custom surface) and amend ADR-0201's "one token source" bullet.

[m3-compose]: https://developer.android.com/develop/ui/compose/designsystems/material3
[mcu-variant]: https://github.com/material-foundation/material-color-utilities/blob/main/typescript/dynamiccolor/variant.ts
[tok-type]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypographyKeyTokens.kt
[tok-shape]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeKeyTokens.kt
[tok-motion]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionSchemeKeyTokens.kt
[tok-elev]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevationTokens.kt
[tok-state]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt
[motion]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MotionScheme.kt
[mt]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/MaterialTheme.kt
[mtb]: https://github.com/material-foundation/material-theme-builder/blob/main/README.md
[a11y-android]: https://developer.android.com/guide/topics/ui/accessibility/apps
[expo-compose]: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/
[expo-extend]: https://docs.expo.dev/guides/expo-ui-jetpack-compose/extending/
[hig-color]: https://developer.apple.com/design/human-interface-guidelines/color
[hig-type]: https://developer.apple.com/design/human-interface-guidelines/typography
[hig-materials]: https://developer.apple.com/design/human-interface-guidelines/materials
[hig-symbols]: https://developer.apple.com/design/human-interface-guidelines/sf-symbols
[hig-a11y]: https://developer.apple.com/design/human-interface-guidelines/accessibility
[hig-split]: https://developer.apple.com/design/human-interface-guidelines/split-views
[hig-page]: https://developer.apple.com/design/human-interface-guidelines/page-controls
[hig-widgets]: https://developer.apple.com/design/human-interface-guidelines/widgets
[uicolor-ui]: https://developer.apple.com/documentation/uikit/uicolor/ui_element_colors
[swiftui-tint]: https://developer.apple.com/documentation/swiftui/view/tint(_:)-93mfq
[swiftui-textstyle]: https://developer.apple.com/documentation/swiftui/font/textstyle
[rn-platformcolor]: https://reactnative.dev/docs/platformcolor
[r-color]: https://developer.android.com/reference/android/R.color
[dtcg-format]: https://www.designtokens.org/tr/2025.10/format/
[dtcg-resolver]: https://www.designtokens.org/tr/2025.10/resolver/
[sd-dtcg]: https://styledictionary.com/info/dtcg/
[sd-formats]: https://styledictionary.com/reference/hooks/formats/predefined/
[mdc-drawer]: https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationDrawer.md
[mdc-rail]: https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationRail.md
[nd-kt]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt
[nd-tokens]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationDrawerTokens.kt
[wnr-kt]: https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/WideNavigationRail.kt
[nested-interop]: https://developer.android.com/develop/ui/compose/touch-input/scroll/nested-scroll-modifiers
[nsv]: https://developer.apple.com/documentation/swiftui/navigationsplitview
[ptvs]: https://developer.apple.com/documentation/swiftui/pagetabviewstyle
[mail]: https://support.apple.com/guide/iphone/organize-email-in-mailboxes-iph376ef8aa3/ios
[icpgr]: https://developer.apple.com/documentation/uikit/uinavigationcontroller/interactivecontentpopgesturerecognizer
[router-settings]: https://docs.expo.dev/router/advanced/router-settings/
