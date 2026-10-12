# Connect a Bot to QQ groups

Use a **QQ Bot application authorized through Tencent's official platform**. This path connects a PersonaBot to an application that has joined a QQ group. Start with one application, one Bot and a dedicated test group.

This is the development slice tracked by [#1152](https://github.com/BotHarness/BotHarness/issues/1152). It requires the qualified Provider selected by `scripts/dev-im-provider.mjs`; an arbitrary dsh-im installation does not provide its checked contract. Public release and the remaining [QQ capabilities](https://github.com/BotHarness/BotHarness/issues/1149) have separate delivery records.

## Connect and bind the application

1. Create an application in the [official QQ Bot platform](https://bot.q.qq.com/open). Follow its current application eligibility and group membership requirements. Add the application to your test group.
2. Confirm that your PersonaBot can answer a local DM using the chosen model.
3. Open **Settings → IM Bots → QQ → Scan to connect**. Complete Tencent's authorization flow for that application. Keep credentials in the Provider's credential service.
4. Open the Bot's DM, then **Channel sidebar → External identities → Bind app**. Select your QQ application and bind it. The ready state means its group mentions can reach this Bot's Inbox. You do not need to save a delivery target or authorize each group separately.
5. In QQ, @mention the application with a short text question. Inspect the **Bot Inbox**, open its source, and check the reply in the original QQ group.

An application belongs to one Bot. The Bot replies through the application that received the message. The platform controls who can reach that application through its availability and group membership settings.

## Manage a received group conversation

After the first mention, open the application's **Edit identity** conversation list. The trusted group locator belongs to the authenticated application; its name or numeric QQ group number cannot replace that locator.

- Choose **Sync**, select a Group Channel containing this Bot, and apply. Future eligible mentions appear there and enter the existing Bot Inbox; replies still go to the original QQ group through the receiving app.
- **Stop syncing** stops future Channel placement. With the default Inbox route enabled, reception becomes Inbox-only. Accepted Channel history stays readable and is never copied into another Channel or the Human–Bot DM.
- **Mute** keeps reception without waking the Bot. **Block** stops intake and cancels unsent authority. **Allow again** admits future messages without backfilling blocked events, including later redelivery.
- Pausing a route changes that route; pausing the app stops its reception and pending authority; archiving keeps the Bot inactive. Restart preserves durable choices. Rebinding the same authenticated app preserves blocks and mute preferences; revoked Channel authorizations require a new selection.

Expand **Reception intervals** to inspect pause, block, waiting and connection records. **Local control boundaries** come from local actions; **Local observation times** come from connection checks. After an unclean restart, an **unverified continuity** range spans the last observation to the next check. These ranges cannot establish missed-message counts. Each app retains the latest 128 closed intervals and current intervals, without another message transcript.

See [#1153](https://github.com/BotHarness/BotHarness/issues/1153) and [ADR-0152](adr/0152-qq-reception-intervals-record-local-observations.md).

## Use two Bots in the same QQ group

Authorize each official QQ application independently, add both to the dedicated QQ group, and bind each application to its owning PersonaBot. **Bind app** identifies existing owners and refuses assigning their app to another Bot.

1. Add both PersonaBots to the selected local Group Channel.
2. @mention each application in QQ. Open each owner's conversation list to verify its independently received conversation.
3. Use **Sync** on each conversation to select that same local Group Channel. App-scoped group locators can differ even for the same real QQ group; names, text and matching locators never establish an automatic mapping.
4. Send another distinguishable mention to each application. Inspect each owner's Inbox and own-app native reply. The Channel author label includes the receiving app name; **Source details** also shows its receiving app ID. These are attribution fields, not reply authority.

Shared Channel reading never lends the receiving app's identity or passive reply proof. A Bot without its own qualified conversation is refused; multiple qualified own apps produce an explicit ambiguity refusal. Blocking, unbinding or archiving one owner fences that owner's effects while preserving accepted Channel history and the other owner's identity. Similar content or message IDs across apps remain independent sources.

The qualified QQ Provider currently declares native reply receipts, without `own-text-echo`. An accepted receipt is not an observed Echo; it must not create another source or new attention. Cross-app native events remain independent, and text matching must never conceal them. See [#1156](https://github.com/BotHarness/BotHarness/issues/1156) for real qualification and the outstanding native Echo boundary.

## Use group images (development candidate)

The [#1157](https://github.com/BotHarness/BotHarness/issues/1157) candidate extends the same mention-only route with PNG, JPEG, GIF and WebP images. Send a new @mention with a caption and an image. A synced conversation displays the image in its original Channel message through the shared preview. Inbox-only reception still works without Channel placement. Opening a preview does not wake a Bot.

Actual visual understanding requires an image-capable model on the calling Session. The Bot can save an authorized working copy with `bridge_attachment_save`, read it through native `read_image`, import a selected result with `channel_attachment_import`, then reply with `bridge_reply_file`. Download or preview success alone does not establish understanding; unsupported models must report that they cannot inspect the image.

Images use the existing 25 MiB limit. Private QQ download URLs and upload tickets stay in the Provider; public sources retain safe metadata and attachment association. Caption-first display preserves attachment array order without claiming native text/image interleaving. Quoted and unsupported compound payloads remain excluded. Restart retains canonical source metadata and acquired previews, but cannot reconstruct an unacquired private download ticket or expired reply proof.

Choose the result type before replying: text and image share one durable reply intent per Bot/source. For an image result, send the image through `bridge_reply_file` first and put any separate explanation in the local DM. Repeating the identical request returns its stored result; changing a settled reply payload is refused.

Image results use the receiving app and original group. Upload is separate from the single final message send, with authorization checked again after upload. A native message receipt records provider acceptance; unknown results are not automatically resent. Real QQ/model/Client image qualification is tracked on #1157 and is not implied by this candidate contract.

## Process group files (development candidate)

The [#1158](https://github.com/BotHarness/DeepSeekBot/issues/1158) candidate negotiates ordinary files separately from images. A native group @mention can carry a direct file or a qualifying explicit file quote. If QQ sends files separately, reply to the file, select @Bot in that reply and add the processing request. The current native type-103 quote must contain one actual file block with consistent reference indices and matching group/message/author identity; adjacency alone does not establish source association. The quoted file belongs to this current mention Source and its reply authority, without reconstructing a historical message. Real QQ qualification on 2026-10-08 accepted this quoted-file path. A scalar `message_type:103` on the file block is metadata; recursive quote structure remains unsupported. Tencent's native `file` category becomes opaque `application/octet-stream` metadata; it is not a platform MIME claim.

A synced Channel shows the existing file card with **Download to this device**. Each request checks current Channel membership, source placement, receiving identity and conversation authority. The original file is acquired lazily into the canonical AttachmentStore, bounded to 25 MiB and served as a download. Inbox-only reception uses the same source without requiring Channel placement.

To process a file, the Bot saves an independent copy with `bridge_attachment_save` into a currently write-authorized Workspace Grant, edits that copy, imports the selected output with `channel_attachment_import`, then sends it using `bridge_reply_file`. The stored original remains unchanged. Choose file output before sending text because each Bot/source has one durable reply intent; put a separate explanation in the local DM.

Native file output uploads with `file_type=4` without sending, then rechecks current authority before one original-group message POST. Its native receipt records provider acceptance; an unknown outcome is not retried. Audio/video-native output is outside this file slice.

**Qualified test application:** on 2026-10-08, the maintained Provider `6d24d1f` on DSH `0.2.0-rc.1` and one authorized QQ application received a quoted CSV, acquired it from the native download host, saved and read an independent working copy, and returned a distinct `total.csv` through its own identity in the original group. The Human downloaded the result and confirmed `total_quantity` followed by `5`; the stored original remained unchanged. This qualifies that application and quoted-file path, not every QQ application, direct-file carrier or the modern upstream Host runtime. Verify permissions with each target application; SDK support alone does not establish them. Private tickets are process-local and cannot be reconstructed after restart.

## Understand the text path

| Behavior        | Current contract                                                |
| --------------- | --------------------------------------------------------------- |
| Input           | Text from a trusted `GROUP_AT_MESSAGE_CREATE` event             |
| Destination     | The same application-scoped QQ group                            |
| Reply           | Native text reply associated with the original message          |
| Receipt         | QQ's native response message ID; this means provider acceptance |
| Pause or unbind | Stops new intake and fences unsent replies                      |
| Duplicate event | Reuses its canonical Source Event and Inbox Admission           |
| Uncertain send  | Retains an unknown outcome; no automatic resend                 |

The [official group send contract](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) gives passive replies a five-minute window and a five-reply limit per source message. The Bot does not automatically switch an expired reply to a proactive send. A provider receipt does not prove that a person received or read the message.

The text slice excludes private QQ messages, ordinary group traffic, attachments and compound or quoted payloads. [Ordinary group events](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html) additionally require the application's receive-all setting; their explicit opt-in is tracked separately. Images, files, voice input and delayed proactive reports follow in the later slices.

QQ does not provide this consumer with a group-history API or a durable resume cursor. Disconnects can leave gaps. After a Host restart, previously retained sources remain inspectable, but their process-local reply proof is unavailable until a qualifying native event is delivered again. An old source must never become permission to send an unrelated new message.

## If the app does not appear or cannot reply

- Check the connection under **Settings → IM Bots → QQ**. An online receiver and a verified application identity are both required.
- Expand the application's **Diagnostic details**. Safe HTTP status, platform error code and qualification guidance help distinguish credential, permission and response failures. Do not share credentials or authorization QR codes.
- For an expired source, send a fresh @mention in QQ. An unknown send outcome needs inspection in the group before another message is requested.
- Check that the Bot, binding and conversation are enabled and allowed. Pausing, blocking or unbinding invalidates pending authority.

The [Provider integration guide](dev/guides/im-provider-integration.md) and [ADR-0151](adr/0151-qq-group-replies-use-authenticated-apps-and-process-local-source-proof.md) describe the implementation boundary.

## Receive and play group voice

QQ does not let this test client attach voice and @mention in one message: send one voice message, then explicitly quote that original voice and select @Bot. A separately typed instruction is optional when the spoken request is already clear. A native voice carrier that includes a mention is accepted by contract but has not been qualified on this client. Only a matching native quoted attachment belongs to the current request; nearby messages are not associated.

The synced **group Channel** and **Source details** distinguish a QQ platform transcript from unavailable transcription. The Channel keeps the original-audio download and **Prepare playback** next to the source message; playback does not create another Inbox admission or wake the Bot. Only the native voice attachment's `asr_refer_text` supplies a platform transcript; user instructions do not. The existing Orchestrator can read that transcript and return text through the receiving app in the original group. No speech-recognition service is automatically configured when QQ provides none.

Original audio is downloaded only on request under current source/app/Grant checks, with a 1 MiB bound. **Prepare playback** creates a separate WAV using the existing bounded SILK Worker; it never changes the original or transcribes it. The player does not autoplay. A valid SILK payload, including a proven SILK payload after an AMR wrapper, is supported; genuine AMR and other codecs remain unsupported and their originals can still be downloaded. The optional native platform WAV URL is not fetched in this candidate.

**Qualified test application:** on 2026-10-08, maintained Provider `60be59a` on DSH `0.2.0-rc.1` received an explicitly quoted native QQ voice attachment with platform ASR, admitted one Source/Inbox/Channel message, and the existing model answered the spoken question through the same application in the original group. The Human confirmed `24`. The 12,775-byte SILK original was unchanged by download and playback; actual Client keyboard preparation/playback reached the end of its separate 6.4-second WAV without autoplay. This qualifies this application and quoted native-ASR/SILK path, not every application, codec, direct carrier or modern upstream Host. Missing-ASR behavior remains explicit and fixture-tested. No outgoing voice or TTS is implemented.

When the QQ App already uses full reception, a `GROUP_MESSAGE_CREATE` is still a direct request only if its native top-level `mentions` contains `is_you === true`. Foreign or quoted-only mentions, ordinary messages and Bot authors remain excluded from checked Human intake. Candidate Provider `018533fd` restores this carrier on the current maintained RC1 composition; public-seam regressions pass, but fresh qualification of this combined product remains pending. This does not enable ordinary collection or qualify own Echo.
