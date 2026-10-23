# ADR-0235: Mobile creation shares the existing tab navigator

- Status: Accepted; native qualification tracked in the issue
- Date: 2026-10-19
- Issue: [#2195](https://github.com/BotHarness/DeepSeekBot/issues/2195)

## Context

The confirmed mobile design places a contextual creation circle beside the bottom navigation island. SDK 58 NativeTabs exposes a bottom accessory rather than a persistent adjacent action slot. A fake navigation destination or another navigation stack would change Back and tab semantics.

## Decision

Use the already installed Expo Router JS tab navigator on iOS as well as Android, retaining existing Home, Activity and root Stack routes. A shared bar presents two destinations and a separate creation action; a transparent native modal owns dismissal and blocks underlying actions. On iOS, SwiftUI Button controls own navigation and creation taps, the selected capsule uses the native glass button style, and the separate plus/close button uses a circular glass style on iOS 26. A native glass capsule supplies the shared island background; this is app-composed navigation, not UIKit UITabBar. Earlier iOS uses native bordered controls; system Reduce Transparency remains authoritative. Android retains its existing opaque OCAT material and React Native controls. No dependencies, SDK or native inputs change.

Creation resolves stable source keys, never display names. All requires an explicit target. Computer flows carry the selected Host ID into the existing full-client route and refuse a different active Host. Cloud flows carry instance, account scope and Organization ID; refresh identity/ownership before opening the form and again before the mutation. An unmounted or dismissed preflight cannot navigate or initiate creation. Pending cloud creation uses the existing durable idempotency receipt and retries only on explicit action. After creation, navigate directly to the returned channel without concurrently refreshing the directory: channel opening and directory refresh use the same serialized CloudClient. Chats refreshes its directory on focus when the user returns. No new store, API, CLI command, permission or execution authority is introduced.

## Consequences

The iOS tab bar is now app-owned presentation. Native glass support does not prove layout, gestures or accessibility: exact-head shared-queue Simulator checks must qualify adjacent geometry, dismissal, safe area, large text and actual creation. Android, physical-device and screen-reader gates remain independent. The expanded menu uses a native rounded-rectangle glass backdrop on iOS 26, including with large text; Reduce Transparency, older iOS and Android retain opaque surfaces. This is the existing modal fade, not an asserted native glass morph animation. N3 adds Search only with functioning search behavior.

## Amendment: Android Material 3 (2026-10-19)

Android now follows Material 3 instead of sharing the island: the same JS tab navigator renders a docked flexible navigation bar (64dp, pill indicator) and creation moves to a FAB on Chats that opens a FAB menu. Routes, creation targets, preflight and dismissal rules above are unchanged. Expo UI 58 wraps only the baseline 80dp Compose `NavigationBar` and has no FAB menu, so both are React Native views drawn to the m3.material.io token values; revisit when Expo UI exposes `ShortNavigationBar` and `FloatingActionButtonMenu`.

## Amendment: Android floating navigation (2026-10-24)

Following the Human's M3 Expressive floating-toolbar reference, the Android navigation container now floats 16dp above the bottom safe area, inset 16dp from each horizontal safe edge, with full-pill corners and no elevation or shadow. It retains the opaque raised surface, destination labels and indicators, system text scaling, scroll hide/reveal, and the separate Chats creation FAB. This borrows the floating toolbar's container treatment for app-owned navigation; it does not turn destinations into toolbar actions. Lists reserve the detached bar's height and bottom gap, and the FAB and its menu move with that gap. Native Android visual and large-text qualification remains pending in the shared QA lane.

## Amendment — 2026-10-24: native Android navigation

Human feedback in #2669 replaces the Android floating navigation capsule with a native Compose Material 3 NavigationBar and NavigationBarItem. The existing two destinations and navigator remain authoritative. Because the pinned Expo bridge has no ShortNavigationBar or horizontal-layout prop, each native item receives horizontal icon-label content. This is an explicit adaptation, not a claim to use Expressive ShortNavigationBar. The Activity icon remains stable; its label displays the capped pending count in both selected and unselected states, with native fades disabled under Reduce Motion. Native measured height reserves list space and places the existing creation FAB above the bar. iOS remains unchanged. Native large-text, safe-area and TalkBack review is required before release.

### Native feedback refinement

Human feedback after #2672 supersedes the horizontal-content adaptation: Android now uses the native Icon and Label slots with the icon above a persistent label. Pending Activity replaces its icon with the capped count, retaining the Activity label and native selection indicator. Row left-swipe is removed on Android to leave vertical list scrolling with the list; long press retains a native action sheet with a centered conversation avatar/name header and three icon/label commands. iOS behavior is unchanged.
