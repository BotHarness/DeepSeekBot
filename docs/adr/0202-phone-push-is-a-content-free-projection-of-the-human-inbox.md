---
Status: Superseded in part by ADR-0213
Date: 2026-10-14
Issues: [#1655](https://github.com/BotHarness/DeepSeekBot/issues/1655), [#1646](https://github.com/BotHarness/DeepSeekBot/issues/1646), [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)
---

# Phone push is a content-free projection of the Human Inbox

A paired phone should hear about a Tool approval, a formal Human question, a private input request or a mention or reply while the app is closed. We decided that **an application-defined Push delivery module on the Host projects the Human Inbox onto per-device sends through Expo Push Service. The Human Inbox stays the only authority, and a push carries ids and the PersonaBot's name, never message text, tool arguments or question text.**

## Decision

- **Projection, not a second store.** The module reads the Human Inbox (`action` items, and unread `replies`) whenever its tables or a PersonaBot's approval, question or private input count change, and on a one-minute sweep. It keeps only which item ids each device was already told about, so an item notifies once per device, a Host restart sends nothing twice, and items that existed before the device registered never notify.
- **Content-free payload.** Title: the PersonaBot's display name and the kind of request, in the phone's language (English or Chinese). Data: Host id, Human Inbox item id, item kind, PersonaBot slug, and the Channel and message ids the item screen needs to read the request from the Host. The phone reads everything else over the paired route.
- **Badge.** Every push carries the Host's count of unresolved Human actions. When an item is resolved elsewhere and nothing new is sent, the module sends a badge-only push, so a stale notification is never sent and the badge drops.
- **Per-device registration.** The device gateway ([ADR-0199](0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)) serves `/botharness-device/push` endpoints that act for the admitted device only: register its Expo push token (with platform and language), read and change per-kind switches (Tool approvals, Questions, Private input requests, Mentions & replies), send a test notification, and unregister. A token moves with its phone: registering it for a new pairing removes it from the old one.
- **Removal.** Revoking a device deletes its token at once. A token Expo reports `DeviceNotRegistered`, in a ticket or a receipt checked about 15 minutes later, is deleted too.
- **Bounded delivery.** A send is retried at most three times with backoff on network errors, 429 and 5xx. Outcomes are bounded developer log entries (`push` plugin: phase, device id, kind, outcome, Expo error code), never the token or any content.
- **Why Expo Push Service.** The Host sends over HTTPS with no BotHarness relay and no APNs or FCM keys on the Human's machine. The sender is one small adapter; replacing Expo means replacing it alone.

## App

- The app keeps every paired Host (DESIGN.md: Hosts are workspaces) and shows one at a time. Pairing adds a Host; a Host switcher lists them.
- After pairing, the app asks for notification permission and registers its Expo push token with every paired Host. A tapped notification first switches to the Host named in its data, then opens the item's screen (the approval, question or private input), or the DM for a DM reply. The item screen already handles an item decided elsewhere or expired.
- While the app is open, it mirrors the shown Host's unresolved count on the icon badge and removes banners for items already resolved there.

## Consequences

- Push delivery depends on the Expo project id of the app build (`extra.eas.projectId`) and on FCM credentials uploaded to EAS for Android. A build without them shows that it cannot receive notifications.
- Several Hosts each send their own badge count; the badge shows the latest one received until the app is opened.
- Mentions and replies notify when they are unread replies to or mentions of the Human. Channel Attention has no separate action-required classification yet; when it gets one, only the source query changes.
