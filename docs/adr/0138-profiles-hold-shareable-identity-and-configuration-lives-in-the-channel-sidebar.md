---
Status: Accepted
Date: 2026-10-07
---

# Profiles hold shareable identity; configuration lives in the Channel sidebar

The PersonaBot Profile view had grown into a settings page. Below the name and activity charts it held Model presets, Standing memory limits, Bot Zip export, IM identities, pairing, Channel Bridges and the Wake Policy table, each styled differently from the rounded card rows of the Channel sidebar. The Group Profile carried member Wake Policy and Bridge tables the same way. We decided on one rule: **a Profile shows what travels with the PersonaBot when it is shared, plus read-only activity; everything operational is a Channel sidebar entry.**

## Decision

- **Profile = shareable identity + activity.** A PersonaBot Profile shows Display name, Avatar, Profile Banner, Bot Tags and Bot Bio, then token usage, event activity (Bot Inbox Admissions) and Memory commit activity. A Group Profile shows the Group's name, avatar and message activity. Neither has editable configuration beyond its identity fields.
- **The identity is what `bot.json` carries.** `.botharness/bot.json` gains `bio` and `banner`, and writes `tags` in place of `roles`; readers, including the Marketplace Worker, still accept `roles`. A banner is always also written as an image file under `.botharness/`, so a reader that does not know the generator can show it.
- **Configuration moves to the Channel sidebar** as separate collapsible entries the Human can reorder or hide like any other: in a PersonaBot DM, Model (the Model Plan), Wake policy, External identities, External connectors and, later, Approvals; in a Group, Wake policy and External connectors. Standing memory limits become one row of the Memory files entry. Wide tables become card rows that open a modal to edit.
- **Export stays a share action.** Bot Zip export is the Profile's share button and the App Sidebar context-menu item, not a settings section.
- **Approvals are configured beside connectors.** The Approvals entry lists pending requests, the paired Approvers and the Approval destinations picked from the PersonaBot's External connectors. A pending approval adds a count badge, distinct from unread, on the PersonaBot's avatar in the DM header and the App Sidebar. This amends where [#1019](https://github.com/BotHarness/BotHarness/issues/1019) places its configuration; its authority model ([ADR-0136](0136-lark-pairing-is-reviewed-bot-scoped-operational-authority.md)) is unchanged.
- **The Profile Banner is generated in BotPixel.** A new `@botharness/pixel-banner` package renders low-resolution pixel scenes (seasons, sea, mountains, desert, forest, night sky, space) from a `{scene, seed}` recipe, locked by a golden test like the avatar generator. A new PersonaBot's recipe is seeded from its Display name and saved, so a rename does not change it.

## Considered Options

- **Keep settings in the Profile view and only restyle them:** rejected. The Profile is what a PersonaBot shows to others and what export carries; mixing in local operational settings made it unclear what gets shared, and kept two visual systems.
- **One "Settings" sidebar entry holding everything:** rejected. Separate entries can be hidden and reordered individually and match how Schedules and Workspace Grants already work.
- **Static banner images bundled in BotHarness:** rejected in favour of a generator, so every PersonaBot gets its own scene without shipping a gallery, and the generator stays reusable outside BotHarness like the avatar packages.

## Consequences

- `CONTEXT.md` renames Role badge to **Bot Tag** and Bot description to **Bot Bio**, adds **Profile Banner**, **Approver** and **Approval destination**, and says the UI calls a Bridge an External connector and a Wake Policy 唤醒策略 / Wake policy.
- UI copy stops showing internal terms such as Human, PersonaBot and Source Event; that sweep is tracked separately from the layout work.
- (Amended by ADR-0183: Wake policy, External identities, External connectors and Group management are Channel settings sections, opened from the Channel, rather than Channel sidebar entries.)
