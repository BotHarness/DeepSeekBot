---
Status: Proposed
Date: 2026-11-22
---

# ADR-0360: Artifact review is a headless protocol with pluggable renderers

## Context

Bots increasingly answer with files: Markdown reports, code, CSV, PDF, HTML pages, Office documents. Most of the Human's work on them is review, not editing. Today the Desktop and Web Client preview only images and audio inline (`message-attachment.tsx`); every other Attachment is a download. The mobile app shows images and hands every other file to the system share sheet (`message-attachments.tsx`). Reviewing a Bot's report from a phone means opening it on a computer.

Claude Artifacts and similar products show the value of rendering agent output in place and letting the Human answer on it. We surveyed the reusable options (2026-11-21):

- **Ryugi** (`Innei/ryugi`) has the closest interaction model: block-addressed documents, anchored comment threads sent back to the agent session, a pass/reject verify flow, and a stable machine CLI envelope. Its runtime, `ryugi-artifacts`, is proprietary (`UNLICENSED`). Releases up to 1.51.2 were AGPL-3.0, which would extend to our Desktop and mobile distributions. Its skills use a source-available license. It is a plugin for coding-agent harnesses, not an embeddable SDK.
- **plannotator/artifact-server** (MIT/Apache-2.0) publishes, versions and comments on artifacts and exposes an MCP server. It is a standalone web service centred on HTML, images and video, not a library a product embeds behind its own authority.
- **MCP Apps** (`modelcontextprotocol/ext-apps`) and **mcp-ui** standardise sandboxed interactive HTML in an iframe talking JSON-RPC over `postMessage`. They cover interactive display, not review state.
- **A2UI** streams a UI description that native renderers draw. It generates interfaces; it does not review files.
- File-viewer libraries such as **anyview** render PDF, Office, Markdown and code in React, with no anchors or comments.

None separates review state from presentation in a way that both our Desktop/Web Client and React Native can share. Other agent projects face the same gap, which makes a separable package worth building.

## Decision

Artifact review is three layers. The seam between them is the **Anchor**: core speaks only Anchors, and a renderer's only obligation is to convert between Anchors and what it draws.

### 1. Spec: types and schemas, no behaviour

- **Artifact**: a reviewable file. In BotHarness it is always an existing Attachment or a Memory/Workspace file; the spec adds no new file identity.
- **Review Snapshot**: the exact bytes a review is about, identified by content hash, media type and size. Anchors and verdicts bind to a Review Snapshot, never to a mutable file.
- **Anchor**: a selector inside a Review Snapshot, modelled on the W3C Web Annotation Data Model instead of a new format. Text and Markdown use TextQuote plus an optional TextPosition. Code uses a line range plus a quote. PDF uses a page with an optional rect and quote. Tables use a cell range. HTML uses a CSS selector plus a quote. A whole-file Anchor is always valid.
- **Review Thread**: Anchor, status (`open` / `resolved`), and messages with author kind (`human` / `agent`), author identity and time.
- **Verdict**: `pass`, `reject` with a reason, or `waive`, bound to one Review Snapshot.
- **Review events**: thread created, message added, thread resolved, verdict recorded, snapshot published. Each has a stable id so a consumer can acknowledge exactly what it has read.

### 2. Core: headless review engine

