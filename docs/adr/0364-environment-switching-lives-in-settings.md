---
Status: Accepted
Date: 2026-11-24
---

# ADR-0364: Environment switching lives in Settings

_Amended 2026-11-24 (#5130): the Chats header and the Session drawer also open the Environment sheet._

## Context

The phone opened Workspaces from Chats: iOS kept a retained Workspaces page left of Chats ([mobile UI, section 5](../decisions/mobile-ui.md#adr-0273)) and Android a navigation drawer from the Host chip ([section 1](../decisions/mobile-ui.md#adr-0272)). The Sessions tab now also depends on the Environment, and #5104 gives the left-edge swipe on Sessions to the Session drawer, which is used far more often than switching Environments.

## Decision

The Environment Scope is chosen only from the first row of Settings, which shows the current Environment and opens the Environment sheet. On iOS it is a native sheet with medium and large detents; on Android it is a Material 3 modal bottom sheet. It lists All, each paired Computer and each cloud workspace. Pairing and joining sit behind a + at the sheet's top-right.

Chats no longer opens Workspaces through an edge swipe or drawer. The iOS pager loses its Workspaces page but keeps the last Conversation screen to the right of Chats. Android loses its Workspaces navigation drawer.

Sessions follow the same Environment Scope as Chats and Activity, with no Environment filter of their own. The New Session screen preselects the scope's Computer (the most recently used one under All) and may pick another Computer for that one Session without changing the scope.

## Amendment (2026-11-24, #5130)

Settings stays the primary entry, and its first group, Environment settings, opens with the Environment switcher. The Environment name in the Chats header and at the top of the Session drawer is also a button (with a small ▾) that opens the same Environment sheet. Selection still applies to Chats, Activity and Sessions together. The Human frequently moves between All and one Computer, and leaving the current tab for Settings every time broke their place. The original objection to the Host chip, that it implied the scope belongs to Chats, is met by every entry opening the one sheet that names all three tabs. The left-edge swipe stays with the Session drawer.

Under All, the Environment settings in Settings belong to the most recently used Computer, and Settings says so.

## Rejected alternatives

- Keeping the Host chip as the only entry in the Chats header: it implied the scope belongs to Chats (the amendment keeps a header entry but makes the one shared sheet the place of choice).
- A side drawer for Environments: the left edge belongs to the Session drawer.
- A per-tab Environment filter on Sessions (#4997): Sessions and Chats could disagree about the current Computer.

## Consequences

Switching Environments costs one tap from Chats or the Session drawer and two from any other tab. Explicit selection keeps ADR-0272's reset rules. This supersedes the Workspaces entry of ADR-0272 and the iOS Workspaces page of ADR-0273; #5105 implements it and marks this ADR Accepted.
