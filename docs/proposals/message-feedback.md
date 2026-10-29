# Message selection and feedback

Status: Historical interview. Storage/upload portions superseded by the Human on 2026-10-26; current behavior is defined by ADR-0256 and docs/message-feedback.md.

Current decision: only rating/tags/comment go to PostHog; all diagnostic Session/chat/Inbox content is downloaded locally for user-controlled sharing. No dedicated receiver, private evidence store or feedback domain. The original interview below is retained as rationale, not current requirements.
Date: 2026-10-26

## Confirmed behavior

- Desktop and native mobile support message selection through the message menu. Keep desktop hover actions and context menus.
- Multi-selection offers copy and screenshot. Remove diagnostic export from that interaction.
- Remove the message menu's locate action. Clicking a reply reference navigates to its original message.
- Message Feedback starts from one message, without entering multi-selection. It evaluates Bot performance with a required good/bad rating, optional multi-select category tags and an optional short comment. It also applies to a Human message when reporting a missing Bot response.
- The requested feedback destination is PostHog. Feedback must support conversation and Session content so maintainers can investigate and reproduce problems.
- Default nearby conversation scope is the preceding and following 20 messages, adjustable by the Human; do not implicitly select everything from the anchor to now.
- Default execution evidence includes complete related Orchestrator turns and related Assignment/Subagent execution records. Including an entire long-lived Session is an explicit option.
- Nearby messages, related Session evidence, Bot Inbox and delivery records are selected by default. Show counts and scope, allow category deselection and expanded inspection, and send only when the Human submits. Cross-Channel content is separately identified.
- Exclude credentials, raw Workspace/Memory files and original attachment bytes; redact execution evidence.
- Keep Download diagnostic bundle as a secondary feedback-panel action using the same selected, previewed content. Downloading does not submit feedback.
- Good tags: accurate answer, task completed, understood intent, fast. Bad tags: incorrect answer, did not follow instructions, task incomplete, no response, duplicate/wrong destination, slow, interface problem, other. Tags are optional and multi-select; the optional comment is limited to 500 characters.
- Diagnostic content is accessible only to authorized maintainers, retained for 30 days, then deleted. Non-content rating/category aggregates may be retained long term. Successful submission returns a feedback ID for follow-up and early deletion requests.
- Missing evidence is explicitly listed; the Human can submit the available remainder. Upload failures preserve the current form and offer manual retry or download, without unbounded background retries. Retrying the same submission must not create duplicate feedback.
- Preview freezes the selected evidence; later messages do not silently enter the submission. The Human may explicitly refresh the evidence.
- Deliberate feedback remains available when anonymous telemetry is disabled and never re-enables telemetry.
- Desktop right-click and mobile long-press enter multi-selection with the anchor message selected. Tapping messages toggles selection; the toolbar directly exposes Copy, Screenshot and Cancel. Selection is limited to one Channel and exits on Channel change. Screenshot produces a previewable long image; mobile supports saving or system sharing.
- First delivery slice: desktop single-message feedback through automatic evidence selection, preview and actual submission. Seek Human feedback on this working slice before expanding to native mobile feedback and both clients' selection changes. All remain within the requested scope.
- PostHog stores a small feedback index: rating, tags, version, feedback ID and evidence summary. Private storage holds conversation/execution evidence and the free-text comment. The feedback ID links to an authenticated maintainer detail view, never a public archive URL.
- Submission succeeds only after the report and diagnostic evidence are durably saved. A subsequent PostHog indexing failure does not require the Human to upload the evidence again.

## Ownership and lifecycle

The accepted boundary decision is recorded in [ADR-0254](../adr/0254-message-feedback-separates-private-evidence-from-telemetry.md). It changes the local-only restriction of ADR-0185 only for deliberate Message Feedback; automatic Telemetry remains content-free.

