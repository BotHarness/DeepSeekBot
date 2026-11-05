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

## Limits and delivery

This choice does not promise delivery after force-stop, reboot, process termination or every OEM/Doze restriction. `START_NOT_STICKY` and stop-with-task avoid inventing an automatic restart policy. System notification permission can prevent the ongoing notice from appearing in the drawer while Android still runs the service.

The remaining kinds, foreground attention policy, multi-Host recovery qualification, aggregate Bot counts, catch-up summaries and OEM onboarding are subsequent slices in #3355. N1 requires a rebuilt native app, native competition tests, real Host/phone before-and-after evidence and Human feedback before expansion. This ADR is a design decision, not evidence those gates passed.

Android's [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types#remote-messaging) define remote messaging as continuity of messaging between devices. Store declaration and runtime behavior must be checked against the actual build. React Native's installed `HeadlessJsTaskContext` and `JavaTimerManager` are the version-specific execution mechanism; a foreground notification alone is insufficient.
