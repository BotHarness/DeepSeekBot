# Mobile UI/UX rules

This is the target design of the DeepSeekBot mobile app. Every new or changed screen follows it. Tokens and theming are in [ADR-0201](../../docs/adr/0201-the-mobile-design-system-maps-web-roles-onto-native-components.md); this file covers structure, screens, components and code rules.

References:

| App       | What we use from it                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manus     | The chat: one Bot is one contact, the conversation reads like IM, and action cards sit in the chat.                                                                                          |
| Grok Bot  | Bots and group chats in one list, with separate "needs you" and "new result" states. Approval cards with **Allow once / Always allow / Deny**, and the Human taking over the Bot's computer. |
| Meta Muse | A Bot profile whose identity and memory are visible and editable.                                                                                                                            |
| Slack     | Workspace switching, a row of shortcut cards on Chats, an Activity feed with filters, and agent steps with a Stop button.                                                                    |

## Structure

The shell is set by [ADR-0211](../../docs/adr/0211-the-mobile-app-has-two-tabs-with-settings-and-hosts-in-the-header.md): what the Human does most sits under the thumb, and what they do rarely sits in the header.

- **Hosts are workspaces.** Each paired computer is a Host.
  - The app stays connected to every paired Host at once.
  - The Chats list and every chat show one Host at a time. The Chats header has a Slack-style band in the accent colour (a muted accent in dark mode); the list sits on a panel with rounded top corners below it.
  - The **Host chip** at the top left shows the Host's initial tile, its name and ▾. Tapping it opens the **Host drawer**.
- **Host drawer** switches Hosts. It slides in from the left, covers about 85% of the width and dims the list behind it.
  - It lists each Host with its initial tile, online or offline status and pending count, the current one marked, plus "Pair a new computer", which opens the pairing flow.
  - The Host chip opens it, and so does a swipe right from the left edge of a tab's root screen. The edge swipe is never attached inside a pushed chat, where it stays the system Back.
  - Tapping a Host switches to it and closes the drawer. Tapping the backdrop or swiping left closes it.
  - It takes screen-reader focus when it opens and returns focus to the Host chip when it closes. With Reduce Motion on it appears without sliding.
  - Android uses the standard Material navigation drawer with the same contents.
