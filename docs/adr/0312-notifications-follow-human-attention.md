# ADR-0312: Notifications follow where the Human is attending

- Status: Proposed (slice 1 in #3846; slices 2–4 need Human acceptance)
- Date: 2026-11-09
- Refs: #3846. Builds on the push delivery owner (`packages/core/src/push/delivery.ts`), Android local alerts (`ApprovalAlerts.kt`) and desktop notices (`desktop-notifications.ts`).

## Context

Three surfaces can alert the Human about the same Human-attention item (a Bot reply, mention, approval, question or private input):

1. The **Host push**. `PushDelivery.reconcile` sends an Expo push for every fresh item to every registered device. Its only device check is `deviceActive` ("not revoked"). The Host does not know whether the phone is open, which chat is on screen, or whether the Human is at the desktop Client.
2. **Android local alerts**. While Keep connected runs, `device-alerts.ts` and `ApprovalAlerts.kt` post the same items from the live connection. In the foreground they become in-app banners.
3. **Desktop notices**. These are Web Notifications from the Client, and they already stay quiet while the window is focused (`attentive()`).

The Human reported that the phone alerted for replies in the chat already on screen and from the Bot they were on a call with. They also reported that approving from an Android notification opened the app. The causes:

- The foreground `setNotificationHandler` showed every push as a system banner with sound.
- Only Android local alerts compared against the open chat, and none of the surfaces knew about calls.
- A DM opened before the roster loaded never registered as visible.
- Approval actions were foreground actions, and after a decision the app navigated into the chat.

Slack's published practice points the same way:

- **Active view and active device suppress delivery.** The 2017 decision flowchart drops a notification when the Human is viewing that channel. It also holds mobile push while the Human is active on desktop. Slack's default sends mobile pushes once the desktop has been idle for 10 minutes or locked for 1 minute, and the Human can choose "immediately, even if active".
- **Read state rescinds alerts.** A notification is withdrawn once its message is seen on another device.
- **Intent is separate from delivery.** The 2026 rebuild split _what_ notifies (all messages, mentions, or mute, decided once for desktop and mobile) from _how_ it is delivered (push, or only in-app badges and updates). This cut notification support tickets, and most people kept the defaults (mentions and DMs).

Mainstream messengers (Slack, WhatsApp, Telegram, WeChat) also show no system notification while their app is in the foreground. They use an in-app banner for other chats and nothing for the chat on screen.

## Decision

**One attention owner per device decides "already attended".** `apps/mobile/src/host/attention-focus.ts` holds the channels the Human is attending to on this phone. A chat page holds its channel while it is focused and the app is active. A live call holds its Bot's DM until the call ends, including in the background. Every phone surface asks `attentionFocus.covers(item)` before alerting for a reply or mention: the foreground push handler, local alerts and the in-app banner queue. Requests (approvals, questions, private input) still alert, because they need action and may not be visible from a call. _(Slice 1, #3846.)_

**Actionable notifications are answered where they are shown.** On Android, Allow once, Always allow and Reject are background actions. The push task sends the decision, dismisses the notification and does not open the app. If the decision cannot be sent, a plain notification says so and opens the request. A decision made from inside the app does not navigate either. _(Slice 1, #3846.)_

**While the app is in the foreground, nothing reaches the system tray.** A push or local alert that arrives while the app is active becomes an in-app banner (the existing `alertBanners` queue and `DeviceAlertBanner`), or nothing if it is covered by attention focus. The system banner, list entry and sound are reserved for when the app is not in front. This matches the desktop Client and mainstream messengers. _(Slice 2.)_

**The Host learns device presence and holds push for the device in use.** Each paired Client reports a short-lived presence lease to the Host: active or inactive, plus the attended channels while active. The lease is renewed by the existing connection and expires after about 30 seconds without renewal. The push owner then decides per device, in this order:

1. The kind is not enabled, or the channel is quiet: drop.
2. This device holds the item's channel in attention: drop, and mark it seen.
3. This device is active: drop; the live connection shows it in-app.
4. Another device of the same Human is active (for example the desktop Client is focused): wait. Push once that device has been inactive for the hold time, unless the item was read meanwhile. The default hold is Slack's: 1 minute after lock or hide, 10 minutes after the last input. A per-device setting can choose "immediately".
5. Otherwise push now.

Requests use the same rules except step 4, because an approval that blocks a Bot must not wait 10 minutes. _(Slice 3.)_

**Reading anywhere withdraws everywhere.** The Host already sends `resolved` pushes for requests that disappear. Replies follow the same rule: when a reply becomes read on any device, every device dismisses its notification for that item, and the badge is recomputed. _(Slice 4.)_

**Preferences separate intent from delivery.** The current per-kind switches and per-channel quiet list stay as _intent_: which items notify at all. Delivery is a separate per-device choice: push, or in-app only. That choice replaces ad-hoc combinations of Keep connected, in-app alerts and push switches. Any later change to the settings UI follows this split instead of adding new switches.

## Consequences

- Slice 1 is client-only. The foreground handler can only suppress pushes that arrive while the app is open. A push that arrives while the phone is locked or the app is in the background is still shown by the OS. This includes iOS during a backgrounded call, until slice 3.
- Slice 3 adds a Host route (presence) and a push-owner rule. Per CLI parity (AGENTS.md), it ships `deepseekbot push-presence` (report, list and expire a device lease) and a `push-decide --item <id> --device <id>` explain command. The explain command shows which rule kept or dropped a push, the way the flowchart does for Slack. Delivery decisions are recorded as bounded developer log events (`push.decided` with rule and device), not as a new store.
- The hold in rule 4 needs a timer in the push owner. Items keep their existing `push_sent` identity, so a held item is pushed once at most and is dropped if it is read or resolved first.
- iOS approval actions still open the app. Background actions on iOS rely on a background launch that must be verified on a device first. They follow once that is accepted.
- The desktop Client keeps its `attentive()` rule. Slice 3 makes it also report presence, so the phone stays quiet while the Human is working at the desk.

## Sources

- Slack Engineering, notification decision flowchart (2017), and Sophie Alpert, "Everyone is wrong about that Slack flowchart" (2024): [https://sophiebits.com/2024/10/30/everyone-is-wrong-about-that-slack-flowchart](https://sophiebits.com/2024/10/30/everyone-is-wrong-about-that-slack-flowchart)
- Slack Help, "Configure your Slack notifications" (mobile timing while active on desktop): [https://slack.com/help/articles/201355156](https://slack.com/help/articles/201355156)
- InfoQ, "Slack's new notification system" (2026 rebuild: intent vs delivery): [https://www.infoq.com/news/2026/04/slack-new-notification-system/](https://www.infoq.com/news/2026/04/slack-new-notification-system/)
