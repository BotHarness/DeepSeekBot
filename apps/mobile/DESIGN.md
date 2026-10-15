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
  - **Customize computer** sets how each Host looks, kept on the phone per Host. It is a form sheet with a live preview of the band, opened from that Host's ⋯ menu in the Host drawer (or a long press on its row), so each paired Host is customized where it is listed.
    - Name: a local name shown in the Host chip and the drawer instead of the Host's own name; clearing it goes back to the Host's name.
    - Avatar: the initial tile (default), one of eight pixel portraits from the PersonaBot avatar generator, or a photo cropped square.
    - Banner: the accent band (default), a solid colour (ten swatches or a typed hex), a two-stop gradient (six presets or typed stops), or a picture under a dark scrim.
    - A custom colour goes through the accent band's steps, so dark mode mutes it the same way. The ink is white or near-black, whichever reads on every stop; a picture always takes white ink with a soft shadow.
- **Host drawer** switches Hosts. It slides in from the left, covers about 85% of the width and dims the list behind it.
  - Like Slack's workspace drawer it has three parts on the `sheet` layer: a fixed "Computers" header, a scrolling list of Hosts, and a fixed footer with **Pair a new computer** (opens the pairing flow) and **Notifications** (opens notification settings), separated from the list by a divider.
  - Each Host row has its Computer avatar tile (the same tile as the Host chip; the current Host's tile has an `fg` ring at radius `lg`, concentric with the tile, as Slack marks the current workspace), its name, an online/offline/checking dot and label, then one **count chip** on the right (see Count chip below). It shows **Needs you** when anything waits for the Human, because that matters most; otherwise it shows **Unread**, the count of unread conversations. A ⋯ button at the end, or a long press on the row, opens the Host's menu: Customize (name, avatar and banner), Show this computer, and Unpair, which asks for confirmation.
  - The Host chip opens it, and so does a swipe right from the left edge of a tab's root screen. The edge swipe is never attached inside a pushed chat, where it stays the system Back.
  - Tapping a Host switches to it and closes the drawer. Tapping the backdrop or swiping left closes it.
  - It takes screen-reader focus when it opens and returns focus to the Host chip when it closes. With Reduce Motion on it appears without sliding.
  - Android Back closes it. Android draws the same drawer.
- **Tabs** are native (`NativeTabs`): **Chats** and **Activity**. There is no search tab.
  - Activity carries a badge with the Human Inbox action count.
  - A chat is pushed above the tabs, so the tab bar hides while it is open.
  - iOS draws the system tab bar with no background colour of ours: Liquid Glass on iOS 26 (a floating capsule above the home indicator, with the system's glass pill behind the selected tab), the translucent system bar before it. The selected tint is the resolved `fg`, passed as a plain colour so the bar re-tints when the scheme changes while the app is open. Minimize on scroll stays off.
  - Content scrolls under the bar. Each tab's list sets `contentInsetAdjustmentBehavior="automatic"`, so its last row clears the bar and the home indicator.
  - Android keeps two Material 3 tabs on `base`: like Slack, the selected tab is the foreground colour with a pill behind its icon (the Material indicator), and the others are muted.
  - The web preview draws a floating translucent capsule with the two tabs, standing in for the glass, with the selection bubble behind the whole item (icon and label) as iOS draws it.
- **Chats** shows the current Host:
  - The header has the Host chip on the left, and on the right a **+** button and the Human's avatar, on both iOS and Android.
    - **+** is a round button on the `raised` layer fill, the same size as the avatar, so it stays visible on any Host band. It opens a native menu: **New PersonaBot** and **New Channel**. They open the app's create flow, or the full client where the app has none yet.
    - The avatar opens **Settings**. Until the Human has an avatar of their own it shows their initial on a neutral layer fill.
  - A **search field** at the top of the list panel, inset so its left edge lines up with the row avatars (`AVATAR_EDGE`), with corners concentric with the panel's rounded top: the field uses `radius.md` and the panel `radius.md + AVATAR_EDGE`. It scrolls away with the list. There are no shortcut cards: Activity already gathers what needs the Human.
  - One list of PersonaBot DMs and Channels together, grouped by the Host's **Channel sections** as on the desktop sidebar:
    - Sections come in the desktop's order. Ungrouped DMs and Channels sit between them in the desktop's top-level order.
    - A section header shows its name and Channel count and collapses or expands on tap. A collapsed section still shows a "Needs you" mark when something inside needs the Human. The collapse state is kept on the phone, per Host.
    - Hidden Channels stay out of the list. Pins and the sort mode follow `CONTEXT.md`.
    - Changes made on the desktop show when the roster refreshes. Creating, renaming, reordering and moving Channels between sections stays on the desktop for now.
    - A Host with no sections shows one flat list by latest activity.
- **Search** finds a PersonaBot or Channel on the current Host:
  - Typing in the Chats search field filters the list in place, as chat apps do; there is no separate search tab.
  - It matches PersonaBot display names and Channel titles on the device, ignoring case and full-width forms, with names that start with the query first. Hidden Channels stay out. A DM result opens its chat, and a Channel result opens that Channel's chat. When nothing matches it says so. Message full-text search is not part of it.
- **Activity** is the Human Inbox across all Hosts:
  - Filter chips with counts: All / Needs my action / Mentions & replies / Handled, and a Bot row once more than one Bot is listed. They match the Web Client Inbox's categories and Bot filter; a Host filter comes with more than one Host.
  - Section headers stick to the top while their items scroll and show the section's count.
  - Every item carries its Host and can be decided in place, on the same cards as the chat.
  - Posts and rows are separated by space and layer fills, not divider lines.
  - A row's title is `category · Bot`; a reply keeps its text on a second line, and a handled item collapses to one line: `category · Bot · summary`.
  - Opening an item jumps to the card in its chat.
- **Settings** is a form sheet with a large detent, opened from the avatar, and closed by swiping down or the close button. It reuses the settings row and section components, in groups:
  - **Connections**: the current Host and its connection status, Computers (paired Hosts, their status and unpairing, with the same confirmation and error notice as before), Notifications, and Open full client.
  - **Interface**: App icon (the shipped default icon or one of two DeepSeekBot portraits, the full one and the chibi one, each with dark and tinted variants on iOS), and Appearance (scheme, accent, chat wallpaper) once it exists. Each Host's name, avatar and banner are customized from its menu in the Host drawer, not here.
  - **Chats**: Channel sections and Hidden Channels, each pushing its own screen.

## Screens

**Conversation row**

- A 48pt avatar: the Bot's round avatar with its state ring, or a rounded square with `#` for a Channel.
- First line: title, IM channel badges and time.
- Second line: a one-line preview.
- One count chip at the end of the preview line: **Needs you** (how many requests wait for the Human) takes priority over **Unread** (how many messages arrived since the Human last read the conversation, from the Host's `channelUnreadCounts`). A muted conversation's unread count uses the neutral tone.
- A collapsed Channel section shows one count chip for everything inside it: Needs you first, otherwise the unread sum, leaving muted conversations out.
- Opening a conversation marks it read on the Host (`channelMarkRead`) whenever the Human is at the newest message, so the chip clears on the phone and on desktop.
- A working Bot's preview reads "Working…".
- Swipe for pin and mute; long-press opens a native menu.

**Count chip**

- One shared primitive (`CountBadge`) for every count in a list row: a rounded rectangle at radius `sm`, `type.meta.line + space.x3` tall and at least as wide, padded `space.x3`, with the number centred in `meta` strong tabular figures and capped at 99+.
- Tones: **Needs you** is `warning` with `fg` ink (`base` in dark); **Unread** is `accent` with `onAccent` ink; **Muted** is `inset` with `muted` ink.

**Chat**

- Header: our own, floating over the messages with no bar, like Telegram. Back on the left, the Bot's computer on the right, and a centered chip that opens the Bot profile. The native stack header is hidden (`headerShown: false`): with a transparent native header on iOS 26, UIKit puts a dimming overlay over the whole inverted message list, and turning the scroll edge effects off on the screen does not remove it. The swipe back still works.
  - The chip is a full-round pill on a frosted `raised` (the fill at `glass.tint` opacity) with a hairline `edge`, so messages show faintly through it as they pass under. In one row it holds the Bot's avatar (no state ring), its name, and a state dot: `success` when idle, `accent` while thinking or working, `warning` when it waits for the Human, `danger` when blocked, `muted` when paused. The state is read out in the chip's accessibility label.
  - The chip's padding is concentric with its corners: it is `theme.touch` tall, so its corner radius is half that, and the avatar and the dot each sit that same distance from their end of the pill (padding = corner radius − the item's own radius).
  - Back and the computer button are round buttons of `theme.touch`, on the same frosted `raised` with a hairline `edge`, on every platform.
  - Messages run under the header and the status bar and fade there: a light static gradient from `base` to transparent (`edgeFade.stops`, at most 80%) covers the header and `edgeFade.top` below it, on every platform. At rest the list keeps the header's height free above the oldest message. UIKit's scroll edge effects stay off (`scrollEdgeEffects` all `hidden`). There is no live blur, because a blur view over a scrolling list re-renders every frame and needs a native module.
  - The list runs to the bottom of the screen, and the composer floats over it with no bar of its own; its pill keeps an opaque `surface` fill, so nothing shows through where the Human types; messages pass around and under it. The bottom of the screen fades out with the same light gradient over the composer and `edgeFade.bottom` above it. The list keeps that much space below the newest message, so at rest it sits just above the composer; scrolled up, messages pass behind the composer.
- Messages:
  - An inverted list. Messages from the same author within 5 minutes form a group, and a time separator appears after a 30-minute gap.
  - At the newest message the list follows a streaming reply. Once the Human drags or scrolls up into history, nothing moves the list under them: new text and messages land below while the part they are reading stays put. A round jump button (`raised`, with a ⌄) then floats centered above the composer, with an accent badge counting the Bot messages that arrived since they left (99+ at most), like the Web Client's "Return to latest messages". Tapping it, sending a message, or scrolling back down to the newest message follows again and hides the button.
  - Bot bubbles are `surface`. Human bubbles are `accent` with `onAccent` text.
  - In a DM, `accent` is that Bot's primary colour (`AccentProvider` with `botColor`), so each Bot's chat has its own Human bubble colour.
    - A colour too close to the chat background or the Bot bubble (under 1.3:1 against `base` or `surface`, such as black hair in dark mode) is first mixed toward `fg` until it separates from both.
    - Message text on it always reaches 4.5:1. A light colour (white under 3:1, such as yellow) keeps its value and takes dark text. Any other colour takes white text and is darkened just enough for white to reach 4.5:1.
  - Bubbles use radius `lg` and are at most 80% wide.
  - Attachments sit inside the bubble: images as rounded thumbnails (one large, or a grid of squares), other files as a row with an icon, name and size. Tapping an image opens a full-screen viewer; tapping a file downloads it from the Host and opens the share sheet.
    - The viewer follows the Photos app: pinch zooms around the fingers (up to 5×, springing back to fit below 1×), double-tap zooms to 2.5× at the tapped point and back, one finger pans a zoomed image, a vertical swipe at fit size closes it with the backdrop fading, and a single tap hides or shows the close and share buttons. The close button, Android back and the iOS escape gesture also close it.
  - Reactions are small pills under the bubble, on its side: the emoji and its count, the Human's own in `chosen` with an accent edge. Tapping one adds or removes the Human's reaction. A Bot's reaction-only answer shows here with no reply bubble.
  - A bubble that does something when pressed shows it while held: on Android a foreground ripple from the touch point, clipped to the bubble's corners, in the bubble's ink at 12% (`pressTint`); on iOS, which has no ripple, the bubble shrinks to 96% over the long-press delay (`motion.lift`) like the system context menu's lift, and springs back on release. Reduce Motion skips the shrink.
  - Long-press a bubble to open its menu in place, like Telegram and ChatGPT, not a sheet from the bottom. A light haptic fires as it opens.
    - The chat dims under `theme.scrim`, and the pressed bubble is drawn again above it at the same place. The **reaction island** sits just above the bubble and the **action menu** just below it, both on the bubble's side (left for a Bot, right for the Human). When they do not fit between the safe areas the group slides to fit, and a bubble taller than the room left is clipped (`menu-placement.ts`).
    - The reaction island is a full-round pill on the `sheet` layer with a soft shadow. Its quick reactions scroll sideways: the Web Client's set first (👍 ❤️ 😂 🎉 👀 ✅), then more. The Human's own show in `chosen`; tapping one toggles it and closes the menu.
    - The action menu is a card at radius `lg` on the `sheet` layer with a soft shadow: the message time in muted `meta` ("Today 14:41"), then a row per action, label on the left and icon on the right, with `divider` hairlines between: **Copy** and **Share** (the system share sheet) for a message with text.
    - Both fade and scale in from the bubble. A tap outside, Android Back or the iOS escape gesture closes the menu, as does any action.
    - A message that is still sending, failed, or is a card has no reactions, so its menu has no island. Bubble text is not selectable, so the long-press always reaches this menu; screen readers reach it through the bubble's "Message actions" action.
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
    - The collapsed line is a Bot bubble with different content: the same left edge, `surface` fill, padding, 80% width cap and radius `lg`, and it joins the Bot's message group (`xs` corners on the joined side, the tighter group gap), so it lines up with the bubbles above and below it. In a group Channel it stands alone, so the next bubble still carries the Bot's name.
- While the Bot works (thinking or working), a working status sits at the bottom of the message list, after the newest message, like the Web Client's. It has no background and no name: the Bot's avatar, then its current step with "…" in muted text. There is no Stop. Nothing sits fixed above the composer, so the composer never moves when a Bot starts or stops; scrolled up, the status is out of view like any new message.
- The composer is a pill: **+** for attachments, the placeholder "Message {Bot}", and a mic that becomes Send once there is text.
  - With one trailing button (the mic or Send) the pill is one row: **+**, the field and the button, bottom-aligned as the field grows. When the text no longer fits that one row, or with more (attached files, or the mic next to Send), it stacks like the web composer: the field on top at full width, and a row below with **+** (or **×**) on the left and the buttons on the right.
  - **+** opens Photos, Camera and File below the pill. Picked files show as removable tiles inside the pill, up to 10 per message. Send appears once there is text or a file.
  - Sending uploads each file to the Host first. A retry keeps the uploads that already finished.
  - Nothing sits under the pill, so the chat stays clean. A DM's Model and Workspace settings live in the Bot profile, in a **Bot settings** group under the profile actions: a **Model** row (the Bot's current model name, or "Loading…", "No model set" or "Unavailable") and a **Workspace** row (the folder count, "N folders"), each with a chevron.
    - **Model** opens a sheet from the bottom titled "Model · {Bot}": Presets (when the Host has any) and the Models list, the current one checked. Picking a model changes only the Bot's main model; its Assignment models stay as they are. A model whose provider needs a key is shown muted and cannot be picked. The sheet closes once the Host accepts the change. Advanced settings (reasoning effort, Assignment models) stay on the computer.
    - **Workspace** opens a sheet titled "Workspace · {Bot}" with three sections, the same actions as the Web composer's workspace panel:
      1. **Folders**: each granted folder as a row (name, then "Can edit" or "Read only" and its path) with a × that removes access, then **Add folder**. Add folder turns the sheet into a folder browser of the computer: folders registered on the computer, the path as tappable crumbs, and the subfolders; **Authorize this folder** resolves the current folder and asks for a scoped confirmation ("Confirm authorization for {Bot}" with the resolved path) before granting it.
      2. **Access**: a **Full access** switch. Turning it on first shows the danger confirmation in place, in an inset box with a red "I understand, enable" button and Cancel; once on, a warning callout and a **Scope of full access** group (Chat and new Assignments, or New Assignments only) follow.
      3. **Auto approval template**: Off, Cautious and Get the work done (plus any other template on the Host), each with its one-line hint, the current one checked.
  - The mic dictates with the phone's speech recognizer, and the words fill the field so the Human edits them before sending. Like Telegram's voice button: hold the mic to talk and release to stop; while holding, a lock appears above the mic: slide left to cancel or up to lock. A tap works like a lock: it keeps listening until **■** stops it or the **×** that replaces **+** cancels it and clears the text. Dictation stays in the same row, and its status shows as the field's placeholder. A refused microphone or speech permission shows a notice and leaves the mic in place.
- A group Channel opens the same chat screen, with these differences:
  - The header is the same floating header. Its centered chip, on the same frosted `raised` with a hairline `edge` like the Bot chip, holds the group's photo (or a round `#` mark), the Channel name and its member count; it opens **Group info**. The full client button sits on the right.
  - Like Slack and the Web Client, each Bot message sits in a row with a 32 pt avatar column on the left: a rounded square (`radius.sm`, no state ring). The first bubble of each Bot's group, and each Bot's streaming draft, carry the Bot's name above it in `meta`. The avatar rests beside the group's last bubble, its bottom edge level with that bubble's bottom edge, never with its reaction or delivery row. While the group scrolls past, the avatar sticks to the list's visible bottom edge (above the floating composer and its fade) and follows the group up until it reaches the group's first bubble. This runs on the UI thread from the list's scroll offset (Reanimated `useScrollOffset` and `measure`). A Bot missing from the roster gets a `surface` rounded square with its initial. A different Bot starts a new group even within 5 minutes.
  - `accent` stays the app's accent, since no one Bot owns the chat.
  - Working member Bots share one row: up to three avatars stacked (each ringed in `base`), then "Working…"; one Bot shows its own step.
  - The composer says "Message #{Channel}" and has no Model and Workspace footer, since those belong to one Bot. A question card keeps its own Other field instead of "Or reply in the chat below.", because a message in a group goes to every member.
  - Typing `@` opens a suggestion list above the composer pill, on the `sheet` layer: **All Bots** (the Channel's active members, as the Web Client's "@All Bots") and the active member Bots with avatar and name, filtered by what follows the `@`. Choosing one inserts `@Name ` as a mention token, sent with the message like the Web Client's, so the mentioned Bots are woken even under a mentions-only wake policy. Editing inside a token turns it back into plain text.
  - A notification or Activity item for a group Channel reply, mention or card opens this chat, at the card when there is one.

**Group info** (a form sheet, opened from a group Channel's header chip)

- The group's photo (or `#` on a rounded square), its name and member count.
- A **Group** settings group: **Name** opens a bottom sheet with the name field and Save; **Choose a photo** opens the photo picker, crops the photo square and sends it to the Host scaled to 256 × 256 px as a JPEG (the Host takes at most 96 KB); **Remove photo** appears once there is one.
- **Join requests** (only while one is pending): each requesting Bot with **Allow** (primary) and **Decline**.
- **Members**: **Invite a PersonaBot** first, while any roster Bot is neither a member nor invited, opening a bottom sheet of those Bots; then each member Bot with its 32 pt rounded-square avatar and "Creator" under the Bot that made the group. Tapping a member opens its profile; its ⋯ menu offers Open profile and **Remove from group**, which asks for confirmation. Pending invitations follow, marked "Invited · waiting for an answer", with **Cancel**.
- **Disband group** is a danger row at the bottom; it asks for confirmation and on success returns to Chats.
- A refused change shows a `danger` callout under the header and leaves the page as it was. Changes show on the phone and the desktop when the roster refreshes.
- Group wake policy, group connectors and the group's work list stay on the computer.

**Bot profile** (a form sheet)

- Avatar, name, label and description.
- Actions: Message (closes the sheet back to the DM), Computer (only when the Bot has Computer access; opens the live desktop view, where touching the screen pauses the Bot so the Human can click and type, the Bot resumes 30 seconds after the last input or at once from the hand-back icon, and the password keyboard keeps it paused), Notifications.
- Under the actions, a **Bot settings** group with the Model and Workspace rows (see Chat), each opening its sheet from the bottom over the profile.
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
| `sheet`  | `bg-layer-2`         | settings rows on a screen, and menus                      |

Each layer has `fill`, `pressed`, `selected` (neutral, such as the current tab), `chosen` (the Human's pick, an accent tint), `danger` (a destructive button, a red tint), `inset` (code, badges, tiles), `edge` and `divider`.

- `chosen` is the accent over the fill, 13% in light and 30% in dark. On `well` it equals DSH `state-business-tertiary`, and it follows a Bot's accent.
- A state is pushed further from its fill until it stands apart from the fill, the layer under it and the other states (`SEPARATION` in `layers.ts`; `test/design-tokens.test.ts` checks every scheme and accent). DSH's dark `interactive-bg-active` over `bg-base` equals `bg-module-platform`, so without this a selected row in a card looks like the card.
- Buttons are solid pills (`radius.round`) with no border, and take their colours from `buttonColors(theme, tone, on)` (`controls.ts`) for the layer they sit `on`. Primary is the neutral `fg` fill with a `base` label, never the Bot accent. Secondary is the layer's `selected`, or the next layer's fill when `selected` is too close to the layer. Danger is the layer's `danger` tint with a red label. Each fill stands apart from the layer and from the other tones, and each label reaches 4.5:1.
- Bottom sheets (`chat/sheet.tsx`) sit on `theme.scrim`, have a grabber, a title with a round close button, and paint `canvas`. Their content is iOS-style inset groups on `raised` (`SettingsGroupItem`): rows separated by `divider` hairlines, a muted heading above each group and a muted footnote below it. A warning goes in a `warningSoft` callout, not orange text. A selected option shows a `fg` check, and switches use `Toggle` (`accent` track when on).
- Translucent roles (`hover`, `selected`, `divider`, `border*`, `dangerSoft`) are never a `backgroundColor`; `test/style-guard.test.ts` enforces this. Translucent edges stay allowed.

## Components

- `src/ui/design/` holds the tokens and theme (ADR-0201).
- `src/ui/primitives/` holds `Text` (variant `meta` / `body` / `title`, and a tone that is a colour role), `Button`, `Toggle`, `SettingsRow`, `SettingsSection` and `SettingsGroupItem`, `CountBadge`, and later `Icon`, `IconButton`, `Button`, `Avatar`, `Card`, `SettingsRow` and `EmptyState`.
- `src/ui/chat/` will hold the conversation row, bubble, message group, time separator, action cards, composer, working status and scroll-to-bottom.
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
   - Motion uses Reanimated, only for bubble entry, a held bubble's lift, the message menu, card collapse, the status dot, the Host drawer, the image viewer's gestures and the composer growing line by line (up to five lines, then it scrolls).
   - Haptics fire only on send, approve or deny, submitting a choice, and opening a message's menu.
7. **Copy lives in `src/ui/strings.ts`.** Internal ids and protocol names stay out of the UI.
8. **UI PRs show the change.** They include light and dark screenshots from the web export, and a native check on a development build is recorded under Human QA.
