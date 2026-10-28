# ADR-0271: iOS workspace pages retain the complete Chats shell

- Status: Proposed — native candidate for Human review
- Date: 2026-10-28
- Related: #3017, #3107; ADR-0235

## Context

The Human requires bidirectional, finger-driven switching between Workspaces and Chats on iPhone. The complete Chats page, including the app-owned tab bar, must move as one surface. Opening Workspaces to look around must retain the current environment, cached list, reading position and search.

The Mail-like native stack root removes Chats on pop and pushes a new route on return. Its independent tab-bar visibility and skeleton preview cannot retain that complete page. A compact navigation split view also adapts to stack navigation; forcing a regular size class on iPhone would change the system layout contract.

## Decision

Opt the iOS navigation surfaces into a stable UIKit `UIPageViewController` backend in the pinned `react-native-pager-view`, for retained React page trees: Workspaces, the complete tab navigator and tab bar (selected at launch), the last visited chat, and its profile. Search limits the eligible native pages without removing the React views. Native paging owns progress, cancellation and settling without per-frame JavaScript translation or a copied preview. This is an application-defined adjacent-page presentation using a native paged container, not a claim that UIKit supplies an iPhone drawer component.

The component holds presentation state only. Existing Host sessions, conversation caches, filters, workspace selection adapters and scoped route cleanup remain authoritative. Only an explicit environment selection invokes those adapters. Routed chats use the same paired chat/profile presentation. Each owns the existing UIKit native navigation bar and scroll-edge treatment. Profile children still use explicit-Host native-stack routes; their parent pages remain mounted. Paired profiles switch tabs only through the native segmented control, reserving body swipes for returning to chat. Android retains its current drawer.

The SwiftUI page-wrapper prototype failed the real normal-chat entry gate: its retained RNScreens navigation controller still belonged to a replaced page wrapper. Both view-tree discovery and owner-transfer compensation failed that gate. The UIKit backend gives each retained React page one stable child view controller. It is enabled only by the navigation wrappers; existing content tabs keep their vendor backend.

The navigation-bar title uses a native SwiftUI `Button` around the existing avatar/name content. A plain React press target allowed iOS 27's status-bar scroll-to-top action to fire alongside the profile action. Matched native round trips preserve the chat body with the native button, while a real status-bar tap still scrolls to the top. The original UIKit navigation bar, independent leading Back and transparent scroll-edge treatment remain; a masked native top material extends slightly below the bar.

## Consequences

- Chats does not unmount during a workspace visit, so its existing list and search state need no parallel cache or restoration store.
- The tab bar belongs to the moving Chats page and is absent from Workspaces throughout the gesture.
- The page trees stay mounted; lists remain virtualized and existing live Host subscriptions retain their owners. A hidden chat keeps its Conversation cache lease but does not take foreground ownership, mark messages read, consume shared files or rerender every timeline update. Validate memory and native performance rather than inferring them from the simpler React structure.
- Offscreen content is hidden from accessibility. Native escape and button paths remain available. Button navigation follows the live Reduce Motion preference.
- The pinned pager has an iOS native patch: at native drag start it cancels the ancestor React surface touch handler, as native stack navigation already does. Otherwise a fast drag can leave a row press active until release. This changes native inputs and requires a new iOS build; a JavaScript reload cannot qualify it. Android retains its existing page behavior; the optional codegen props have inert Android setters. Native navigation uses the same system pager for drag, cancellation and settling; Reduced Motion button commands are nonanimated.
- Native correctness, physical Release measurements and Human feel remain separate acceptance gates; source tests and Simulator recordings cannot qualify device FPS.

The UIKit backend retains its internal scroll view’s default bounce behavior: `UIPageViewController` uses that movement to discover neighboring pages. Turning it off freezes native horizontal navigation even when a valid next page is available. The original SwiftUI content-tab and Android overdrag paths remain unchanged.

Profile child screens bind `HostScope` at the navigator scene boundary, using the scene’s explicit Host, then that same navigator’s entry Host, then its established Profile source. Direct entry must not read a different globally selected Computer. A first nested child gets a native leading Back bar button that bubbles through the existing navigator; no synthetic Profile index or second Profile instance is inserted.