- Storage is an adapter interface. BotHarness implements it on the Operational Database ([ADR-0041](../decisions/persistence.md#adr-0041)) for review rows, and on the existing file owner for snapshot bytes.
- When a newer Review Snapshot of the same Artifact appears, core re-anchors open threads by fuzzy quote match. A thread that no longer matches stays attached to its old snapshot and is marked `orphaned`; it is never moved silently.
- Core exposes an agent surface: list unread review events, reply, resolve, read a verdict, acknowledge by event id. BotHarness delivers it as a Harness Bot tool with a matching `deepseekbot artifact …` CLI command (CLI parity).
- In BotHarness, a Human comment or verdict becomes a **Source Event** to the owning PersonaBot. It enters through the existing Bot Inbox and attention policy, so review feedback wakes a Bot the same way a message does. Review does not create a second inbox.

### 3. Renderers: one per media type, replaceable

A renderer registers a `match(mediaType, name)` predicate and a component. It receives the snapshot bytes and the current Anchors. It reports a Human selection as an Anchor and draws highlights for given Anchors. It never reads or writes review state directly. A product can replace any renderer or the whole thread UI.

- **Web/Desktop**: React renderers. Markdown, code and CSV use existing libraries such as `react-markdown`; PDF uses pdf.js; Office formats use a client-side viewer, with download as the fallback.
- **Mobile**: Markdown, code, images and CSV render natively. PDF, Office and HTML reuse the web renderers inside `react-native-webview`, with the same Anchor bridge over `postMessage`.
- **Interactive HTML** runs in a sandboxed iframe with no Host credentials. It speaks the MCP Apps message protocol, so the same artifact also works in other MCP Apps hosts.

Rendering is only for display. The Bot still processes files with native tools ([ADR-0105](../decisions/im-providers.md#adr-0105)); renderers are not a document parser for the Agent.

## Relationship to existing decisions

- **Partially reopens [ADR-0100](../decisions/workspaces.md#adr-0100)** ("no attachment version archive"). Attachments stay live, mutable files with the identity and current-content semantics of ADR-0100. Review does not add continuous version retention. It stores a snapshot only when a Human starts a review or a Bot publishes one for review. That snapshot belongs to the review owner, is deleted with its threads, and follows existing purge ([ADR-0146](../decisions/persistence.md#adr-0146)) and backup ([ADR-0042](../decisions/persistence.md#adr-0042)) rules. Without it, an external edit would silently invalidate every Anchor.
- **[ADR-0178](../decisions/workspaces.md#adr-0178)**: the built-in reader for Memory files becomes the first consumer of the renderer registry. Message file cards gain a **View** action next to the existing split-button open and download controls, and download remains available.
- **[ADR-0105](../decisions/im-providers.md#adr-0105)**: unchanged. Opening a viewer grants the Bot no file access. Viewing and commenting use the Human's current Channel authority over that message and file.

## Delivery

1. **Viewer (no review state)**: the renderer registry and renderers for Markdown, code, CSV, PDF, HTML and images. Desktop/Web via message file cards and the Memory reader; mobile via a viewer screen. This removes the "open it on a computer" problem on its own.
2. **Review**: Review Snapshot, Anchors, threads and verdicts; Source Event delivery to the Bot; Bot tool and `deepseekbot artifact` CLI; re-anchoring.
3. **Extraction**: once the Desktop/Web Client and mobile both use core through the adapter interface, publish `artifact-spec`, `artifact-core` and the React renderers under the `bot-harness` organization under a permissive license. The spec stays versioned and BotHarness-free before publication. It is not published before two consumers have exercised it.

Each step needs proof in the running app: the file opens on a phone without a download, a selection becomes a stored Anchor, a comment reaches the Bot as a Source Event, the Bot's reply appears under the thread, and an edited file orphans or re-anchors threads as described.

## Considered Options

- **Embed `ryugi-artifacts`**: rejected. It is proprietary; the older AGPL releases would extend copyleft to our clients.
- **Run plannotator/artifact-server beside the Host**: rejected. It adds a second authority for files, identity and sharing, outside the Host's Channel authorization.
- **Viewer only, no review protocol**: kept as delivery step 1, but rejected as the end state. Comments would go back into chat as text, losing the exact position the Human meant.
- **A full UI kit with fixed presentation**: rejected. Other agent products need their own presentation; the Anchor seam lets them reuse state and renderers separately.
- **Anchors on the live file without snapshots**: rejected. With ADR-0100 semantics, any external save would move or invalidate every comment without notice.

## Consequences

- New product terms (Artifact, Review Snapshot, Anchor, Review Thread, Verdict) need [`GLOSSARY.md`](../../GLOSSARY.md) and `GLOSSARY.zh.md` entries before implementation names them. Once accepted, this record folds into a section of [Workspaces & files decisions](../decisions/workspaces.md).
- Office rendering fidelity in the open-source viewers is limited. Office files keep external open and download as the reliable path.
- Snapshots duplicate bytes for reviewed files. Size limits and cleanup follow the review owner's lifetime, not the Attachment's.
- The web renderers become a mobile dependency through WebView. Their bundle size and cold start need to be checked against the mobile performance targets.
