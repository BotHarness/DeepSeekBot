---
Status: Accepted
Date: 2026-10-06
---

# A Bot moves between people as a zip of its Memory files

> Partly superseded by [ADR-0267](0267-the-bot-marketplace-hosts-uploaded-bots-under-connect-accounts.md) (2026-10-27): the Bot Marketplace now hosts Uploaded Bots under Connect accounts and counts installs. Bot Zip is unchanged.

BotHarness drops platform accounts for good. The account-based second phase of the Bot Marketplace ([ADR-0131](0131-bot-marketplace-starts-as-a-github-indexed-catalog.md), [#17](https://github.com/BotHarness/BotHarness/issues/17)) is withdrawn: an open-source harness should not need a sign-in service, email delivery or hosted uploads to share a Bot. Public sharing stays GitHub-only through Indexed Repositories. Handing one Bot to another person or another device becomes plain file sharing: the Human exports the Bot as a **Bot Zip**, sends it any way they like, and the receiver imports it as a fresh PersonaBot.

## Decision

- **No accounts.** No Better Auth, Email OTP, Passkey or social sign-in, no hosted uploads, favorites, import receipts or counts. The Bot Marketplace keeps listing public GitHub repositories with the `botharness-bot` topic (ADR-0131 Phase 1).
- **One creation menu, three sources.** The roster's create entry becomes a submenu: **Start empty**, **Import from GitHub** (any Git URL, the existing #298 path) and **Import from zip**.
- **Export is quick.** Exporting a Bot is a few clicks from its profile. The Human can include only chosen files or leave chosen files out.
- **Files only by default.** A Bot Zip holds the current Memory working tree, including uncommitted changes, and `.botharness/bot.json` with its avatar so the import keeps the Bot's name, roles and avatar. It never holds Git internals such as `.git/config`, hooks or `refs/botharness/recovery/*`.
- **Git history is opt-in and whole-Bot only.** An **Include Git history** checkbox is offered only when no files are excluded. A zip with history carries every ordinary branch and tag; a partial export never does, because history would leak the files the Human left out.
- **Import creates a fresh Bot.** A zip without history becomes a new Memory Repository with one initial commit; a zip with history keeps its branches and tags. Identity, Sessions, IM bindings, Workspace Grants and credentials are never in a Bot Zip.
- **Safety prompts.** Export reminds the Human to check for secrets and personal data. Import shows the same third-party content notice as a Marketplace install.

## Considered Options

- **Accounts and hosted uploads** (ADR-0131 Phase 2): rejected. It needs auth, email, storage and moderation for a feature that file sharing already covers.
- **Always include Git history:** rejected. Most shares only need the files, history makes the zip larger, and it can carry content the Human deleted on purpose.
- **Revive PersonaBot Export / SoulSnapshot** ([ADR-0040](0040-personabot-export-wraps-soul-and-optional-operational-facets.md), ADR-0020): rejected. A Bot Zip is only Memory files plus the portable descriptor; it has no schema-versioned facets or database state. A whole Profile still moves through Profile Backup (ADR-0042).

## Consequences

- ADR-0131's Phase 2 is superseded; its Phase 1 stands. #17 is closed as not planned and #18 points here.
- `CONTEXT.md` gains **Bot Zip**; the Bot Marketplace definition no longer promises uploaded Bots.
- Delivery is tracked in [#1059](https://github.com/BotHarness/BotHarness/issues/1059).
