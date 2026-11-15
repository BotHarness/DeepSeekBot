# Storage, chat media and old message cleanup

## Sub-features

- Settings → Data & privacy → **Storage** opens a dialog with the total space used and a bar split into media and files, messages, Memory and other.
- The dialog lists every chat that holds media with its size. The Human picks an age (30, 90, 180, 365 days or any age), media types (images, video, audio, files) and chats, then **Preview**.
- The preview shows how many files from how many messages are deleted and how much space is freed. Media a Bot is still working on, media still being sent, media Memory uses and media still being moved are kept and named.
- **Clear** stays disabled until the confirmation checkbox is ticked. Text messages stay; each cleared file shows in the message as a dashed `<size> · Cleared` card.
- Media mirrored from an IM app is not touched. A restore from a backup made before the cleanup brings the media back.
- **Clear → Whole messages** switches the same dialog to old messages: no type choices, every chat with messages and its count. The preview names how many messages from how many chats, their files, Bot Memory that mentions them (unchanged), kept messages (`bot-working`, `delivery-pending`, `shared`) and whether more remain past 2,000. **Delete** runs Content Purge: each message stays as a deleted-message tombstone, then the database is compacted so the Messages part shrinks.
- Mobile: Settings → Connections → **Storage** shows the same usage, age, type and chat choices, and **Clear…** asks for a destructive confirmation built from the preview. **This phone → Clear image cache** empties the app's image cache.
- CLI parity: `deepseekbot storage-usage`, `storage-cleanup-preview --older-than-days <n> [--chat <id>] [--media <kind>]`, `storage-cleanup-confirm --confirmation-stdin --confirm`, `storage-messages-cleanup-preview --older-than-days <n> [--chat <id>]` and `storage-messages-cleanup-confirm --confirmation-stdin --confirm`.

- Environment panel → **More → Settings** for one named Host → **Token usage** or **Storage** reads only that named Host. Usage retains unknown/partial totals, ranges, cursors and loading coverage. Storage summary has explicit loading/failure states.
- Changing settings target, disconnecting or revoking access discards the cleanup preview. Replacing a source cannot publish a late preview or cleanup result into another Host.
- An uncertain cleanup confirmation discards its token and reads the same Host before enabling a fresh preview. If that read fails, **Reload** must succeed first; no confirmation is replayed.

## How to get to it (user POV)

Enter Bot mode, open Bot settings, choose **Data & privacy**, then **Manage…** on the **Storage** row.

## Driving it with verify-app

1. Launch a disposable Host with `verify-app launch --name <name>`.
2. Seed disposable media through the existing Owner: create a Human-only Group with `group-create`, upload a file to `/api/botharness/attachment/upload?name=<file-name>` with `content-type: application/octet-stream`, then send it with `channelSend`. Use **Any age** or `--older-than-days 0`; no database date edits are needed. A Bot DM instead requires the Bot to handle the message before its media can qualify.
3. `deepseekbot storage-usage` lists the chat with its `mediaBytes`.
4. `deepseekbot storage-cleanup-preview --older-than-days 0 --media image` returns a token, `files` and `freedBytes`.
5. Pipe that JSON to `deepseekbot storage-cleanup-confirm --confirmation-stdin --confirm`.
6. Canonical proof: the message keeps its text, its `clearedAttachments` names the file, the attachment download returns 404, and the file folder under `$DSH_HOME/botharness/attachments` is gone.
7. Old messages: `deepseekbot storage-messages-cleanup-preview --before <time>` then pipe it to `storage-messages-cleanup-confirm --confirmation-stdin --confirm`. Canonical proof: `channelMessages` returns those messages with an empty body and a `contentPurge` record, the web chat shows them as purged, newer messages are unchanged, and `storage-usage` reports a smaller `messages` part.

## Remote two-Host proof

Use two new task-owned schema149 Profiles after published TEAM_MODELS148 and MEMBER_USAGE149, with distinguishable Channels and storage. Historical E10 pre-canonical145 and internal offline146 Profiles stay closed; copy no database or credential into these fixtures. Usage reads keep the selected Host’s existing overviewUsage Human scope and nullable/partial coverage, without local reaggregation or permission expansion. Capture the same selected remote Storage state at the parent and change SHA. From the local Web Client, open Environment → More → Settings for the other Host, inspect Token usage/Storage, select only its disposable Channel, Preview, acknowledge and Clear. Read the owning Host with explicit CLI `--host` / private `--token-file` and inspect `channelMessages`; prove the selected attachment was cleared and the local Channel/attachment is unchanged. Repeat the old-message pair only on disposable messages. Verify a preview cannot survive target switch, disconnect or revocation. Inject a lost confirmation response, retain the failure, and verify same-owner usage readback plus a fresh preview instead of repeating the token. Read usage coverage and errors without substituting local values. Installed Desktop, native mobile and Human acceptance are separate results.

## Gotchas

- A token is valid for ten minutes and only for the previewed scope; any new matching message refuses with `storage-preview-stale`.
- The preview freezes its `before` time. A later upload beyond that cutoff, or a plain-text append that does not change the selected media, need not invalidate a media preview. To prove a stale refusal, change an attachment actually included in that preview through its owning cleanup command.
- The cleanup dialog refuses Close while its request is busy. For a real late-result/source-loss check, interrupt the task-owned peer connection, observe the unavailable state remove the dialog, change settings target, then release the original held response; do not report an ignored busy Close as a successful target switch.
- Media in a message the Bot has not handled yet is kept as `bot-working`, so a fresh send shows nothing to clear until the Bot replies.
- Message cleanup refuses anything placed in a chat the Human cannot read and keeps a message whose Bot admission is still pending, running or retryable; DM messages need the Bot's reply before they qualify.
- The mobile app hides purged messages instead of drawing a tombstone.
- On the mobile web build, `Alert.alert` is a no-op, so the confirmation cannot be pressed there; confirm through the CLI or the Host and reopen Storage. Native builds show the real dialog.
