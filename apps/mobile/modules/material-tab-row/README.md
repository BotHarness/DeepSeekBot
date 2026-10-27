# Android Material primary tab row

Local Expo UI extension wrapping the Compose Material 3 `PrimaryTabRow` with text `Tab`s. The
Activity tabs and the workspace drawer's Computers / Cloud tabs use it (#3013), through
`src/ui/primitives/primary-tab-row.android.tsx`.

It follows [Extending with Jetpack Compose](https://docs.expo.dev/guides/expo-ui-jetpack-compose/extending/):
the view is registered with `ExpoUIView` and rendered inside an Expo UI `Host`, so its colours,
type and motion come from the Host's Material theme (seeded with the brand accent). It sets no
colour of its own except the optional `containerColor`, the canvas the row sits on.

- The indicator is Material's `PrimaryIndicator`, animating to the selected tab. A `selected` value
  outside the tabs selects nothing and hides the indicator.
- Each tab is at least 48 dp tall; its label stays on one line, grows with font scale and ends in an
  ellipsis when it does not fit. The Host measures the row (`matchContents`), so React Native gives
  it the height it needs.
- TalkBack hears each tab as a Tab with its selected state and its full `accessibilityLabel`
  (default: the label), whatever the visible truncation. An optional `dotColor` shows a small
  Material `Badge` dot after the label (no number); say what it means in `accessibilityLabel`.
- Pressing a tab sends `onTabSelect` with its value; the test tag is `tab-<value>`.

A new Android development build is required. CI tests `:material-tab-row:testDebugUnitTest`.
iOS keeps its own tab views.