The application-defined Host diagnostics owner reads canonical Channel, Source Event, Bot Inbox Admission, Outbox and DSH Session Persistence facts under existing access checks. The preview and downloadable/submittable evidence share one frozen, redacted snapshot. This is a diagnostic copy, not a new conversation or execution authority. Existing history remains unchanged.

An application-defined feedback service owns the durable report, idempotent submission receipt, evidence expiry and maintainer access. The Client is a Consumer of Host capabilities, not an independent evidence collector. PostHog is a classification index, not the authority for acceptance or private diagnostic content. The existing ingest Worker is a stateless proxy; storage and receipt ownership are new work, not existing capabilities.

## Delivery and verification

1. Deliver desktop message menu → feedback form → automatic evidence proposal → inspect/deselect → submit → durable receipt → authorized maintainer retrieval. Include the secondary local download and prove that it contains the same frozen evidence. Verify positive/negative feedback, a Human message with no Bot response, explicit missing evidence, manual retry without duplicates, and telemetry disabled.
2. Obtain Human feedback on that working path before expanding. Implement native mobile feedback and the agreed selection/copy/screenshot/menu changes on desktop and native mobile. Exercise iOS and Android, quote navigation, per-Channel selection cleanup and image preview/save/share. Coordinate quote-navigation work with [the mobile mentions and replies design](mobile-mentions-and-replies.md); do not create a competing reply model.
3. Before release, verify authorized retrieval, rejection of unauthorized retrieval, expiry and early-deletion handling, and PostHog index failure without lost or duplicate reports. No live content submission is authorized by this design interview; runtime qualification must use intentionally prepared test evidence.

Every added Host method or route must ship its matching model-free CLI path, command coverage and bilingual CLI documentation in the same implementation PR, as required by repository CLI parity. Runtime qualification follows verify-deepseekbot and the shared-device workflow for native checks. Issue claims, release fragments and PR evidence belong to the subsequent delivery workflow; this document does not claim the feature has shipped.

## Storage evidence

PostHog's official [ingestion warnings](https://posthog.com/docs/data/ingestion-warnings) state that processed ordinary events over 1 MB are discarded. The [capture API](https://posthog.com/docs/api/capture) batch limit does not remove that per-event constraint. Ordinary [event retention](https://posthog.com/docs/data/events-retention) does not provide this design's 30-day per-report content lifecycle. These constraints support keeping diagnostic archives and comments out of ordinary analytics events.

PostHog also offers [AI Observability](https://posthog.com/docs/ai-observability); this design does not claim PostHog cannot represent traces. Converting full execution histories to that separate product is not necessary for the agreed feedback index and private evidence workflow.

## Current implementation evidence

Static inspection, not runtime verification:

- Desktop already has a Select action and reply-reference navigation in `packages/client/src/client/bot-main.tsx`. `message-selection.tsx` groups screenshot, conversation copy and diagnostics under Export.
- Native mobile `apps/mobile/src/ui/chat/message-sheet.ts` has copy/share/open actions; selection and diagnostic export are not provided there.
- Existing diagnostics collect and redact evidence through `packages/core/src/diagnostics/bundle.ts`; the client preview in `packages/client/src/client/diagnostic-bundle.tsx` shows aggregate counts rather than selectable evidence categories.
- [ADR-0185](../adr/0185-diagnostic-bundles-are-local-redacted-read-only-exports.md) explicitly requires local-only diagnostic bundles. Deliberate online feedback changes that boundary in ADR-0249; ADR-0185 remains the historical rationale and describes the existing implementation.
- Anonymous Telemetry excludes conversation content. Message Feedback is a separate, deliberate submission, not an expansion of automatic telemetry.

## Final confirmation

The Human confirmed the consolidated scope on 2026-10-26, completing the design interview. Provider-specific storage configuration, concrete Host transport signatures and maintainer authentication wiring must be verified during implementation; the decision is private evidence ownership, not a claim that those capabilities already exist.
