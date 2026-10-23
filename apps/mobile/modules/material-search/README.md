# Android Material search

Local Expo view wrapping Compose Material 3 `SearchBar` and `SearchBarDefaults.InputField`.
Search stays inline with each screen's virtualized results. Chats and Activity expose a native
back button; model pickers keep their existing sheet navigation. Marketplace also uses this view, preserving its test ID, 100-character limit and submit callback.

SDK 58 Expo UI's SearchBar exposes only `onSearch`, with no controlled query or live query-change
event. This adapter supplies those events for the existing live filters. Native edits carry a
monotonic event count so a delayed React update cannot replace newer IME text. Query echoes do
not replace the native text field; theme and text-size changes keep its composition and focus.

Colors come from the app's theme; shape, typography, input, clear/back icon buttons and ripple
come from Material 3. System font scaling stays enabled. Compose owns Back handling and its
composition is disposed when its view detaches, including its Back handler.

A new Android development build is required. CI compiles and tests `:material-search:testDebugUnitTest`.
Native acceptance follows `phone-android-interactions.md` → `material-search`, through the
shared Windows Android QA queue. iOS continues using its existing search adapter.
