# Native Inspector

An iOS-only Expo SwiftUI view bridging `View.inspector(isPresented:content:)`.
Its child is the native filter Form. A small presentation anchor sits beside the retained React Native list; it never reparents the list into a SwiftUI navigation container.
Presentation and filter state remain in React; interactive dismissal reports to the same owner.
SwiftUI owns compact Sheet adaptation, detents, dismissal, Dynamic Type and motion.
iOS 16 uses a native Sheet fallback. Android keeps its Material modal side sheet.

This module requires a new native build. It does not access Host data or retain filter state.
