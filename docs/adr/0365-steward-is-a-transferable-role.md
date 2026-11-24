---
Status: Accepted
Date: 2026-11-25
---

# ADR-0365: Steward is a transferable role

## Context

Tob is a protected PersonaBot singleton: the Host reserves one per Profile, refuses to archive or delete it, and lets only its root Orchestrator manage the Host through the scoped Shell broker ([Tob decisions §1, §3, §4](../decisions/tob.md#adr-0223)). Its Soul and Memory are editable and portable, but its management authority never moves.

That made Tob feel imposed. A Human who has worked with another Bot for a long time has richer Memory in that Bot than in Tob. A Human who opens a new Environment and imports a Bot that already manages another Environment wants that Bot to manage this one too. Today both have to start over with Tob.

On the phone, Tob also needed its own entrance (the Tob entry bar on Chats, ADR-0268 as amended by #5106), which put a Composer-shaped control on a screen that otherwise has no Composer.

## Decision

**Steward** is a role, not a Bot. Every Environment always has exactly one Steward. The built-in Tob holds it by default, and its name and avatar are editable like any Bot's.

The role is a capability set, and it moves as a whole: scoped CLI management through the Shell broker (§3, §4), the self-escalation guard (§8), Tob Delegation, and any later Steward capability. The Host checks "is this Bot the current Steward", never "is this Bot Tob". Authority still comes only from the accepted Human DM of the current execution, as today.

The Steward's system prompt stays as close as possible to an ordinary Bot's: at most one short Steward addition, ideally none beyond the capabilities' own tool and command descriptions.

Transfer is a swap. The new Steward keeps its Soul, Memory and prompt and gains the capability set. The old Steward becomes an ordinary Bot that keeps its Soul and Memory. After that it can be archived or deleted, including the built-in Tob. The Host refuses to archive or delete the _current_ Steward.

Transfer does not compact either context. Each side's Human DM gets a system marker naming the new Steward, so the model sees the change in its timeline.

Only the Owner can transfer the role to an active Bot they own, from Bot settings on desktop and phone or through the Human's CLI, after a confirmation that lists what the Bot will be able to manage. The transfer command is Human-only: a Steward request for it is refused before any approval card, like browser pairing (§8). Importing a Bot never makes it the Steward, even if it was the Steward where it came from. Team members never see the transfer entry.

On the phone, the Tob entry bar and Tob Mode are replaced by a **Pinned tab**: one tab-island slot bound per Environment to any conversation, defaulting to the Steward's DM (#5191).

## Rejected alternatives

- **Keeping authority on the Tob singleton and only allowing renaming**: the Bot the Human actually relies on still could not manage anything.
- **Compacting on transfer**: a changed tool set misses the prompt cache once whether or not the context is compacted. Compacting also loses context and costs an extra summarizing call. The timeline marker covers the stale assumption that compacting would clear.
- **Attaching Steward tools to every Bot and checking at execution**: the tool set would never change, but every Bot would carry the definitions on every turn and could call tools that are always refused.
- **Calling the role Admin**: it collides with the Team mode Admin role, and this role is not administrator access.
- **Transfer on import**: management authority over a Host would move with a file, outside the Owner's decision.

## Consequences

The Host persists the role and transfers it in #5193. The self-escalation guard and the M15 security suite (#4197) check the current Steward. The Pinned tab and the retirement of Tob Mode ship separately (#5195 and #5198).

A Bot that becomes the Steward stays in its Groups. Its Steward capability activates only in accepted Human DM turns.