- **Tabs** are native (`NativeTabs`): **Chats** and **Activity**, plus the system search tab on iOS.
  - Activity carries a badge with the Human Inbox action count.
  - The search tab (`role="search"`) comes last. iOS 26 draws it as a separate round glass button at the bottom right, beside the tab capsule.
  - A chat is pushed above the tabs, so the tab bar hides while it is open.
  - iOS draws the system tab bar with no background colour of ours: Liquid Glass on iOS 26 (a floating capsule above the home indicator, with the system's glass pill behind the selected tab), the translucent system bar before it. The selected tint is the resolved `fg`, passed as a plain colour so the bar re-tints when the scheme changes while the app is open. Minimize on scroll stays off.
  - Content scrolls under the bar. Each tab's list sets `contentInsetAdjustmentBehavior="automatic"`, so its last row clears the bar and the home indicator.
  - Android keeps two Material 3 tabs on `base`: like Slack, the selected tab is the foreground colour with a pill behind its icon (the Material indicator), and the others are muted.
  - The web preview draws a floating translucent capsule with the two tabs, standing in for the glass, with the selection bubble behind the whole item (icon and label) as iOS draws it, and a round search button beside it.
- **Chats** shows the current Host:
  - The header has the Host chip on the left, and on the right a compose button and the Human's avatar.
    - Compose opens a native menu: **New PersonaBot** and **New Channel**. They open the app's create flow, or the full client where the app has none yet. Android has no compose button in the header; a Material FAB at the bottom right, above the tab bar, opens the same menu.
    - The avatar opens **Settings**. Until the Human has an avatar of their own it shows their initial on a neutral layer fill.
  - A row of shortcut cards: **Needs you** and **Working**, each an icon, a name and a count that filters the list when tapped. The filter applies across all Channel sections. **Unread** joins them once the Host reports unread counts.
  - One list of PersonaBot DMs and Channels together, grouped by the Host's **Channel sections** as on the desktop sidebar:
    - Sections come in the desktop's order. Ungrouped DMs and Channels sit between them in the desktop's top-level order.
    - A section header shows its name and Channel count and collapses or expands on tap. A collapsed section still shows a "Needs you" mark when something inside needs the Human. The collapse state is kept on the phone, per Host.
    - Hidden Channels stay out of the list. Pins and the sort mode follow `CONTEXT.md`.
    - Changes made on the desktop show when the roster refreshes. Creating, renaming, reordering and moving Channels between sections stays on the desktop for now.
    - A Host with no sections shows one flat list by latest activity.
- **Search** finds a PersonaBot or Channel on the current Host:
  - On iOS the search tab opens with the field at the bottom, above the keyboard. Android has a search bar at the top of Chats.
  - It matches PersonaBot display names and Channel titles on the device, and a result opens its chat. When nothing matches it says so. Message full-text search is not part of it.
- **Activity** is the Human Inbox across all Hosts:
  - Filter chips with counts: All / Needs my action / Mentions & replies / Handled, and a Bot row once more than one Bot is listed. They match the Web Client Inbox's categories and Bot filter; a Host filter comes with more than one Host.
  - Section headers stick to the top while their items scroll and show the section's count.
  - Every item carries its Host and can be decided in place, on the same cards as the chat.
  - Posts and rows are separated by space and layer fills, not divider lines.
  - A row's title is `category · Bot`; a reply keeps its text on a second line, and a handled item collapses to one line: `category · Bot · summary`.
  - Opening an item jumps to the card in its chat.
- **Settings** is a form sheet with a large detent, opened from the avatar, and closed by swiping down or the close button. It reuses the settings row and section components, in groups:
  - **Connections**: Computers (paired Hosts, their status and unpairing, with the same confirmation and error notice as before), Notifications, and Open full client.
  - **Interface**: Appearance (scheme, accent, chat wallpaper).
  - **Chats**: Channel sections and Hidden Channels, each pushing its own screen.

## Screens

**Conversation row**

- A 48pt avatar: the Bot's round avatar with its state ring, or a rounded square with `#` for a Channel.
- First line: title, IM channel badges and time.
- Second line: a one-line preview.
- "Needs you" (a warning `!`, with the count when more than one) takes priority over unread (an accent count).
- A working Bot's preview reads "Working…".
- Swipe for pin and mute; long-press opens a native menu.

**Chat**

- Header: back, a centered avatar and name pill that opens the Bot profile, and the Bot's computer on the right.
- Messages:
  - An inverted list. Messages from the same author within 5 minutes form a group, and a time separator appears after a 30-minute gap.
  - Bot bubbles are `surface`. Human bubbles are `accent` with `onAccent` text.
  - In a DM, `accent` is that Bot's primary colour (`AccentProvider` with `botColor`), so each Bot's chat has its own Human bubble colour.
    - A colour too close to the chat background or the Bot bubble (under 1.3:1 against `base` or `surface`, such as black hair in dark mode) is first mixed toward `fg` until it separates from both.
    - Message text on it always reaches 4.5:1. A light colour (white under 3:1, such as yellow) keeps its value and takes dark text. Any other colour takes white text and is darkened just enough for white to reach 4.5:1.
  - Bubbles use radius `lg` and are at most 80% wide.
  - Attachments sit inside the bubble: images as rounded thumbnails (one large, or a grid of squares), other files as a row with an icon, name and size. Tapping an image opens a full-screen viewer; tapping a file downloads it from the Host and opens the share sheet.
    - The viewer follows the Photos app: pinch zooms around the fingers (up to 5×, springing back to fit below 1×), double-tap zooms to 2.5× at the tapped point and back, one finger pans a zoomed image, a vertical swipe at fit size closes it with the backdrop fading, and a single tap hides or shows the close and share buttons. The close button, Android back and the iOS escape gesture also close it.
  - Reactions are small pills under the bubble, on its side: the emoji and its count, the Human's own in `chosen` with an accent edge. Tapping one adds or removes the Human's reaction. A Bot's reaction-only answer shows here with no reply bubble.
  - Long-press a bubble to open its menu, a sheet from the bottom: a row of quick reactions (👍 ❤️ 😂 🎉 👀 ✅, the Web Client's set), then **Copy** for a message with text, and **Cancel**. A message that is still sending, failed, or is a card has no reactions, so its menu is Copy alone. Bubble text is not selectable, so the long-press always reaches this menu.
  - Delivery: pending shows at 70% opacity, failed offers "Not sent · Tap to retry", and sent shows nothing.
- **Action cards** sit in the chat stream, and the same rules apply wherever they appear (DM, Activity, Human Inbox, web Inbox). Show only what the Human needs to decide; everything else waits behind Details.
  - Layout, top to bottom:
    1. A header row: the category on the left (Terminal, Browser, Files, Tool, or the question's header), and a status pill on the right ("Needs you", `warningSoft` with `warning` text) while the request is open. There is no eyebrow, and the Bot's name is not repeated.
    2. One key sentence saying what is asked ("Run this command", or the question itself).
    3. An optional preview on the `well` layer: the command in mono, at most two lines.
    4. **Details**, collapsed by default and expanded in place. It holds the tool, working folder and every argument on the `well` layer. There is no separate sheet.
    5. The buttons.
  - Card kinds:
    - **Question**: lettered options in one `well` group, with dividers between rows. A single choice answers on tap, with no Submit. Multiple choice or several questions end with Submit. In a DM the Other answer field becomes "Or reply in the chat below.", and a message sent while one single-part question is open answers it.
    - **Tool approval**: Allow once / Always allow / Deny.
    - **Takeover**: a computer screenshot, then Take over / Done / Not now.
  - Buttons are pills with no outline. The primary is a neutral high-contrast fill (`fg` with a `base` label), the secondary a subtle solid fill one step off the layer, and Deny a red label on the layer's `danger` tint. A card has at most one primary. Three or more decisions stack full width (primary first, destructive last); two sit in a row, sized to their labels.
  - No keyboard shortcut hints, no explanatory boilerplate, and no paths or ids outside Details.
  - Regions are told apart by layer fills, not borders. The card is `raised` with no outline, and an outline appears only on the focused card (`edge.focus` in the accent).
  - A decided card collapses to one line: a coloured dot, then "subject · outcome" (for example "bash · Allowed once"). A card decided on another device or expired says so.
- While the Bot works, a status strip above the composer shows the current step and a **Stop** button. Tapping it shows the steps.
- The composer is a pill: **+** for attachments, the placeholder "Message {Bot}", and a mic that becomes Send once there is text.
  - With one trailing button (the mic or Send) the pill is one row: **+**, the field and the button, bottom-aligned as the field grows. When the text no longer fits that one row, or with more (attached files, or the mic next to Send), it stacks like the web composer: the field on top at full width, and a row below with **+** (or **×**) on the left and the buttons on the right.
  - **+** opens Photos, Camera and File below the pill. Picked files show as removable tiles inside the pill, up to 10 per message. Send appears once there is text or a file.
  - Sending uploads each file to the Host first. A retry keeps the uploads that already finished.
  - The mic dictates with the phone's speech recognizer, and the words fill the field so the Human edits them before sending. Like Telegram's voice button: hold the mic to talk and release to stop; while holding, a lock appears above the mic: slide left to cancel or up to lock. A tap works like a lock: it keeps listening until **■** stops it or the **×** that replaces **+** cancels it and clears the text. Dictation stays in the same row, and its status shows as the field's placeholder. A refused microphone or speech permission shows a notice and leaves the mic in place.

**Bot profile** (a form sheet)

- Avatar, name, label and description.
- Actions: Message (closes the sheet back to the DM), Computer (only when the Bot has Computer access; opens the live desktop view, where **Pause Bot and take control** lets the Human click and type, with a password keyboard), Notifications.
- Sections: Identity (the Soul: persona and standing rules), Memory (the Memory repository as a folder tree: folders first, each opens to its own list inside the sheet, and a file opens as read-only text), Routines (schedules), Channels (group Channels the Bot is in), Files (folders shared with the Bot).
- Each section loads on its own: an empty section says so, and a failed one offers Try again without hiding the others.
- Read-only for now; editing Identity and Memory from the phone comes later.

## Layers and states

Every fill comes from a layer, like the Web Client's DSH layers. `theme.layer.<name>` holds opaque colours:

| Layer    | Fill (DSH)           | Used for                                                  |
| -------- | -------------------- | --------------------------------------------------------- |
| `canvas` | `bg-base`            | screens, lists, the composer bar                          |
| `raised` | `bg-module-platform` | cards, Bot bubbles, shortcut cards, the composer pill     |
| `well`   | `bg-base`            | a recessed area in a raised card: option groups, previews |
| `field`  | `bg-layer-1`         | text inputs in a card, edged with `border-l4`             |
| `sheet`  | `bg-layer-2`         | settings rows, sheets and menus                           |

Each layer has `fill`, `pressed`, `selected` (neutral, such as the current tab), `chosen` (the Human's pick, an accent tint), `danger` (a destructive button, a red tint), `inset` (code, badges, tiles), `edge` and `divider`.

- `chosen` is the accent over the fill, 13% in light and 30% in dark. On `well` it equals DSH `state-business-tertiary`, and it follows a Bot's accent.
- A state is pushed further from its fill until it stands apart from the fill, the layer under it and the other states (`SEPARATION` in `layers.ts`; `test/design-tokens.test.ts` checks every scheme and accent). DSH's dark `interactive-bg-active` over `bg-base` equals `bg-module-platform`, so without this a selected row in a card looks like the card.
- Buttons are solid pills (`radius.round`) with no border, and take their colours from `buttonColors(theme, tone, on)` (`controls.ts`) for the layer they sit `on`. Primary is the neutral `fg` fill with a `base` label, never the Bot accent. Secondary is the layer's `selected`, or the next layer's fill when `selected` is too close to the layer. Danger is the layer's `danger` tint with a red label. Each fill stands apart from the layer and from the other tones, and each label reaches 4.5:1.
- Translucent roles (`hover`, `selected`, `divider`, `border*`, `dangerSoft`) are never a `backgroundColor`; `test/style-guard.test.ts` enforces this. Translucent edges stay allowed.

## Components

- `src/ui/design/` holds the tokens and theme (ADR-0201).
- `src/ui/primitives/` holds `Text` (variant `meta` / `body` / `title`, and a tone that is a colour role), and later `Icon`, `IconButton`, `Button`, `Avatar`, `Badge`, `Card`, `SettingsRow` and `EmptyState`.
- `src/ui/chat/` will hold the conversation row, bubble, message group, time separator, action cards, composer, status strip and scroll-to-bottom.
- `src/ui/shell/` will hold the Host drawer, the Human avatar button, shortcut cards, Channel section headers and the activity item.
- `app/` routes, reads the Host client, and composes these components.

## Code rules

1. **No literal style values.** Fills come from `theme.layer` (above).
   - Colours, font sizes and weights, spacing, radii and edge widths come from `useDesignTheme()` and `src/ui/design/tokens.ts`.
   - `test/style-guard.test.ts` enforces this for `app/` and `src/ui/`.
   - Files written before the rule are listed in it and leave the list once migrated; the test fails if a migrated file stays listed.
2. **Text goes through `primitives/text`.** Icons will go through `Icon` (`expo-symbols`).
   - Markdown bodies are the exception: `MarkdownView` renders them as native text with `react-native-enriched-markdown`, styled from the same tokens in `src/ui/markdown-style.ts`.
3. **A new visual element is added to `primitives/`, `chat/` or `shell/` first.** The PR says why the existing ones do not fit.
4. **Interactive elements meet the touch target and carry an `accessibilityLabel`.** The touch target is `theme.touch`: 44pt on iOS, 48dp on Android.
5. **Lists virtualize.** The chat is an inverted list.
6. **Motion and haptics are limited.**
   - Motion uses Reanimated, only for bubble entry, card collapse, the status dot and the image viewer's gestures.
   - Haptics fire only on send, approve or deny, and submitting a choice.
7. **Copy lives in `src/ui/strings.ts`.** Internal ids and protocol names stay out of the UI.
8. **UI PRs show the change.** They include light and dark screenshots from the web export, and a native check on a development build is recorded under Human QA.
