# Message feedback and local diagnostics

Give feedback from one saved message on desktop or mobile. A required good/bad rating, optional fixed tags and a short comment are sent to PostHog through the existing `https://t.botharness.ai/batch/` proxy. Only those fields, a random feedback ID and application version leave the Host. Comments receive best-effort secret redaction. Automatic telemetry settings are unchanged; deliberate feedback remains available when telemetry is disabled.

## Diagnostic bundles stay local

Chats, related Orchestrator/Assignment Sessions, Bot Inbox and delivery evidence are never attached to the feedback submission. Choose the local bundle scope, inspect its redacted files, then download it if needed. Desktop saves a ZIP; mobile opens the system save/share sheet. The user chooses whether and where to send it. No upload or share happens automatically. Download remains available after successful feedback submission.

Defaults include 20 visible messages on each side and related execution records. Whole-session history requires explicit selection. Missing material and diagnostic limits are shown. Redaction is best effort. Previews expire after 30 minutes; only four remain per connection. The archive filename includes the feedback ID to correlate a separately shared bundle.

## Submission and retries

Host submission posts a small `chat:message_feedback_submit` event using the existing project capture token. A random report ID is reused as the event UUID and distinct ID, with person processing and GeoIP disabled. A successful ingestion acknowledgement returns `{ reportId }`; it does not promise durable private evidence storage. Failed submissions retain the form for manual retry; changing the frozen rating requires an explicit refresh. No background upload queue is created.

No private bucket, dedicated feedback domain, admin token or new Worker deployment is required. `BOTHARNESS_FEEDBACK_ENDPOINT` is no longer used. The retired archive receiver, maintainer view and 30-day deletion service are removed. Local files are controlled by their owner; feedback fields follow the existing PostHog project retention policy.

## Verification

Host/CLI regression tests inspect the outbound request and confirm that no diagnostic content is included while the same preview still downloads locally. UI checks cover explicit submit, retry, privacy copy and downloading after submission. Use only synthetic comments for an authorized live PostHog check. Expo Web validates browser interactions; native system save/share needs separate iOS/Android qualification.

See [ADR-0256](adr/0256-message-feedback-sends-ratings-and-keeps-diagnostics-local.md).
