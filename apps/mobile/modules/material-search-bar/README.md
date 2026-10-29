# Android Material search app bar

Local Expo UI extension wrapping Compose Material 3 `AppBarWithSearch` and
`ExpandedFullScreenSearchBar` with one shared `SearchBarState` and `TextFieldState`, registered
with `ExpoUIView` and rendered inside `<Host>`, as in Compose's
`FullScreenSearchBarScaffoldSample`. Android Chats uses it as its header.

Collapsed, it is a search pill with a navigation button at its start (the workspace drawer) and an
optional progress ring. Tapping the pill expands Compose's full-screen search dialog, which owns its
motion, keyboard focus and predictive Back. Collapsing clears the query.

The query streams to React as `onQueryChange`; React filters with the app's existing ranking and
sends the results back as plain records (`key`, `title`, `subtitle`, `initial`, `image`,
`dimmed`). `image` is a `file://` PNG from the device's avatar cache; Compose decodes it off the
main thread and draws it as the Chats row's 48dp rounded square, with `initial` as the fallback. Results render as
Material `ListItem`s inside the expanded surface, because that surface is a separate window that
React Native views cannot draw into. A pick sends `onPick` with the key and temporarily collapses the bar. Returning from the conversation restores the query, expanded results and scroll position. Explicitly closing search still clears the query. Empty results appear in the center of the native panel. Only actionable cache-read failures show a notice and retry action; coverage and unavailable-feature hints are omitted. Online and retained queries each wait for a 150 ms typing pause.

Colours come from the Host's Material theme seeded by the accent (ADR-0266); the view takes no
colour props. Host keeps its composition while React Native Screens detaches an inactive screen,
so the expanded search window collapses and is removed while the view is out of a window.

The older `material-search` module keeps the inline docked field for Activity and Marketplace; its
README explains why the state-based bar is not used for inline search.

A new Android development build is required. CI compiles and tests
`:material-search-bar:testDebugUnitTest`. iOS keeps its existing search.
