---
Status: Accepted
Date: 2026-10-16
Issues: [#1932](https://github.com/BotHarness/DeepSeekBot/issues/1932)
---

# Beta reminders are claimed once per Profile before display

Browser-local dismissal cannot prevent two browsers connected to one computer from repeatedly
advertising the same Beta version. A delivery acknowledgement can also be lost, leaving no way
to distinguish a missed reminder from a displayed one. The product prioritizes not nagging over
guaranteed delivery. This does not control store/OS notifications or the installed release-notes
announcement, and it does not qualify an update candidate for distribution.

## Decision

- The existing application-defined Release Service owns a durable reminder high-water mark in
  `botharness/release-prompt.json`, next to the choice file under DSH-native `profileContext.dir`.
  It contains only a version; it is not browser storage, telemetry or a SessionEvent.
- An authenticated `releasePrompt(version)` command checks explicit Beta selection, the current
  update candidate, channel revision, no pending install/restart and known idle DSH activity.
  It then atomically records a strictly newer version **before** granting display. Concurrent
  callers in the one Host owning that Profile cannot both claim it. Separate processes sharing
  one Profile are not supported. Missing history permits the first claim; unreadable or malformed
  history fails closed and is not reset automatically.
- The highest claimed version also suppresses older candidates after a tag rollback. Leaving and
  rejoining Beta does not erase history. Other Profiles remain independent. Host crash or a lost
  response after a committed claim may lose that reminder, but cannot cause automatic redelivery.
  Deleting/restoring Profile files can reset history and is outside this continuity guarantee.
- The Web checks on opening Settings, not from a global modal or timer. A Beta card appears only
  after a claim. Later, closing Settings or a stale request hides it; manual Check for updates
  still shows candidates and does not consume a reminder. Every automatic card asks the Host,
  not the browser's cached channel: `not-beta` permits a stable candidate without a claim.
  Current-Host stable behavior remains unchanged; old Hosts without the API suppress automatic
  cards but retain manual checks. Settings visit identity cancels late read/save continuations.
- `release-prompt <version> --confirm` is the same state-changing claim for agents; it is not a
  read-only query. `release-check` is the read-only alternative. Neither installs or restarts.

## Consequences

Unknown/old Hosts, storage failure, busy state or a lost response can suppress an automatic card.
The compact update status and manual check remain available. No retries run in the background.
This bounded Settings behavior is not a weekly release scheduler, cross-device notification
system, guaranteed prompt delivery, package qualification or full completion of #1932.
