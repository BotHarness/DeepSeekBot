# ADR-0184: Client-local composer recovery is not message authority

Status: Accepted

## Context

Switching Channels, refreshing or reopening a browser must not discard an unsent Human draft. Recovery must not invent a Source Event, disclose unsent text to a model, or silently change selected targets. The accepted scope is tracked in [#1458](https://github.com/BotHarness/DeepSeekBot/issues/1458).

## Decision

Application-defined Client recovery owns device-local drafts, separate from Host-owned message authority. The browser storage instance and a trusted Host/Profile/Human/Channel tuple scope each draft. Host and Profile issue persistent opaque UUIDs; ports, display names and Bot slugs are not recovery identities.

The implemented draft slice ([#1459](https://github.com/BotHarness/DeepSeekBot/issues/1459)) persists text, explicit mention and Channel tokens, reply ID, and uploaded attachment references in browser localStorage. Quote chips persist only the quoted message ID, the excerpt the Human selected and the Human's reply to that quote; the author and preview shown on a chip are rebuilt from loaded messages and are not stored. Restoring checks each quote target with the Host as well, and drops a quote whose target is gone or no longer holds the excerpt. It never persists File bytes or reply bodies. Restoring blocks submission until current Host references and roster targets are validated. Missing uploads require removal or re-selection; restored `@all` requires explicit re-selection. Unsent text stays outside Source Events, Session Persistence, Memory and telemetry.

Each write publishes an immutable version before removing causally dominated versions. Vector clocks preserve concurrent tab edits; active input is not overwritten. Resolving a conflict explicitly joins the observed versions and revalidates the selected context. Empty drafts are durable tombstones. Storage errors preserve in-memory edits and prior persisted bytes, with visible warnings rather than a claim of successful persistence. Each record has a 1 MiB budget and each scope has at most 100 live conflict heads.

The submission slice ([#1460](https://github.com/BotHarness/DeepSeekBot/issues/1460)) adds a second Client-local record under the same Host/Profile/Human/Channel scope: one bounded list of submission attempts. An accepted submit first saves the text, explicit tokens, reply ID and uploaded references under the original client message ID, then clears the composer; an input refused before submission is removed again and stays a draft. Each attempt is `pending`, `sent`, `failed`, `unknown` or `restored`. A Host answer that rejects the send is `failed`; a request that got no answer is `unknown`, shown as "not confirmed" rather than as unsent. A `pending` record left by a closed page is treated as `unknown`.

An `unknown` attempt is reconciled only by asking the owning Host for the original message ID. A committed message settles it as `sent` and the local bubble gives way to the canonical one; a definite absence makes it `failed` and restorable; no answer leaves it `unknown` and blocks restoring it. Nothing is resent automatically and there is no retry queue. The Host already treats a repeated ID with identical content as the same message, so a lost acknowledgement cannot create a duplicate.

Up on an empty composer recalls this Channel's attempts, newest first; Up and Down step through them and Down past the newest restores the draft that was there before. Recall fills the text and the explicit tokens that are still valid and never sends. It does not bring back attachments or the reply target and says so. Once the recalled text is edited, the arrow keys move the caret again; IME composition and the mention, Channel and slash menus keep the keys.

Ordinary history is the newest 100 settled attempts within 256 KiB, trimmed oldest first; these numbers are product choices, not a standard. Failed and unconfirmed attempts are never trimmed by that budget. The list is recovery data, not a message log: canonical messages remain Host-owned, and a restored attempt stays only as recall text.

## Trade-offs

Reference validation that leaves the serialized draft unchanged updates only the local recovery snapshot, not its durable version. Only normalized reference changes create a new durable version. Otherwise idle tabs would repeatedly validate and rewrite each other's identical drafts, producing storage events and unnecessary Host requests.

Browser-local storage is synchronous and origin-bound; clearing it, private browsing, disabled storage or quota exhaustion can prevent recovery. This is not a backup or cross-device sync service. Uploaded references can survive a reload, but local file bytes and their image previews cannot. Keeping recovery outside the Host avoids a second conversation authority and keeps unsent Human intent private from agents.
