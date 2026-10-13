---
Status: Accepted
Date: 2026-10-13
---

# Diagnostic Bundles are local, redacted, read-only exports scoped by a message range

A bug such as "I @-mentioned a Bot in a Group, why did it answer in its DM?" spans the Group Channel, the Bot Inbox Admission, the Bot's native Orchestrator Session (where `channel_send` chose its target), the Human–Bot DM and the Outbox. Channel facts live in `botharness.db` and native tool calls live in DSH Session Persistence. The only existing export, the Profile Backup, is all-or-nothing, holds every secret-adjacent fact and declares Session content unsupported, so users had no way to hand the evidence of one problem to a maintainer ([#1533](https://github.com/BotHarness/DeepSeekBot/issues/1533)).

## Decision

- **One local file per user action.** A Diagnostic Bundle is a zip that the Human downloads through the existing Connection Fetch seam. DeepSeekBot never uploads it.
- **Scope is a closure from one Channel and one message range.** The Human multi-selects messages in the timeline (mouse long-press or **Select** in the message menu); the range runs from the first to the last selected message, or from a single selected message to now (later: a time range), padded by 30 minutes on each side, and the selected messages are marked in the manifest and timeline. Every Bot that posted, was mentioned or received a delivery in that range brings its Human DM, its Inbox admissions in the exported Channels, and its owned Orchestrator, Assignment and Subagent Sessions. A turn already running at the range start is kept from its `turn/start`, and a turn running at the range end is kept to its `turn/end`, so the work leading up to and following the problem is visible. Other Channels never enter, including admissions caused there.
- **Content is kept; Memory files are not.** Message text enters the prompt, so it is needed. The prompt and tool calls actually used are already in the Session transcript, so Memory files, Workspace files, attachment bytes, credentials, settings values and private-input values are excluded.
- **Standard redaction is the default.** The home folder becomes `~`, the DSH home becomes `$DSH_HOME`, other absolute folders become a per-bundle pseudonym while the file name stays, and token patterns, secret-named fields, URL secrets, emails and request headers are replaced. JSON text inside tool arguments is parsed and redacted field by field. Pseudonyms use a random per-export key that is never written, so they correlate within one bundle only. Redaction is pattern-based and documented as best effort.
- **Preview is what downloads.** The Host collects and redacts once for the preview, keeps the result in memory for five minutes, and serves exactly that bundle once. Nothing is written to disk.
- **No authority.** The application-defined `DiagnosticsExport` module only reads through the owning modules' queries (Channel store, Inbox history, Session Ownership) and the native `sessionQuery.readSession` seam, falling back to the Host's Session store. It creates no table, SessionEvent or store. Bounded range, Session count, events per Session and size are recorded as omissions in `manifest.json` rather than dropped silently.

## Considered Options

- **Reuse Profile Backup:** rejected. It is for restore, carries the whole Profile and does not include Session content.
- **Export whole Sessions:** rejected as the default. Orchestrator Sessions are long-lived, so a whole Session would carry unrelated conversations and be large; the range plus in-flight turn extension covers the problem window.
- **Include Memory files:** rejected. The effective prompt and tool calls are in the Session transcript.
- **Upload to a support endpoint:** rejected. The user decides where the file goes.

## Consequences

- No Profile schema Generation change and no new persistent state; reverting removes the menu item and the two Connection Fetch routes.
- A strict structure-only redaction level, a CLI verb, time-range selection, copying and forwarding the multi-selection, `logs.db` rows and IM ID pseudonyms are later slices of #1533.
