# ADR-0268: Tob Mode replaces Home

- Status: Accepted (design)
- Date: 2026-10-27
- Related: ADR-0065, ADR-0223, ADR-0233, ADR-0259, ADR-0269; supersedes the Home panel parts of ADR-0223 and ADR-0259 and the step 5 wording of ADR-0233

## Context

Home (ADR-0223) is a global Dock panel with a cross-Bot overview, Bot creation entry points and an input addressed to Tob. In practice a message sent from Home jumps to the Tob DM in Messages, so Home is mostly a detour, and its overview cards duplicate Activity Center. Personal-agent products converge on one primary agent with an input at the bottom. Tob already has the identity for that role, and since ADR-0065 every PersonaBot, Tob included, can contact a colleague through `list_bot_contacts` and `bot_send_message` in a Bot-to-Bot DM.

## Decision

**Tob Mode** is a mobile presentation of the active Environment's Tob DM, not a new conversation, Channel or store.

On desktop the Home panel is removed and there is no separate Tob Mode switch. In Simple layout mode the Messages panel is always shown and the Human can hide the Side column, leaving only the Workspace Control Rail and Messages (ADR-0269); that is the desktop's focused conversation. Home's stable shortcut command and default binding now open the Tob DM in Messages without changing the layout. Cross-Bot attention stays in Activity Center, Bot creation is asked of Tob in conversation, and onboarding step 5 (ADR-0233) completes when the Human reaches the Tob DM, in both layout modes.

On mobile, the Chats list keeps pull-to-refresh. Holding past the refresh threshold for about 0.6 s fills a ring and plays a haptic; releasing then opens Tob Mode instead of refreshing. Tob Mode covers Chats from the top, hides the tab bar, and closes by pushing up or with system Back. Inside it, the last-chat swipe and the -1 screen do not respond. The Tob row stays in the Chats list. The target is the filtered Environment's Tob, or the most recently used computer Environment under "All environments". A cloud-only filter has no Tob, so pulling only refreshes.

**Tob Delegation** uses the existing Bot-to-Bot DM path without a new tool or authority: Tob chooses a colleague, sends without asking the Human first, and reports the result in its Human DM. The existing action notice shows each send. Approval ownership, the Bot-hop limit and Tob's scoped CLI allowlist are unchanged.

## Considered options

- **A desktop Tob Mode switch.** A first version hid every panel except Messages behind a rail switch. With Messages always shown in Simple and a hideable Side column (ADR-0269), the switch duplicated hiding the Side column and added a second, Tob-only way to focus.
- **Keep Home and fix it.** Home would still be a second entry point to the same conversation, with an overview that Activity Center already owns.
- **A separate Tob Mode conversation.** Splitting history breaks ADR-0223's single Tob DM and the existing approval path.
- **Delegation through a Group with the Human.** This is heavier, and Tob is never a Group participant (its Group prompt forbids it).
- **Distance-based second stage ("pull further").** This conflicts with long pulls for refresh and is harder to discover than a timed ring.

## Consequences

The Advanced layout document needs a migration that drops the Home panel and keeps the rest of each saved arrangement. Pull-and-hold needs pull-distance tracking that the native refresh controls (`RefreshControl`, `PullToRefreshBox`) do not expose, so each platform needs its own gesture work, coordinated with #3040, #3041 and #3055.
