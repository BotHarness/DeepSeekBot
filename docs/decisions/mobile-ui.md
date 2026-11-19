---
Publish: true
---

# Mobile app UI: navigation, design system, motion and native timelines

How the phone app presents Chats, Activity, Settings, and Workspaces, and how each platform renders and moves through a Channel's conversation. The [BotHarness architecture](../architecture/botharness-architecture.md) explains how these surfaces fit together. [Messaging](messaging.md) covers Channel authority, and [Connections](connections.md) covers Host transport and pairing. See [the mobile design guide](../../apps/mobile/DESIGN.md) for screen and component rules and [GLOSSARY.md](../../GLOSSARY.md) for product and native component terms.

Two rules run through every section:

- **The phone owns presentation.** Navigation state, styling, viewport geometry and text playback can change independently of Host authority, Channel history and credentials.
- **Each platform owns its controls and geometry.** The app shares semantic roles and message identities. Native components own gestures and positioning where the app delegates them.

## 1. Chats, Activity and Settings are tab destinations

<a id="adr-0211"></a>
<a id="adr-0272"></a>

_Formerly ADR-0211 and ADR-0272._

Expo Router JS tabs own Chats, Activity and Settings. Settings selects its own page, which uses the iOS native-stack large title or the Android fixed top app bar. `SettingsView` uses the overlay surface. Its child pages, including Profile, Usage, Models, Notifications, Storage, App icon, Activity counts and Chat background, push onto the app stack under `/settings/…`. The tab bar belongs to the top-level pages. ADR-0272 supersedes ADR-0211's two tabs and avatar-triggered Settings form sheet.

