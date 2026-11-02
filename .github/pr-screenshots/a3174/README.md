# iOS Activity Inspector

Actual iPhone 18 Pro Max Simulator, iOS 27, Chinese. Images contain only isolated QA fixture data.

- before.png: historical pre-3159 two-tab entry, main d65f61fcb786; not the current main filter-menu baseline.
- list-dark.png, sheet.png, dark.png: source 2f5eecec0a4c, new Release native build, default Dynamic Type (large).
- large.png: same candidate, maximum accessibility Dynamic Type, dark.

The final main merge preserves the verified Activity runtime files. Native SwiftUI Inspector has no usable Expo Web render path. A direct old iOS menu open-state image is unavailable; the historical entry is labeled separately rather than presented as the exact current-base view.

PASS: single list, native medium/large Sheet, category selection/results, Bot/channel selection, unread toggle, sort selection, dismissal persistence, search query/clear and default/max layout.
UNTESTED: toolbar Close/Reset actual taps (Device Hub omits toolbar AX and coordinate interaction failed), physical iPhone, iPad, older iOS, VoiceOver and full intermediate-size matrix. No physical FPS or hitch claim.

Temporary pairing revoked; original pairings preserved; settings restored; owned Simulator/Host released.
