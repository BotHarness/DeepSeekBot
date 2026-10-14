# Mobile UI/UX rules

This is the target design of the DeepSeekBot mobile app. Every new or changed screen follows it. Tokens and theming are in [ADR-0201](../../docs/adr/0201-the-mobile-design-system-maps-web-roles-onto-native-components.md); this file covers structure, screens, components and code rules.

References:

| App       | What we use from it                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manus     | The chat: one Bot is one contact, the conversation reads like IM, and action cards sit in the chat.                                                                                          |
| Grok Bot  | Bots and group chats in one list, with separate "needs you" and "new result" states. Approval cards with **Allow once / Always allow / Deny**, and the Human taking over the Bot's computer. |
| Meta Muse | A Bot profile whose identity and memory are visible and editable.                                                                                                                            |
| Slack     | Workspace switching, a row of shortcut cards on Home, an Activity feed with filters, and agent steps with a Stop button.                                                                     |

## Structure

- **Hosts are workspaces.** Each paired computer is a Host.
  - The app stays connected to every paired Host at once.
  - Home and chats show one Host at a time. The Host switcher is at the top left of Home: a Slack-style tile with the Host's initial, beside the Host name as the large title. Tap it to open the switcher. It lists each Host with its status and pending count, plus "Pair a new computer".
- **Tabs** are native (`NativeTabs`): **Home**, **Activity** and **Me**.
  - A chat is pushed above the tabs, so the tab bar hides while it is open.
- **Home** shows the current Host:
  - A row of shortcut cards: **Needs you** and **Working**, each a count that filters the list when tapped. **Unread** joins them once the Host reports unread counts.
  - One list of PersonaBot DMs and Channels together, by latest activity.
  - The header has search and **+** (new Bot, new Channel).
- **Activity** is the Human Inbox across all Hosts:
  - Filters: All / Needs you / Mentions / Replies / Done, plus a Host filter.
  - Every item carries its Host and can be decided in place.
  - Opening an item jumps to the card in its chat.
- **Me** holds appearance (scheme, accent, chat wallpaper), notifications, paired Hosts and unpairing.

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
  - Reactions are small chips on the bubble corner.
  - Delivery: pending shows at 70% opacity, failed offers "Not sent · Tap to retry", and sent shows nothing.
- **Action cards** sit in the chat stream and share one layout: title and explanation, an optional preview, then buttons.
  - Card kinds:
    - **Question**: lettered options, single or multiple choice, then Submit.
    - **Tool approval**: Allow once / Always allow / Deny. Details open a form sheet.
    - **Takeover**: a computer screenshot, then Take over / Done / Not now.
  - At most one primary button per card.
  - A decided card collapses to one line. A card decided on another device says so.
- While the Bot works, a status strip above the composer shows the current step and a **Stop** button. Tapping it shows the steps.
- The composer is a pill: **+** for attachments, the placeholder "Message {Bot}", and a mic that becomes Send once there is text.

**Bot profile** (a form sheet)

- Avatar, name, label and description.
- Actions: Message, Computer, Notifications.
- Sections: Identity (persona and standing rules, editable), Memory, Routines, Channels, Files.

## Components

- `src/ui/design/` holds the tokens and theme (ADR-0201).
- `src/ui/primitives/` holds `Text` (variant `meta` / `body` / `title`, and a tone that is a colour role), and later `Icon`, `IconButton`, `Button`, `Avatar`, `Badge`, `Card`, `SettingsRow` and `EmptyState`.
- `src/ui/chat/` will hold the conversation row, bubble, message group, time separator, action cards, composer, status strip and scroll-to-bottom.
- `src/ui/shell/` will hold the Host switcher, shortcut cards and activity item.
- `app/` routes, reads the Host client, and composes these components.

## Code rules

1. **No literal style values.**
   - Colours, font sizes and weights, spacing, radii and edge widths come from `useDesignTheme()` and `src/ui/design/tokens.ts`.
   - `test/style-guard.test.ts` enforces this for `app/` and `src/ui/`.
   - Files written before the rule are listed in it and leave the list once migrated; the test fails if a migrated file stays listed.
2. **Text goes through `primitives/text`.** Icons will go through `Icon` (`expo-symbols`).
3. **A new visual element is added to `primitives/`, `chat/` or `shell/` first.** The PR says why the existing ones do not fit.
4. **Interactive elements meet the touch target and carry an `accessibilityLabel`.** The touch target is `theme.touch`: 44pt on iOS, 48dp on Android.
5. **Lists virtualize.** The chat is an inverted list.
6. **Motion and haptics are limited.**
   - Motion uses Reanimated, only for bubble entry, card collapse and the status dot.
   - Haptics fire only on send, approve or deny, and submitting a choice.
7. **Copy lives in `src/ui/strings.ts`.** Internal ids and protocol names stay out of the UI.
8. **UI PRs show the change.** They include light and dark screenshots from the web export, and a native check on a development build is recorded under Human QA.
