# ADR-0273: Disbanding a group deletes its content

- Status: Proposed
- Date: 2026-10-28
- Supersedes: the "Ordinary Channel deletion" column of [ADR-0130](0130-deletion-preserves-history-and-makes-memory-erasure-explicit.md) for local groups
- Related: [ADR-0146](0146-content-purge-retains-file-selectors-and-settles-issued-effects.md), [ADR-0262](0262-assignments-carry-a-title-and-description.md)

## Context

ADR-0130 made Channel Deletion end membership and routing while keeping history, with Content Purge as a separate, reviewed step. For local groups this left two steps where the Human expects one: disbanding kept every message and file, the ended group stayed reachable only from the desktop Ended Channel history, mobile could not see or purge it, and its cached tail stayed on the phone. Disbanding also left work half-alive. Bot turns kept running and failed every tool call. Approval and question requests vanished from the Human's attention while their Bots kept waiting. Assignments whose triggering message had not been handled were fenced mid-run.

## Decision

**Disbanding a group is deleting it.** One confirmation, no options, no undo, no ended-group view on any client.

- **Who.** Only the Human disbands a group. A Bot, including the group's creator Bot, can leave but cannot disband.
- **Content.** The group's messages and their exclusively referenced files are removed through the Content Purge owner (ADR-0146) in the same operation. A Source Event or file that also appears in another Channel keeps its other placements; only this group's placement goes.
- **Outside the group, nothing changes.** Bot Memory, Workspace files, DSH Session Persistence and messages already mirrored to an external IM stay as they are.
- **Identity.** Only the group ID and a deleted marker remain. Name, avatar, members, wake policies, invitations and join requests are removed. Places that still reference the group show "Deleted group".
- **Running work.**
  - Bot turns started by the group are stopped.
  - Pending tool approvals and user questions in the group settle at once as cancelled because the group was disbanded.
  - Assignments the group started keep running from their own title and description, not from the purged source message, and report to the parent Bot's DM as usual.
- **Clients.**
  - The group leaves every roster section.
  - Mobile deletes its cached conversation for the group, and purge frames clear any copy still cached.
  - Notifications already delivered by the OS are not recalled.
- **Naming.** The UI word is "Disband group" / 「解散群聊」 everywhere. The CLI keeps `group-delete --confirm`.
- **Earlier disbanded groups** are not purged automatically. They stay in the desktop Ended Channel history, where the Human can purge them by hand.

## Considered options

- **Keep history by default and offer an "Also delete messages and files" checkbox** (like Bot deletion's Memory checkbox). This was rejected because it is two concepts for one familiar action.
- **Stop every Assignment the group started.** This was rejected because the work belongs to the Bots and already carries its own brief.

## Consequences

- Bridged Channels (Lark, Slack and others) keep ADR-0130's behaviour: deletion closes local routes and keeps history.
- The Ended Channel history now only matters for those Channels and for groups disbanded before this change.
- The disband confirmation states that messages and files in the group are deleted and that this cannot be undone.
