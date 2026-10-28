# ADR-0270: iOS workspace pages retain the complete Chats shell

- Status: Proposed — native candidate for Human review
- Date: 2026-10-28
- Related: #3017, #3107; ADR-0235

## Context

The Human requires bidirectional, finger-driven switching between Workspaces and Chats on iPhone. The complete Chats page, including the app-owned tab bar, must move as one surface. Opening Workspaces to look around must retain the current environment, cached list, reading position and search.

The Mail-like native stack root removes Chats on pop and pushes a new route on return. Its independent tab-bar visibility and skeleton preview cannot retain that complete page. A compact navigation split view also adapts to stack navigation; forcing a regular size class on iPhone would change the system layout contract.

## Decision

Use the existing `react-native-pager-view` iOS implementation, a SwiftUI `TabView` with page style, for two permanently mounted React page trees. Workspaces is first; the existing tab navigator and tab bar are second, selected at launch. Native paging owns progress, cancellation and settling without per-frame JavaScript translation or a copied preview. This is an application-defined adjacent-page presentation using a native paged container, not a claim that UIKit supplies an iPhone drawer component.

The component holds presentation state only. Existing Host sessions, conversation caches, filters, workspace selection adapters and scoped route cleanup remain authoritative. Only an explicit environment selection invokes those adapters. The normal chat/profile navigation stacks remain unchanged; paging is disabled off the Chats root. Android retains its current drawer.

## Consequences

- Chats does not unmount during a workspace visit, so its existing list and search state need no parallel cache or restoration store.
- The tab bar belongs to the moving Chats page and is absent from Workspaces throughout the gesture.
- Both trees stay mounted; lists remain virtualized and existing live Host subscriptions retain their owners. Validate memory and native performance rather than inferring them from the simpler React structure.
- Offscreen content is hidden from accessibility. Native escape and button paths remain available. Button navigation follows the live Reduce Motion preference.
- The pinned pager has an iOS native patch: at native drag start it cancels the ancestor React surface touch handler, as native stack navigation already does. Otherwise a fast drag can leave a row press active until release. This changes native inputs and requires a new iOS build; a JavaScript reload cannot qualify it. Android native code is unchanged.
- Native correctness, physical Release measurements and Human feel remain separate acceptance gates; source tests and Simulator recordings cannot qualify device FPS.
