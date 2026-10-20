# Android conversation notifications

This local Expo module re-styles Bot push notifications as Android conversations:
`MessagingStyle` with the Bot as a `Person` and its avatar, and for a group Channel
the Channel name as the conversation title and the Channel avatar as the
conversation icon. On Android 11+ it also publishes a long-lived conversation
shortcut so the notification lands in the system Conversations section.

It does not replace expo-notifications. `ConversationNotificationsService`
subclasses expo-notifications' `NotificationsService` and registers with a
higher intent-filter priority, which `NotificationsService.doWork` resolves
first; only the presentation delegate changes. Titles, actions (approval
buttons), channels, badges and tap routing stay with expo-notifications.

The Host sends `sender`, `group` and `text` in the push data
(`packages/core/src/push/delivery.ts`). Avatars are never downloaded here: the
app writes them as PNGs to `files/notification-avatars/<host>/bot-<slug>.png`
and `channel-<id>.png` while it runs (`src/host/notification-avatars.ts`). A
notification without those fields, or on Android 8, keeps the stock
expo-notifications look, and a missing avatar falls back to the system
monogram.

**Adding this module requires a native rebuild**; an OTA update alone cannot
install it.
