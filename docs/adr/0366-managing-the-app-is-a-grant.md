---
Status: Accepted
Date: 2026-11-26
Supersedes: ADR-0365
---

# ADR-0366: Managing the App is a grant

## Context

ADR-0365 made Steward a singleton role: exactly one Bot per Environment, moved by an atomic transfer. Reviewing it before #5206 merged (grilling session of 2026-11-26, #5191), the Human found that the singleton bought very little:

- The Pinned tab (#5195) can bind any conversation, so the phone no longer needs a special Bot to pin.
- Creating Bots and Groups and delegating to colleagues were never exclusive. Every Bot has `bot_create`, the `group_*` tools, `list_bot_contacts` and `bot_send_message`; only the Steward's DM blocked the direct tools (`TOB_CLI_ONLY_TOOLS`).
- What only the scoped CLI gives a Bot is managing the App by conversation: Host settings and models, maintenance, diagnostics (`doctor`, diagnostic logs, filing an issue), configuration that takes many steps in the GUI (such as remote connections), Share Drafts, voice and the long tail CLI parity adds. Then, separately, managing other Bots: their profiles, editing their Memory and Memory leases.
- Transfer, its revision swap, the two-sided markers and the automatic handover on a Team Owner change all existed only because the role was a singleton.

## Decision

**Managing the App is a grant**, resolved with the RBAC grant resolver (#5324, `packages/core/src/authorization/grants.ts`) like Browser and Computer access. The Owner turns it on for any of their Bots, for several at once or for none. There is no Steward role, no one-Steward invariant and no transfer.

- **Two switches.** "Manage the App" covers settings and models, maintenance, diagnostics, issue reports, Bot creation, Share Drafts, voice and Channels/Groups. "Manage other Bots" covers other Bots' profiles, editing their Memory and Memory leases. In code each is a set of CLI capability groups. The built-in Tob has both on; turning the grant on for another Bot leaves "Manage other Bots" off by default.
- **Where.** Bot settings, next to Browser and Computer access, on desktop, iOS and Android. The confirmation lists what the Bot will be able to do and that its writes follow its Approval Template. The CLI is `deepseekbot bot-grant <bot> manage-app|manage-bots on|off`, Human-only.
- **Authority source is unchanged.** The scoped CLI still runs only in the Bot's own accepted Human DM turn through the per-execution broker (Tob decisions §3, §6). A Group turn, external IM, another Bot or an Assignment never confers it. A Bot with the grant may be a Group member; in Group turns it is an ordinary member without the CLI. In its own Human DM it still cannot act as an ordinary Group member (`tob-cli-required`).
- **Approvals follow the Approval Template.** A CLI write is no longer always behind a card. It asks or runs according to the Bot's Approval Template and saved Always-allow rules, like any other tool. A fixed list always needs a fresh Human decision whatever the template says: deletion and archiving, editing another Bot's Memory, restoring a Profile Backup, and credential and pairing commands (pairing and the Daily Browser grant stay refused, as today).
- **Self-escalation guard, generalized.** A Bot with either grant cannot change the authority (Workspace Grants, Browser or Computer, Approval Template, mode, approval route, pending approvals) of any Bot that holds a management grant, including itself, and cannot turn a management grant on or off. Only the Human does, in Bot settings or their own CLI.
- **Fewer tools.** `bot_create` is removed from every Bot's direct tools; creating a Bot goes through the CLI and therefore needs "Manage the App". The `group_*` tools stay direct for every Bot, and the Tob-DM special case that disabled them is removed. On native Bots removing a rarely used tool is cheaper than deferring it through `tool_search` (measured in the instruction-set Mode thread, #5338).
- **Delegation is ordinary.** Every Bot can delegate through `bot_send_message`. Telemetry counts delegations started from any Bot's Human DM.
- **Prompt and cache.** A Bot with the grant gets one short line: for problems with the App, run `deepseekbot capabilities` and `doctor` first and use the CLI itself. The delegation half of the old `STEWARD_PROMPT` is dropped. Turning a grant on or off never edits a running Session's system prompt and never changes its tool list (Bots with and without the grant have the same tools). The Host appends a `[Host timeline]` marker to the Bot's Human DM instead, in the form of the model switch marker, stating that the Bot can or can no longer manage the App. The line moves into the system prompt at the Session's next compaction or in a new Session, when the prefix is rebuilt anyway.
- **Tob is an ordinary Bot.** Each new Profile still creates the built-in Tob with both grants on, as the first Bot the Human talks to and the one that helps configure the rest of the App after onboarding. It can be renamed, archived, deleted and shared to the Marketplace. Deleting or archiving the last Bot with "Manage the App" warns that no Bot will be able to manage the App until the Human turns the grant on for another.
- **Pinned tab.** It defaults to the built-in Tob's DM and falls back to the most recent conversation in Chats when Tob is gone. It is otherwise unrelated to the grant.
- **Team mode.** Only the Owner's Bots can hold a management grant for now. When the Owner changes, the former Owner's management grants are revoked and the new Owner's Tob gets both. A scoped grant for members' Bots is a separate issue. Importing a Bot never brings a grant.

## Rejected alternatives

- **The singleton Steward role of ADR-0365.** Its exclusivity protected nothing the per-turn source check, the guard and approvals do not already protect, and it cost a transfer flow, a swap table and Owner-change handover.
- **Removing the Bot's path to the CLI entirely.** Diagnosing and configuring the App by conversation, especially from the phone, is the main reason to have Tob.
- **Deferring `bot_create` and `group_*` behind `tool_search`.** On native Bots deferral cost more than it saved, because tool schemas are almost always cache hits.
- **Compacting when the grant changes.** A timeline marker keeps the cached prefix; a compaction loses context and costs a summarizing call.
- **Always showing a card for every CLI write.** These commands run because the Human asked for them; the Approval Template already expresses how much the Human wants to be asked.

## Consequences

PR #5206 is closed. A new PR from main replaces Tob special-casing with grant checks, reusing #5206's call-site refactor, guard and deletion changes. The Approval Template change and the generalized guard are permission changes, so the M15 real-LLM security suite (#4197) runs before merge and gains cases for several grant holders, revocation and the fixed confirmation list. #5197 becomes the grant switch UI. #5198 is unchanged. Tob decisions §1, §2, §4, §5 and §8 and the glossary entries Tob, Steward Bot and Pinned tab are rewritten with the implementation; the term Steward is retired.
