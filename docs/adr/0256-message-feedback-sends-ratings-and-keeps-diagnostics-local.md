---
Status: Accepted
Date: 2026-10-26
---

# Message Feedback sends ratings and keeps diagnostics local

Supersedes the remote evidence storage and dedicated receiver decision in [ADR-0254](0254-message-feedback-separates-private-evidence-from-telemetry.md). The Human explicitly chose the simpler model: PostHog receives feedback; diagnostic Session evidence is downloaded to the Human's device and shared separately at their discretion.

## Decision

The existing authenticated Host feedback routes remain the application-defined owner. Explicit submission sends only a random feedback ID, good/bad rating, fixed tags, the Human's redacted short comment and application version to the existing PostHog ingest path. It sends no conversation, Session, Inbox, delivery records, archive, attachment bytes, content digest, Channel ID or Bot identity. The random feedback ID is also the event UUID for retry deduplication; it does not identify a user profile. Deliberate submission does not enable or depend on automatic Telemetry.

The Host continues to prepare bounded frozen diagnostic previews under existing permissions. Download delivers the selected archive to the requesting device only. Desktop saves a ZIP; mobile offers its system save/share sheet. The filename includes the feedback ID so a Human can send it separately for investigation. Submitting does not trigger download or sharing. A submission receipt is PostHog ingestion acknowledgement, not a guarantee of a separately stored evidence report. The form retains manual retry and download; previews expire locally after 30 minutes.

There is no dedicated feedback Worker, private R2 bucket, feedback domain, maintainer archive page or report-deletion service. Diagnostic storage and 30-day deletion promises from ADR-0254 no longer apply. Feedback comment retention follows the existing PostHog project policy; local archives remain under the Human's control. The existing stateless telemetry proxy needs no deployment for this change.

## Consequences

Maintainers cannot automatically inspect a user's Sessions from a feedback event. They need the user to share the downloaded bundle. This intentional trade-off removes storage operations and an additional content-upload boundary. Preview/download and explicit submission keep their existing CLI equivalents. QA uses synthetic material; production conversations are never uploaded by verification.
