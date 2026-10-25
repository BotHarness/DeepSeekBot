---
Status: Accepted
Date: 2026-10-26
---

# Message Feedback separates private evidence from anonymous telemetry

Humans need to report a Bot's behavior from one message with enough conversation and execution evidence for maintainers to investigate. [ADR-0185](0185-diagnostic-bundles-are-local-redacted-read-only-exports.md) made diagnostic bundles local-only and placed their export in message multi-selection. The Human has chosen deliberate online feedback and a simpler selection workflow; the consolidated [design](../proposals/message-feedback.md) was confirmed on 2026-10-26 and is not implemented.

## Decision

Message Feedback is application-defined, initiated by the Human from one message, and separate from anonymous Telemetry. Disabling Telemetry does not disable deliberate feedback or allow feedback to turn Telemetry back on. Multi-selection offers copying and screenshots; diagnostic download moves to the feedback form as a secondary action that never uploads by itself.

The Host diagnostics owner reads existing canonical conversation and execution records under their existing access checks. It prepares a frozen, redacted snapshot of the Human's chosen evidence, shows scope and missing material before submission, and uses that same snapshot for download and upload. Default scope is nearby messages and complete related execution turns, with an explicit option for entire Sessions. The diagnostic copy does not become Session Persistence or a second messaging authority.

A separate application-defined feedback service owns durable report acceptance, idempotent receipts, private evidence storage and deletion. PostHog holds rating, classification and non-content evidence metadata keyed by feedback ID; authorized maintainers follow that ID to a protected detail view. Conversation text, Session/Inbox/delivery evidence and free-text comments stay in private storage, are accessible only to authorized maintainers, and expire after 30 days. Early deletion requests use the feedback ID. Non-content aggregates may remain. No public diagnostic download link enters PostHog.

Only durable report/evidence acceptance constitutes successful submission. A PostHog indexing failure does not require another Human upload. Missing evidence is disclosed rather than fabricated; failed submissions preserve the current form for manual retry or download, and retries of the same submission do not create duplicate reports. Automatic telemetry never receives the diagnostic body.

## Trade-off and consequences

This deliberately revisits ADR-0185's rejection of uploading, while retaining local download, read-only source access and redaction. It adds private storage, authorized maintainer retrieval and content deletion responsibilities, but makes voluntary reports easier to investigate without broadening background data collection. Diagnostic evidence may help reproduce a problem; it does not promise a replayable execution environment.

Storing the entire archive in ordinary PostHog events was rejected: event-size constraints and analytics retention do not match a potentially large archive with a 30-day content lifecycle. Splitting the archive across events would add incomplete-delivery and deletion ambiguity. PostHog remains useful for classification without owning diagnostic acceptance. See the linked design for official source evidence, delivery slices and verification criteria.

This is an accepted target boundary, not authorization to upload current user data, deploy infrastructure or claim runtime qualification. Until implementation ships, ADR-0185 continues to describe the existing local diagnostic behavior.
