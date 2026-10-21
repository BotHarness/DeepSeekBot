# Storage and chat media cleanup

## Sub-features

- Settings → Data & privacy → **Storage** opens a dialog with the total space used and a bar split into media and files, messages, Memory and other.
- The dialog lists every chat that holds media with its size. The Human picks an age (30, 90, 180, 365 days or any age), media types (images, video, audio, files) and chats, then **Preview**.
- The preview shows how many files from how many messages are deleted and how much space is freed. Media a Bot is still working on, media still being sent, media Memory uses and media still being moved are kept and named.
- **Clear** stays disabled until the confirmation checkbox is ticked. Text messages stay; each cleared file shows in the message as a dashed `<size> · Cleared` card.
- Media mirrored from an IM app is not touched. A restore from a backup made before the cleanup brings the media back.
- Mobile: Settings → Connections → **Storage** shows the same usage, age, type and chat choices, and **Clear…** asks for a destructive confirmation built from the preview. **This phone → Clear image cache** empties the app's image cache.
- CLI parity: `deepseekbot storage-usage`, `storage-cleanup-preview --older-than-days <n> [--chat <id>] [--media <kind>]` and `storage-cleanup-confirm --confirmation-stdin --confirm`.

## How to get to it (user POV)

Enter Bot mode, open Bot settings, choose **Data & privacy**, then **Manage…** on the **Storage** row.

## Driving it with verify-app

1. Launch a disposable Host with `verify-app launch --name <name>`.
2. Seed media: upload a file to `/api/botharness/attachments/upload` with `content-type: application/octet-stream`, send it in a DM with `channelSend`, and wait until the Bot has handled the message. For an old message, backdate `source_events.created_at` and the message `at` in the operational database while the Host is stopped.
3. `deepseekbot storage-usage` lists the chat with its `mediaBytes`.
4. `deepseekbot storage-cleanup-preview --older-than-days 0 --media image` returns a token, `files` and `freedBytes`.
5. Pipe that JSON to `deepseekbot storage-cleanup-confirm --confirmation-stdin --confirm`.
6. Canonical proof: the message keeps its text, its `clearedAttachments` names the file, the attachment download returns 404, and the file folder under `$DSH_HOME/botharness/attachments` is gone.

## Gotchas

- A token is valid for ten minutes and only for the previewed scope; any new matching message refuses with `storage-preview-stale`.
- Media in a message the Bot has not handled yet is kept as `bot-working`, so a fresh send shows nothing to clear until the Bot replies.
- On the mobile web build, `Alert.alert` is a no-op, so the confirmation cannot be pressed there; confirm through the CLI or the Host and reopen Storage. Native builds show the real dialog.
