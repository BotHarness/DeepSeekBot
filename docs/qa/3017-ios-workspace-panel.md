# iOS workspace panel device checks for #3017

Chats on iOS sits on top of the workspace panel, which is the root of the Chats navigation stack ([DESIGN.md](../../apps/mobile/DESIGN.md#ios-workspace-panel-3017)). The cloud session that built it has no Simulator. These rows go to the Mac/iOS lane through [shared device QA](../agents/device-qa.md). Record each result with the build revision, device and OS.

| #   | Device and OS            | Steps                                                                         | Expected                                                                                                             |
| --- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | iOS 26 Simulator, iPhone | Cold start the dev build with two paired Computers.                           | Chats shows first, with no visible push. The Workspaces page is underneath.                                          |
| 2   | iOS 26                   | On Chats, swipe right from the middle of the list.                            | The native interactive pop follows the finger and reveals Workspaces; letting go early springs back to Chats.        |
| 3   | iOS 26                   | On Workspaces, tap All, then a Computer, then a Cloud workspace.              | Each pushes that view's Chats with the native push. The Cloud workspace opens its Cloud channel list above the tabs. |
| 4   | iOS 26                   | Swipe a Host conversation row left; scroll the list vertically.               | Row actions open; no pop starts. Vertical scrolling never starts a pop.                                              |
| 5   | iOS 26                   | Tap the Chats tab while Chats is showing.                                     | Chats stays; the panel is not revealed.                                                                              |
| 6   | iOS 26, VoiceOver on     | Focus the Chats title, then double-tap. Use the two-finger scrub on Chats.    | It reads "Back to workspaces, <view>". Both actions reveal Workspaces, which reads its "Workspaces" heading.         |
| 7   | iOS 26                   | Open a notification for a conversation from a cold start, then go back twice. | The conversation opens; Back goes to Chats, then to Workspaces.                                                      |
| 8   | iOS 26                   | Long-press the app icon and use a quick action, then go back twice.           | Same as row 7.                                                                                                       |
| 9   | iOS 18 or earlier        | Swipe right from the left edge of Chats; tap the Chats title.                 | Both reveal Workspaces with the native pop.                                                                          |
| 10  | iOS 26                   | Open Activity and swipe from its left edge; open Settings → Workspaces.       | The floating Liquid Glass sidebar still opens there.                                                                 |
| 11  | iOS 26, light and dark   | Default, intermediate and maximum Dynamic Type on Workspaces and Chats.       | The large title, tabs and rows wrap and stay reachable above the tab bar.                                            |

The demo decides whether the floating sidebar retires on iOS 26 and what replaces it on earlier iOS.
