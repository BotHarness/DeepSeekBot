---
Status: Accepted
Date: 2026-10-15
Issues: [#1848](https://github.com/BotHarness/DeepSeekBot/issues/1848), [#1849](https://github.com/BotHarness/DeepSeekBot/issues/1849)
---

# The mobile app has two tabs, with Settings and Hosts in the header

> Amends [ADR-0201](0201-the-mobile-design-system-maps-web-roles-onto-native-components.md)'s interaction baseline: the mobile app no longer copies the Web Client's three-tab mobile shell.

ADR-0201 took the Web Client's mobile shell (Conversations / Inbox / Settings) as the app's interaction baseline, and `apps/mobile/DESIGN.md` turned it into three tabs: Home, Activity and Me. That split came from the Web Client, not from how the Human uses the phone. On the phone the Human mostly opens the Channel list to message a PersonaBot, and clears the Human Inbox to approve or answer. Me is a light, rarely used settings page that took a third of the tab bar.

Other gaps sat around it:

- Switching between paired Hosts pushed a modal from the header chip, out of thumb reach.
- DESIGN.md promised search and **+** in the Home header, but the app had neither.
- A PersonaBot or a Channel could not be created from the phone.
- The desktop sidebar groups Channels into Channel sections, and the phone showed one flat list.

## Decision

- **Two tabs and the search tab.** `NativeTabs` keeps the tab bar. The tabs are **Chats** (formerly Home) and **Activity**, which keeps its badge from the Human Inbox action count. On iOS a search tab with the `search` role comes last; iOS 26 draws it as a separate round glass button at the bottom right. The Liquid Glass bar keeps no background of ours (#1800), and minimize on scroll stays off.
- **Settings behind the Human's avatar.** The Chats header shows the Human's avatar at the top right, as Apple's own apps on iOS 26 do. It opens Settings as a form sheet with a large detent, grouped into Connections (Computers, Notifications, Open full client), Interface (Appearance) and Chats (Channel sections, Hidden Channels). Every row of the Me tab moves here, unpairing included. Until the Human has an avatar of their own, it shows their initial on a neutral layer fill.
- **Host drawer.** Host switching is a left drawer that covers the list over a dimmed backdrop. The Host chip at the top left opens it, and so does an edge swipe on a tab's root screen only, so the system back gesture in a pushed chat stays Back. It lists each Host with its status and pending count, plus "Pair a new computer". It is built with Reanimated and Gesture Handler; no navigation library is added.
- **Create in the header.** On iOS a compose button in the Chats header opens a native menu: New PersonaBot, New Channel. Android uses a Material FAB at the bottom right instead.
- **Search.** The search screen filters the current Host's PersonaBots and Channels by name on the device, with the field at the bottom above the keyboard. A result opens its chat. Message full-text search is out of scope.
- **Channel sections.** Chats groups Channels by the Host's Channel sections, read through the existing `rosterGet` method. Ungrouped Channels sit between sections in the desktop's top-level order, and Hidden Channels stay out. Sections collapse; the collapse state is local to the phone and kept per Host, because a Channel section is a local display arrangement. The Needs you and Working shortcut cards still filter across all sections. A Host with no sections shows today's flat list.
- **Android** keeps two Material 3 tabs and adds a top search bar, the FAB, the avatar and a standard navigation drawer.

The Web Client's mobile shell does not change. No Bot tool or Host capability is added, so there is no new CLI command.

## Considered Options

- **Keep three tabs.** Me holds a high-traffic slot for low-frequency settings.
- **Remove the tab bar** and move Activity to a header bell. The Activity badge, the main "something waits for you" signal, would leave thumb reach.
- **An X-style compose FAB on iOS.** It sits where iOS 26 puts the system search button, and a FAB is not an iOS convention.
- **Search and create both in the header.** Search is used far more than create, and the iOS 26 search tab puts it under the thumb at no cost.

## Consequences

- ADR-0201's "three tabs" baseline is superseded. Its token, type, theme and native-component decisions stand.
- `apps/mobile/DESIGN.md` Structure describes the new shell, and every later navigation slice builds against it.
- Settings and Host switching now sit at the top of the screen, which is harder to reach one-handed. Both are low-frequency, and the edge swipe makes the drawer reachable.
- The drawer is our own overlay, so focus, Reduce Motion and the edge-swipe conflict with Back are ours to handle and test on device.