Workspaces opens from the Chats navigation control. Android keeps a navigation drawer and iOS uses the retained Workspaces page described [below](#adr-0273). Chats matches conversation names locally and also searches messages across the applicable Computer scope. In a Computer Environment, Chats projects the Host's Channel section arrangement, including pinned and loose rows. Collapse is stored on the phone per Host. ADR-0211 specified an inline name filter and deferred message search.

Notification and interrupted-processing entry use the Host-scoped Channel route identity. A new destination keeps its origin, and an existing destination unwinds to its retained route. A focused message is a parameter on the same route. Notification entry serializes Host switches and cancels stale intents. Explicit workspace selection resets scoped detail and sheet history after success and preserves the tab route. Cloud selection adds the scoped Cloud list. Account and pairing changes remove invalid routes. Ordinary notification entry leaves the workspace stack intact.

Why: a selected tab has its own place in navigation, and one Host-scoped route per conversation preserves Back behavior during message jumps and workspace changes.

Enforced by: [bottom-navigation.test.tsx](../../apps/mobile/test/bottom-navigation.test.tsx), [settings-tab-page-android.test.tsx](../../apps/mobile/test/settings-tab-page-android.test.tsx), [message-search.test.ts](../../apps/mobile/test/message-search.test.ts), [conversation-sections.test.ts](../../apps/mobile/test/conversation-sections.test.ts), [push-navigation.test.tsx](../../apps/mobile/test/push-navigation.test.tsx) and [workspace-navigation.test.tsx](../../apps/mobile/test/workspace-navigation.test.tsx).

## 2. Creation shares the tab navigator

<a id="adr-0235"></a>

_Formerly ADR-0235._

Creation is an action beside the iOS app-owned tab island and a Material 3 FAB on Android Chats. iOS destinations use SwiftUI buttons, with a selected glass capsule on iOS 26 and later and a filled capsule on earlier versions. The creation pull-down button now uses a native UIKit `UIButton` and `UIMenu`. This replaces the ADR's transparent native modal and expanded glass menu. Android uses a docked Compose `NavigationBar` with `NavigationBarItem` icon and persistent label slots and a separate FAB menu. Activity retains its icon with a visual dot and exposes the capped count in its accessibility description, replacing the count-in-icon amendment. The measured Android navigation bar reserves list space and positions the FAB.

Creation actions use stable Host IDs or cloud account scope and Organization IDs. All exposes a target choice where the action needs one, either in the menu or in the native form. Bot creation and import open native flows on both platforms. Android exposes a native Group creation form on a Computer Environment. These replace the full-client route specified in the ADR. Cloud creation checks account identity and Organization ownership before opening the form and again before submitting. Retired navigation intents cannot open the form after preflight. Pending cloud creation reuses its idempotency receipt on explicit retry. On success the form opens the returned Channel. Chats refreshes the directory when it regains focus.

Why: creation has the appropriate platform control and keeps selection, Back and authority with the existing navigator and target.

Enforced by: [bottom-navigation.test.tsx](../../apps/mobile/test/bottom-navigation.test.tsx), [creation-menu-items.test.tsx](../../apps/mobile/test/creation-menu-items.test.tsx), [creation-fab-menu-android.test.tsx](../../apps/mobile/test/creation-fab-menu-android.test.tsx), [channel-creation-screen.test.tsx](../../apps/mobile/test/channel-creation-screen.test.tsx), [prepare-creation.test.ts](../../apps/mobile/test/prepare-creation.test.ts) and [cloud-create-channel-screen.test.tsx](../../apps/mobile/test/cloud-create-channel-screen.test.tsx).

## 3. Share content roles and use platform tokens for native chrome

<a id="adr-0201"></a>
<a id="adr-0266"></a>

_Formerly ADR-0201 and ADR-0266._

- **Shared.** The light and dark DSH palette lives in `packages/host-client/src/ui/design/palette.generated.ts`, which supersedes the mobile-local path in ADR-0201. The phone's `src/ui/design/tokens.ts` supplies spacing, radii, typography fallback and control sizes. The minimum touch tokens are 44 pt on iOS and 48 dp on Android. `useDesignTheme()` resolves the device scheme and Appearance overrides, including an accent with readable foreground. Chat backgrounds remain conversation presentation. Regenerate after a DSH theme change with `pnpm --filter @botharness/mobile generate:palette`.
- **Android.** `material-tokens.ts` reads Material roles with `useMaterialColors` seeded from the resolved accent and scheme. `materialType` maps the meta, body, title and display roles to `bodySmall`, `bodyMedium`, `titleMedium` and `headlineSmall`. Native controls can inherit shape, elevation and state behavior from Expo UI `Host`. The brand seed remains the default. The ADR's prospective system dynamic colour choice is outside the current Appearance resolver.
- **iOS.** `system-tokens.ts` supplies semantic label, background, separator and fill colours. `systemType` maps the same text roles to `footnote`, `body`, `headline` and `title1`. Native controls can use the system tint and Dynamic Type. Content can use the shared accent and colours.

Use platform or shared tokens in platform-specific UI files. Reuse the owning primitive for message actions and accessibility. The transient Session-maintenance controller is scoped to the Host client, so compact and new Session actions share pending state across surfaces.

Why: shared roles keep content legible across schemes and preserve product identity, while native chrome follows the platform's current appearance and text settings.

Enforced by: [design-tokens.test.ts](../../apps/mobile/test/design-tokens.test.ts), [platform-tokens.test.ts](../../apps/mobile/test/platform-tokens.test.ts), [style-guard.test.ts](../../apps/mobile/test/style-guard.test.ts) and [session-maintenance.test.ts](../../packages/client/test/session-maintenance.test.ts).

## 4. Motion roles use platform springs

<a id="adr-0264"></a>

_Formerly ADR-0264._

Use `spring.spatial` for movement or size and `spring.effects` for opacity or colour, with `fast`, `default` and `slow` roles. Use `spring.release` for a released drag. It uses the default spatial stiffness and mass with critical damping. `motion.ts` and `motion.android.ts` resolve the tables in `tokens.ts` through `motion-springs.ts`. The resolver follows system Reduce Motion. Reanimated layout builders use `springy` to apply these settings.

iOS spatial roles derive from SwiftUI-style springs with durations 0.35, 0.5 and 0.7 seconds. Fast spatial uses bounce 0.15. The other spatial roles and all effects use zero bounce. Android Material 3 Expressive spatial roles use damping ratios 0.6, 0.8 and 0.8 and stiffnesses 800, 380 and 200. Effects use damping ratio 1 and stiffnesses 3800, 1600 and 800. Native navigation, sheets and menus own their transitions. Time-driven effects such as streaming text reveal and long-press lift retain their own timing.

Why: shared roles express the intent of an animation, while platform curves and system accessibility settings determine how it moves.

Enforced by: [motion-springs.test.ts](../../apps/mobile/test/motion-springs.test.ts).

## 5. Gestures move retained native scenes

<a id="adr-0271"></a>
<a id="adr-0273"></a>

_Formerly ADR-0271 and ADR-0273._

Android conversation profiles use the actual Bot, Group or pair profile in `EndSheetView.kt` with Material `SideSheetBehavior`. In full-width mode the conversation, its identity chip and Back control, and the composer move together. Native code owns drag and settling and sends opening and settled state to React. Replyable rows and the system Back edge keep their gestures. Once expanded, the profile owns its content gestures. Profile subscriptions follow both visibility and route focus. The route and sheet use the scoped profile controllers, and a successful file-to-message action reveals the conversation. Activity registers a separate modal side sheet above the tabs, with a native dismissible scrim, fixed title and Close action. The IME gets Back before the side sheet. ADR-0271 was marked Proposed, and these paths are wired in current source.

On iOS, `WorkspacePager` enables the patched `react-native-pager-view` stable `UIPageViewController` backend. Workspaces, the complete Chats shell including its tab bar, the last chat and its profile occupy adjacent pages. Chats is selected at launch. Search and the selected tab limit paging while the page trees remain mounted. The native pager owns progress, cancellation and settling. Keep its internal scroll view's bounce so UIKit can discover adjacent pages. The patch cancels the ancestor React surface's pending touch at native drag start. This requires the patched native build. Button navigation follows Reduce Motion.

Only explicit workspace selection changes the Environment. Hidden chats retain their conversation cache lease while giving up foreground subscription, read and shared-file handling. Routed chat and profile pairs retain the UIKit navigation bar and use a SwiftUI title button for profile entry. This keeps that action distinct from the system status-bar scroll-to-top gesture. Paired profiles use the native segmented control, and child routes resolve the scene Host first, then the navigator's entry Host, then the profile source. A directly opened first child uses a leading native Back action. ADR-0273 was marked Proposed. The navigation wrappers enable the backend in source and device qualification remains a separate gate.

Why: moving the real scenes keeps list position, search and profile state available through a cancelled drag or a return visit.

Enforced by: [profile-visibility.test.tsx](../../apps/mobile/test/profile-visibility.test.tsx), [end-sheet-back.test.tsx](../../apps/mobile/test/end-sheet-back.test.tsx), [activity-sheet-root.test.tsx](../../apps/mobile/test/activity-sheet-root.test.tsx), [workspace-pager.test.tsx](../../apps/mobile/test/workspace-pager.test.tsx), [profile-navigation.test.tsx](../../apps/mobile/test/profile-navigation.test.tsx) and [profile-host-source.test.ts](../../apps/mobile/test/profile-host-source.test.ts).

## 6. Android RecyclerView owns inverted coordinates and exact landing

<a id="adr-0319"></a>
<a id="adr-0320"></a>

_Formerly ADR-0319 and ADR-0320._

Android uses newest-first rows and an inverted `RecyclerView`, with the newest edge at offset zero. It is the only Android conversation list. ADR-0320 superseded the FlatList target experiment in ADR-0319 and removed `EXPO_PUBLIC_MESSAGE_JUMP`. The rollout also removed `EXPO_PUBLIC_CHAT_LIST` and `EXPO_PUBLIC_NATIVE_ROWS`.

`ChatRecyclerView` owns scrolling, holders and stable native IDs allocated per row key. Its React window includes eight rows of overscan on either side where available and has a cap of 128 indices. React mounts cells within that window and reports their Yoga heights. Eligible committed text rows use native bubble layout. Drafts, the latest message, and rows with unsupported content or active selection remain React rows. A prefix-sum index supports height updates and offset lookups. Native restores the row key and decorated position while browsing, and restores offset zero while following. Native IME padding updates separately from the composer.

A message jump targets a row identity after the existing pagination and intent handling. The recycler clamps placement to native content bounds, waits for the target's measured height, and withholds that row from visibility acknowledgement while the jump is pending. User drag cancels the jump. Menus and send-flight measurements use actual Android view bounds, mapping ancestor transforms and offsets on the supported API range. For a speaker run, the React avatar sits in a native-positioned layer, constrained by the first and last bubble and the composer. Native text rows emit anchored tap, long-press and reply-swipe actions. JavaScript suppresses tap and long-press actions when the keyboard is up and the list policy requires it.

Why: native holders and measured bounds keep scrolling and exact message landing with the same coordinate owner, including when React cells are reparented.

Enforced by: [chat-recycler.test.tsx](../../apps/mobile/test/chat-recycler.test.tsx), [native-text-row.test.ts](../../apps/mobile/test/native-text-row.test.ts), [follow-latest.test.tsx](../../apps/mobile/test/follow-latest.test.tsx). Native geometry fixtures include [RecyclerHeightsTest.kt](../../apps/mobile/modules/latest-anchor/android/src/test/java/expo/modules/latestanchor/RecyclerHeightsTest.kt) and [ChatRecyclerViewTest.kt](../../apps/mobile/modules/latest-anchor/android/src/test/java/expo/modules/latestanchor/ChatRecyclerViewTest.kt).

## 7. Android Markdown block windowing is a presentation experiment

<a id="adr-0321"></a>

_Formerly ADR-0321._

The JavaScript baseline projects completed, measured Markdown blocks against a viewport with two viewport heights of overscan on each side. Consecutive hidden blocks become equal-height space. The viewport needs the shared Fabric content surface, so recycled rows do not use that JavaScript projection. Native text bubbles use the Android RecyclerView renderer's own layout.

`EXPO_PUBLIC_MARKDOWN_WINDOW=native` selects the optional `MarkdownBlockWindow` wrapper when the installed module exists. For eligible React-rendered blocks it uses measured block bounds and an enclosing scroll container's transformed bounds. It retains two viewport heights of overscan and reports visibility changes with logical dimensions for placeholders. The streaming tail keeps its identity and stays mounted. Width and font scale remount the document, and changed completed source changes the wrapper key. Unsupported completed blocks, active Android accessibility services, API levels below 29 and unusable native geometry retain the full content. The native candidate remains opt-in for matched device testing.

Why: the window can reduce mounted paragraph work while preserving layout, parser behavior and message text.

Enforced by: [markdown-window.test.ts](../../apps/mobile/test/markdown-window.test.ts), [markdown-window-layout.test.tsx](../../apps/mobile/test/markdown-window-layout.test.tsx), [markdown-block-window.test.tsx](../../apps/mobile/test/markdown-block-window.test.tsx). Native geometry fixtures include [MarkdownBlockWindowViewTest.kt](../../apps/mobile/modules/stream-reveal/android/src/test/java/expo/modules/streamreveal/MarkdownBlockWindowViewTest.kt).

## 8. Text playback keeps speaker order in JavaScript

<a id="adr-0322"></a>

_Formerly ADR-0322._

The conversation playback controller selects the first unfinished reply per speaker in queue order. Different speakers can advance on the same frame. The controller binds a draft to its committed message, holds visible text while reading history, flushes playback on backgrounding and cancels the scheduled frame on final unsubscribe. Each bubble receives its displayed text through the same JavaScript publisher.

JavaScript is the default engine. On Android, `EXPO_PUBLIC_TEXT_PLAYBACK=native` with the `TextPlayback` Expo module selects a per-conversation native clock and per-entry players. The clock advances only the players selected by JavaScript for one frame, then returns the frame token to the publisher. The native engine uses Android ICU grapheme boundaries and retains reserve, warmup, punctuation pauses, bounded release, correction and flush. Unicode and frame pacing remain part of matched native A/B qualification.

Why: one conversation owner preserves ordering and row identity across draft and committed messages, regardless of the pacing engine.

Enforced by: [conversation-playback-order.property.test.ts](../../apps/mobile/test/conversation-playback-order.property.test.ts), [conversation-playback.test.ts](../../apps/mobile/test/conversation-playback.test.ts), [playback-runtime.test.ts](../../apps/mobile/test/playback-runtime.test.ts), [text-playback.test.ts](../../apps/mobile/test/text-playback.test.ts). Native pacing fixtures include [TextPlaybackTest.kt](../../apps/mobile/modules/stream-reveal/android/src/test/java/expo/modules/streamreveal/TextPlaybackTest.kt). The property checks the frame selection and visible text against generated conversations, using the first unfinished reply in each speaker's transcript as its expectation.

## 9. iOS stays top-down and specifies precomputed collection layout

<a id="adr-0323"></a>
<a id="adr-0324"></a>

_Formerly ADR-0323 and ADR-0324._

The iOS timeline renders oldest first and newest at the bottom, without a flipped scroll or row transform. The current `ChatList` uses an animated React Native `FlatList`, with the separate native `LatestAnchor` and `StreamSurface` adapters when available. The existing follow and anchor paths hold the visible position when older history arrives and keep the newest edge in view while following.

The accepted native-list spec chooses UIKit `UICollectionView` with a custom layout and precomputed row sizes. It addresses JavaScript-to-native operations by message identity or logical oldest and newest edges. The planned layout parses Markdown with md4c and lays out attributed text off the main thread, caching by message identity, displayed-content generation, width, font scale and theme. Each displayed text change advances the generation, including a draft or streamed playback without a Host revision. Cell binding uses cached layout. Integrating iOS `LatestAnchor` and `StreamSurface` into that layout remains part of the spec.

Why: top-down geometry works with iOS scroll-edge effects, automatic insets, VoiceOver order and interactive keyboard dismissal. Precomputed layout keeps text measurement out of cell binding in the proposed native list.

Enforced by: [follow-latest.test.tsx](../../apps/mobile/test/follow-latest.test.tsx), [follow-latest-gestures.test.tsx](../../apps/mobile/test/follow-latest-gestures.test.tsx) cover the current anchor behavior. Native anchor fixtures live in [LatestAnchorTests.swift](../../apps/mobile/modules/latest-anchor/ios/Tests/LatestAnchorTests.swift).
