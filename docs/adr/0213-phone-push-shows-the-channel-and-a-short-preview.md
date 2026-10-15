---
Status: Accepted
Date: 2026-10-15
Issues: [#1655](https://github.com/BotHarness/DeepSeekBot/issues/1655)
Supersedes: ADR-0202's content-free payload
---

# Phone push shows the Channel and a short preview

The first real-phone push test showed that a notification naming only the PersonaBot and the kind of request ("Ada needs your approval") does not let the Human decide from the lock screen whether to act now. The Human asked for a two-line notification: the Channel on top, the content below. We decided that **a push carries a title and a body: the title is the Channel name (`#name`), or the PersonaBot's display name for its DM, and the body says what the PersonaBot needs followed by a short preview of the request or message. Private input requests stay content-free.** Everything else in [ADR-0202](0202-phone-push-is-a-content-free-projection-of-the-human-inbox.md) stands.

## Decision

- **Title.** `#<Channel name>` for an item in a group Channel; the PersonaBot's display name for its DM.
- **Body.** What is needed, then the preview, in the phone's language:
  - Tool approval: the tool name and the main argument (`command`, `cmd`, `script`, `code`, `url`, `path` or `file_path`, else the first argument), for example `Needs your approval: bash · date > now`.
  - Formal Human question: the question text.
  - Mention or reply: the message text.
  - Private input request: only what is needed, never the account or the request text.
  - In a group Channel the body starts with the PersonaBot's name (`Ada needs your approval: …`, `Ada: …`); in the DM it does not repeat it.
- **Bounded.** Whitespace collapses to single spaces and the preview stops at 140 characters with `…`. The phone shows the full content after reading the item from the Host.
- **Approve or reject from the notification.** A Tool approval push carries the `tool-approval` category. The app registers two buttons for it, Allow once and Reject, both requiring the phone to be unlocked. A button opens the app, which sends the decision to the Host named in the push data (each saved route in turn) and then shows the card in its conversation, already decided. If the decision cannot be sent, the card stays pending there. Always allow is not offered from a notification.
- **Data and logs are unchanged.** The data payload still holds only ids, and the `push` developer log still never records the token or any content.

## Consequences

- Notification text now passes through Expo Push Service and APNs or FCM. The Notifications settings screen says so, and each kind can still be turned off per phone.
- An approval preview needs the request message, so the push source reads it from the Channel store by Channel and message id.
- The buttons open the app because iOS does not run the app's JavaScript for a background action when the app was closed. Deciding without opening the app would need native code.
