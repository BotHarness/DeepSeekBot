---
Status: Accepted
Date: 2026-11-03
Issues: [#3353](https://github.com/BotHarness/DeepSeekBot/issues/3353), [#3356](https://github.com/BotHarness/DeepSeekBot/issues/3356)
---

# Android local alerts share one native arbitration boundary with cloud push

## Context

Connect, Tailscale and LAN make a Host reachable; they do not grant an Android process background execution. Cloud push registration and send receipts also do not establish that Android displayed an alert. The Human approved an opt-in local-first path, with optional FCM fallback, after the #3223 investigation. The phone remains a Paired Device (ADR-0243); it does not acquire a DSH Host, Plugin lifecycle or PersonaBot execution owner.

## Decision

- The existing Host client and complete versioned Human Inbox notification projection supply attention. Device alert decisions consume that projection; they never infer approval state from raw messages, roster counters or the notification drawer. Disconnected, stale and unsupported projections cannot resolve pending alerts.
- A separate connection lifetime owner shares the existing paired clients between foreground UI and an explicitly enabled Android runtime. A `remoteMessaging` foreground service starts from the visible app, shows an ongoing notice, and keeps the existing React Native runtime eligible for background JS execution through a Headless JS task. It does not duplicate credentials, encryption or transport logic. It does not acquire an indefinite CPU wake lock.
- Keep connected is persisted locally and initially off. The ongoing notice opens the app without selecting a Host or route. Stop clears the persisted choice, releases the background execution task and connections when no foreground UI needs them. It leaves the cloud push registration and foreground conversation behavior intact. Reopening restores only an enabled choice.
- The first slice covers Tool approvals. Both the local projection and FCM presentation pass through the same Android arbiter, keyed by Host ID and Human Inbox item ID. While the background runtime is running, FCM waits a bounded 1500 ms for the local projection; otherwise it presents immediately. The first eligible claim wins and a later carrier cannot ring again. This is a local preference with bounded fallback, not an ordering guarantee across arbitrary network delays.
- The arbiter persists only identity, presentation-attempt state and notification identifiers in device SQLite. It keeps records for the pairing lifetime, deleting them on unpair. Observed pending items that disappear from a complete projection become tombstones and their presentations are cancelled. An item delivered by cloud but not yet observed in the feed is not declared resolved merely because an older projection lacks it.
- An incoming FCM approval also asks the connected JS owner for a fresh complete projection. Absence in that read can tombstone even an item never observed locally. If that read cannot complete inside the fallback window, delivery retains the cloud path's uncertainty; an offline phone cannot prove that an action was resolved elsewhere. Host-level notification opt-out is preserved while its latest settings are unavailable.
- A durable claim precedes the OS `notify` call. Permission denial does not consume the claim; an explicit posting exception restores eligibility. Process death between claim and posting can lose that alert. Neither the claim nor a successful OS call means the notification was visible or read. Human Inbox remains authoritative and retains the request.
- Device notification preferences, OS notification permission and connection opt-in remain separate. The first slice's setting uses the existing Android Compose settings row and Switch, with battery cost next to the choice. Permission recovery does not require FCM token acquisition.

## N2 foreground and notification kinds

The N2 extension (#3357) sends existing approval, question, private-input and reply/mention kinds through the same native arbitration record. Native foreground claims return content to the mounted in-app banner; background claims post system notifications. A foreground claim does not require system-notification permission. FCM cannot post a system notification while the app is foreground; it asks for a fresh canonical feed instead. Both paths use the same durable item identity, including after a foreground/background transition. Claiming before the JS banner is rendered has the same crash-window limitation as claiming before OS notification posting; neither is proof of display.

The conversation lifecycle reports which paired conversation is actually visible. Its ordinary replies are silently consumed; requests remain prominent and actionable through the banner and existing request cards. The first complete feed baselines old replies silently. Full reconnect catch-up and summary policy remains N5. The bounded in-memory banner queue contains at most 20 entries, is cleared on backgrounding, and is reconciled on resolution or unpair; it is not an Inbox or a durable authority.

Device kind preferences apply to local and cloud paths. Conversation mute suppresses replies only, matching Host push delivery; it does not suppress approvals or questions. Private-input text never includes the item summary. Reply previews collapse whitespace and stop at 140 characters. Local Tool approvals expose only the existing unlock-required allow-once/reject category; permission-sensitive Always allow is not inferred from a summary. Banner taps use the existing trusted notification routing and Host permission checks.

The Human requested provisional Draft stacked implementation while N1 native acceptance is pending. This permits development sequencing only: N1 and every dependent slice still require their own native evidence and Human feedback before acceptance or merge. The N2 native bridge change requires a rebuilt client.

## Remaining delivery limits

This choice does not promise delivery after force-stop, reboot, process termination or every OEM/Doze restriction. `START_NOT_STICKY` and stop-with-task avoid inventing an automatic restart policy. System notification permission can prevent the ongoing notice from appearing in the drawer while Android still runs the service.

Multi-Host recovery qualification, aggregate Bot counts, catch-up summaries and OEM onboarding remain subsequent slices in #3355. N1 and N2 require rebuilt native apps, native competition tests, real Host/phone before-and-after evidence and Human feedback. Provisional Draft development does not waive those acceptance gates. This ADR is a design decision, not evidence those gates passed.

Android's [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#remote-messaging) define remote messaging as continuity of messaging between devices. Store declaration and runtime behavior must be checked against the actual build. React Native's installed `HeadlessJsTaskContext` and `JavaTimerManager` are the version-specific execution mechanism; a foreground notification alone is insufficient.
