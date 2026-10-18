# ADR-0222: Channel workspace persists a nested split tree

- Status: Accepted
- Date: 2026-10-17
- Related: ADR-0221, [#2076](https://github.com/BotHarness/DeepSeekBot/issues/2076)

## Context

The initial Channel workspace composed fixed wrappers around message content. A subpanel could change side but could not split a sibling, preventing a right-hand column with two rows. Width-driven relocation has already been removed.

## Decision

Persist one application-defined binary split tree per stable Channel ID. Leaves represent message content and supported subpanels. Branches store a fixed axis and proportional allocation. Drop targets are the four edges of any visible leaf. This creates arbitrary nested rows/columns within the existing Channel workspace, not another workspace or Channel selection authority.

Keep visibility and control preferences under their existing owner. Project unavailable/closed leaves out of rendering without deleting saved geometry, so reopening restores topology and proportions. Group availability and keyboard command identities stay unchanged.

Render content through stable keyed React portals into owned containers. Layout slots adopt those containers; only geometry changes when a leaf moves. Avoid recreating content, issuing data requests, or reapplying Dockview options for a drag. Headers keep titles and tabs on one line, allow tabs to scroll, and reserve action width.

Version 7 backs up the original local layout before conversion. Existing side/fraction records seed an equivalent tree lazily; after the first layout edit, the tree is geometry authority. Existing open/hidden-control records remain authoritative. Invalid trees fall back to the preserved legacy geometry. Reset clears both.

## Consequences

Nested geometry survives close/reopen, refresh, and Channel switching. Very small surfaces may clip content; they never move automatically. No Host/CLI seam or permission changes. Reverting to a v6 Client requires restoring the versioned pre-upgrade local backup to recover the old layout; new nested arrangements cannot be represented in v6.

Verify sibling drops, visible drop previews, continuous resize, content identity, legacy backup, Channel isolation, shortcuts, and Web/macOS rendering.
