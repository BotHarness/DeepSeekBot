---
Status: Proposed
Date: 2026-11-24
---

# ADR-0364: Environment switching lives in Settings

## Context

The phone opened Workspaces from Chats: iOS kept a retained Workspaces page left of Chats ([mobile UI, section 5](../decisions/mobile-ui.md#adr-0273)) and Android a navigation drawer from the Host chip ([section 1](../decisions/mobile-ui.md#adr-0272)). The Sessions tab now also depends on the Environment, and #5104 gives the left-edge swipe on Sessions to the Session drawer, which is used far more often than switching Environments.

## Decision

The Environment Scope is chosen only from the first row of Settings, which shows the current Environment and opens the Environment sheet. On iOS it is a native sheet with medium and large detents; on Android it is a Material 3 modal bottom sheet. It lists All, each paired Computer and each cloud workspace, then pairing and joining.

Chats no longer opens Workspaces. Its header shows the Environment name as plain text that does nothing when tapped. The iOS pager loses its Workspaces page but keeps the last Conversation screen to the right of Chats. Android loses its Workspaces navigation drawer.

Sessions follow the same Environment Scope as Chats and Activity, with no Environment filter of their own. The New Session screen preselects the scope's Computer (the most recently used one under All) and may pick another Computer for that one Session without changing the scope.

## Rejected alternatives

- Keeping the Host chip in the Chats header: it implies the scope belongs to Chats.
- A side drawer for Environments: the left edge belongs to the Session drawer.
- A per-tab Environment filter on Sessions (#4997): Sessions and Chats could disagree about the current Computer.

## Consequences

Switching Environments costs two taps from any tab, which is acceptable because it is rare. Explicit selection keeps ADR-0272's reset rules. This supersedes the Workspaces entry of ADR-0272 and the iOS Workspaces page of ADR-0273; #5105 implements it and marks this ADR Accepted.
