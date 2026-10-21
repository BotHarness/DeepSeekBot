# Android conversation notifications

This local Expo module re-styles Bot push notifications as Android conversations:
`MessagingStyle` with the Bot as a `Person` and its avatar, and for a group Channel
the Channel name as the conversation title and the Channel avatar as the
conversation icon. On Android 11+ it also publishes a long-lived conversation
shortcut so the notification lands in the system Conversations section.

It does not replace expo-notifications. `ConversationNotificationsService`
subclasses expo-notifications' `NotificationsService` and registers with a
higher intent-filter priority, which `NotificationsService.doWork` resolves
first; only the presentation and handling delegates change. Actions (approval
buttons), channels, badges and tap routing stay with expo-notifications.

A push with an FCM `notification` block is drawn by the Firebase SDK while the
app is in the background, so none of this code runs. The app therefore
registers with `render: "app"`, and the Host sends that Android device
data-only pushes: only `to`, `priority` and `data`, with the shown `title`,
`message`, `categoryId` and `badge` inside the data. Any `sound`, `badge`,
`channelId` or `categoryId` on the Expo message would make Expo add a
`notification` block again. Expo only presents a background data-only push that
has a title, so `ConversationHandlingDelegate` copies them from the data first
and pins the notification to the `requests` channel. Older builds, which don't
send `render`, keep getting pushes the system draws.

The Host sends `sender`, `group` and `text` in the push data
(`packages/core/src/push/delivery.ts`). Avatars are never downloaded here: the
app writes them as PNGs to `files/notification-avatars/<host>/bot-<slug>.png`
and `channel-<id>.png` while it runs (`src/host/notification-avatars.ts`). A
notification without those fields, or on Android 8, keeps the stock
expo-notifications look, and a missing avatar falls back to the system
monogram.

**Adding this module requires a native rebuild**; an OTA update alone cannot
install it.
