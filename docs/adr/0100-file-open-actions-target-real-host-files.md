---
Status: Accepted
Date: 2026-09-30
---

# File opening targets real Host files

Humans need to open Memory directories and files in their file manager or editor, then use the same interaction for ordinary Workspaces and message attachments. Opening uses DSH-native capabilities on the serving Host; each BotHarness owner resolves its own file identity before handing a validated path to that capability. This is an accepted target design, not evidence that the actions or attachment migration have shipped.

## Opening and presentation

Follow-up: [ADR-0178](0178-file-open-defaults-are-explicit-client-preferences.md) supersedes this first slice's menu-first external-open presentation and deferral of persistent default-application preferences. It adds explicit Client-local defaults and current-file actions from Evolution diffs, without changing the real-file or Host-authorization boundaries below.

The first tracer bullet covers the Memory Repository path in Workspace and current directories and files in Memory files. A displayed path can open an action menu on click. Dense file lists use context menus; suitable surfaces also offer an accessible icon button with a Tooltip and menu. Context menus retain a keyboard or touch-accessible entry. Ordinary file selection continues to open the built-in reader, and directory selection continues to expand its tree.

Directories offer the installed directory applications reported by DSH, including the platform file manager and supported editors. Files offer reveal, the system default application, and their registered application handlers. No custom executable selector or persistent BotHarness application preference is added. If a later slice adds a default-application shortcut, it may use a divided button with the application logo on the left and a more-actions menu on the right.

Native opening always targets the computer running DSH. Tailscale or Cloudflare Tunnel connectivity does not establish that the browser and Host share a filesystem or desktop. Actions make that target explicit and use the reported capability without treating it as proof of co-location. Files also offer download to the browser's device and copy Host path; unavailable launch operations explain the limitation. A downloaded file is a transferred local file, and editing it does not automatically write back to the Host. Directory download and historical Memory-version export are outside the first slice. Binary and oversized current files remain valid external-open and download targets even when the built-in reader cannot preview them.

The Client consumes existing DSH-native launch capabilities through the API Gateway rather than executing shell command text. BotHarness supplies its own interaction surfaces where native components are not public exports. Memory resolves a repository-relative path against its owning PersonaBot, retaining its `.git`, traversal, and symlink-escape checks; Workspace and Messaging resolve their own identities. Reusing the menu and launcher does not create a generic arbitrary-path authority or grant a PersonaBot new access.

## Message attachments are ordinary destination files

Sending a file transfers its bytes to a profile-managed location on the Host, preserving its safe filename and extension under an independent file identity. Opening that attachment opens this same destination file. Editing it changes the file subsequently displayed, read, or downloaded from the referencing message. The sender's original upload-source file is independent. There is no new editable copy on each open, attachment version archive, save-generated Source Revision, change admission, or Bot wake. This changes attachment semantics without removing Memory's existing Git history or Memory-change behavior.

Independent uploads receive independent identities even if their bytes match. Only explicit reuse of the same attachment identity makes several messages reference one file and therefore show the same changes. Content hashes may validate a particular transfer, but they do not identify a mutable file or require its future bytes to match its original upload. Reads and downloads use the file's current bytes and current metadata. Missing or unsupported targets produce an unavailable result rather than silently recreating a file. The Host does not infer external provider updates or synchronize an edited attachment back to its upload source.

Source Events retain their immutable message envelope, text, and attachment reference; an attachment reference identifies a live file rather than promising the originally sent bytes. Source Revision still applies to observed message edits or retractions, but an ordinary external file save is not another message. File ownership governs reference-aware cleanup and existing explicit purge operations. Profile Backup and selected exports capture the current referenced files and their identity mappings; they do not introduce continuous attachment version retention.

This supersedes the content-addressed attachment identity and immutable-byte authority in ADR-0037 and the attachment update in ADR-0008. The attachment slices establish independent real files and resolve retained references through their canonical identity bindings before offering in-place editing. Passing an existing shared hash-addressed object directly to an editor, or merely disabling its integrity check, does not implement this decision. Other content-addressed data, including SoulSnapshots, is unaffected.

## Delivery and verification

The published specification and Human-confirmed test seam live in [#572](https://github.com/BotHarness/BotHarness/issues/572).

The Memory slice must provide an operable repository menu, current file and directory actions, safe Host resolution, truthful remote behavior, and byte-preserving file downloads through the existing authenticated Host/Client seam. Validate actual file-manager and editor handoff on the tested platform, absent applications, stale or missing files, rejected path escapes, and downloads that preserve filename and binary content. A launch request being accepted is not proof that a window appeared.

Subsequent slices reuse the interaction for ordinary Workspace directories, then the transferred-file chips introduced in [PR #435](https://github.com/BotHarness/BotHarness/pull/435). The attachment slice must also prove that an external save changes the original message's next read/download, two identical independent uploads do not change together, explicit references to one file do, and file edits generate no Inbox admission or wake. It does not parse arbitrary path-looking message text into trusted file references.

## Retained reference binding (#577)

A retained Source Event's attachment occurrence, rather than its content hash, is the migration boundary. Messaging persists its independently reserved target fileId in the Operational Database and applies that binding in message projections without rewriting immutable envelopes or producing new message facts. The current legacy representation has no trustworthy per-upload identity or forwarding provenance, so separate occurrences receive separate destinations; after migration, only explicit canonical fileId reuse shares edits. This trades unrecoverable historical sharing for preventing accidental linked edits.

Pending bindings survive transfer interruption; the real-file owner verifies source and destination bytes before Messaging activates the reference. Ready bindings are never regenerated from old bytes. Message-qualified legacy compatibility resolves this same current target, while unqualified or ambiguous obsolete identifiers fail explicitly. Cleanup protects incomplete conversions and only releases an old shared object after every retained dependency is converted. The durable binding belongs beside Messaging facts in the existing database, with current file bytes/receipts remaining under the file owner; it is not an attachment version store.
