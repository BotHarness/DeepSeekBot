# Message feedback receiver

The desktop feedback path uses the authenticated Host diagnostics owner. Automatic telemetry
preferences are independent. Preview and download work without a receiving service; submission
requires the Host environment variable `BOTHARNESS_FEEDBACK_ENDPOINT`. Production is fixed to
`https://feedback.botharness.ai/feedback`. Local QA accepts HTTP localhost/127.0.0.1 `/feedback`.
Redirects and arbitrary external endpoints are refused. Never use existing user conversations for QA.

## Private service setup

`packages/ingest/wrangler.feedback.jsonc` is a separate Worker from the telemetry ingest proxy.
Provision its private R2 bucket, configure the custom domain `feedback.botharness.ai`, and set
`FEEDBACK_ADMIN_TOKEN` using Wrangler's secret input (at least 32 random characters). Do not enable
public R2 access. `POSTHOG_KEY` optionally enables a small classification event, containing only
report ID/link, rating, fixed tags, version and archive byte count. Free text and evidence stay in R2.
Deploy only after separately authorized production setup; this change does not deploy the service.

Use `wrangler dev --local --config packages/ingest/wrangler.feedback.jsonc` with a machine-local
secret file for synthetic QA. Configure the Host endpoint with the printed loopback port. Keep local
secrets, Wrangler logs and private evidence outside tracked files. Public POSTs have the configured
10/minute per-IP rate limiter and a 16 MiB request bound; Host snapshots are limited to 15 MiB.

## Receipt and maintainer access

Each `POST /feedback/<UUID>` atomically saves one multipart report containing metadata and the ZIP.
Identical retries return the original receipt; changed content with that ID returns 409. Acceptance
means private storage succeeded. A PostHog outage does not invalidate the saved report. This first
slice attempts indexing once; failed index events are not automatically replayed.

Open `/feedback/<UUID>/view` and enter the maintainer token. This shell contains no report data;
the token stays in page memory and authenticated requests retrieve metadata and the archive.
`GET /feedback/<UUID>` and `GET /feedback/<UUID>/archive` require `Authorization: Bearer <token>`.
`DELETE /feedback/<UUID>` uses the same authorization for an early deletion request. UUID knowledge
alone grants no read or delete access. Rotate the shared maintainer secret when access changes.

Private bodies expire 30 days after initial acceptance. Reads reject expired content immediately;
the five-minute scheduled sweep overwrites expired bodies with zero-byte deletion markers. Early
deletion uses the same marker, preventing late retries from recreating content. Markers retain only
the random ID and deleted flag, not comments, evidence or classification. Do not add versioned
backups of private objects that bypass this retention policy. Monitor scheduled-job failures.

## Evidence boundaries

The snapshot defaults to 20 visible messages on each side of the selected message, relevant Bot
Session turns and Inbox/Outbox facts. Whole Session inclusion requires explicit selection. Existing
diagnostic limits and missing history are listed in the manifest; unavailable material is not invented.
Each category controls its own records: execution history may repeat chat text when conversation
records are deselected. Review all expanded files before submitting. Redaction is best effort.
Previews expire after 30 minutes and only four are held per connection. Refresh explicitly to collect
newer facts; ordinary retry preserves the same frozen evidence and report ID.

Desktop single-message feedback is the first delivery slice. Native mobile feedback and the agreed
multi-selection/menu changes follow Human feedback on this path.
