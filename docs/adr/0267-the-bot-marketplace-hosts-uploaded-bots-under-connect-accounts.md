---
Status: Accepted
Date: 2026-10-27
---

# The Bot Marketplace hosts Uploaded Bots under Connect accounts

> Supersedes the "no accounts, no hosted uploads, no counts" part of [ADR-0135](0135-a-bot-moves-between-people-as-a-zip-of-its-memory-files.md). Bot Zip stays as it is.

The Bot Marketplace is little used. People worry about what a shared Bot's Memory reveals, and sharing needs a GitHub account, which most Humans do not have. Hosted Connect (ADR-0241) has since brought WorkOS accounts with Google sign-in into the product anyway, so the main cost ADR-0135 avoided, running a sign-in service, is already paid. The Human chose on 2026-10-27 to let signed-in authors upload Bots directly, beside the GitHub-indexed catalog.

## Decision

- **Two sources, one catalog.** Indexed Repositories (ADR-0131) stay. An **Uploaded Bot** is a second kind of entry, listed, searched, installed, counted and recommended the same way.
- **Accounts.** Uploading, replacing and deleting require the Connect WorkOS account. Installing and browsing need no account. An author has a free display name (any language, duplicates allowed) and a system-assigned, never-changing short ID that tells same-named authors apart. The email is never shown.
- **Files, not archives.** An upload is the Memory files of one Share Draft with no Git history, stored file by file in R2 under its path, so the detail view shows the folder tree, file type and count breakdown, and readable text files. Limits: 50 MB and 2,000 files per Bot, 5 MB per file, a text and image extension allowlist (scripts allowed and flagged, binaries and archives refused), 20 Bots per account, 10 replacements per hour.
- **No versions.** Replacing an Uploaded Bot deletes all its old files and writes the new set. Deleting it, or deleting the account, removes its files, row and counts from the server. Installed copies are never touched; the catalog only shows that the author updated.
- **Install.** Install creates a fresh PersonaBot from the files and makes one initial commit.
- **Tob guards both ends.** Before upload, Tob reads the source Bot's Memory and builds the Share Draft with the Human file by file; the source Memory is never changed. Before an install, Tob reviews the incoming files for prompt injection, exfiltration instructions and scripts and shows what it found; if Tob cannot review, the Human may install anyway after a notice. The server adds no model review; the allowlist, reports and the administrator blocklist from ADR-0131 still apply, and uploading requires accepting terms on privacy and content responsibility.
- **Honest install counts.** A Host sends one Install Receipt per completed install, keyed by a random marketplace-only Host identifier unrelated to Telemetry, so each Host counts once per entry. This covers both kinds of entry and both UI and CLI installs.
- **Recommendations and a daily digest.** Daily snapshots rank Hot (installs in the last 7 days), New (uploaded or indexed in the last 7 days) and Rising (growth over the previous 7 days, above a floor). The Worker writes a daily digest article from a fixed template with the free OpenCode models (ADR-0240's model selection): an editorial text that reads into a few featured Bots, including a bounded sample of their files, with embedded Bot cards that install in one tap. Digests are kept by date and readable later. Model output is untrusted text filling template slots, never markup.

## Considered Options

- **GitHub only (ADR-0131/0135):** kept as one source, rejected as the only one, because it shuts out Humans without GitHub.
- **Unique handles:** rejected; English-only handles are hard to choose. A display name plus a system ID, as Discord and others do, is freer.
- **Versions:** rejected for simplicity; replacement is enough while installs are copies.
- **Counting Install clicks:** still rejected; only completed installs count.

## Consequences

- The Marketplace Worker gains R2, account-checked write routes, receipts, snapshots and digests; the Connect relay's account deletion also deletes the account's Uploaded Bots.
- The desktop harness ships first, the product site's market page second, mobile third.
