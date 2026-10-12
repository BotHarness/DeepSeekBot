# Connect a Bot to Slack

Connect a PersonaBot to Slack: configure an application, connect it locally and bind it to the Bot. After binding, @mentions of the app in channels it belongs to reach this Bot's Inbox, and the Bot replies in the same Slack thread. You don't authorize each channel.

## Understand the three settings

| Setting                   | Location                                                      | Purpose                                                                                        |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| IM application connection | Settings → IM bots → Slack (overview: Settings → IM apps)     | Connect this Host to a Slack application bot                                                   |
| External identity         | Bot DM → Channel sidebar → External identities → **Bind app** | Bind the app to this Bot, then manage its conversations: mute, rules, block, sync to a Channel |
| External connector        | Bot DM → Channel sidebar → External connectors                | Advanced: edit Channel syncs and saved send targets                                            |

Where the Bot can speak is decided by Slack: the channels the app was invited to and the scopes you installed. Binding an app does not mirror messages into a local DM, and an app belongs to one Bot.

## 1. Prepare your environment

### Reviewed ordinary DM pairing (#1415)

The #1415 source candidate reuses **Bot DM → Channel sidebar → IM roles and pairing** for Slack DMs. Enable **Require pairing for Lark conversations and Slack DMs**, create an ordinary Role, and let the unknown person send a DM to the bound app. Their first message produces only a fixed review notice and a metadata-only request. In **Requests**, assign the existing Role and approve. The fixed approval notice asks them to send a new question; only that new DM reaches the model. **People** shows the current Role and supports revocation; a new message after revocation cannot start model work until newly reviewed.

The switch is Bot-wide and remains off by default. If it was already enabled for Lark, this candidate also restricts Slack DMs. Pairing belongs to one current Bot/App/Binding and verified workspace actor, survives restart and does not transfer on rebinding. Role/group behavior is prompt policy, not a hard mail, filesystem or Shell permission. Slack group pairing and native management controls are separate; `/pair` does not create a Slack management grant in this preview.

The isolated source candidate completed real Slack pending → Web Role approval → ask-again → fresh same-App answer → revocation → restart checks, with matching Source Event, Admission and Outbox facts; the Human accepted this interaction. Existing Provider messaging/reaction screenshots below qualify their own earlier scope. Use an independent App and an explicitly coordinated exclusive receiver window. Before reverting to older code, disable the Slack Binding if it relies on the new restriction. See [ADR-0174](adr/0174-slack-dm-chat-pairing-reuses-current-binding-authority.md).

![Actual unknown Slack DM receiving the fixed waiting-for-review notice](/guides/slack/16-dm-pending-notice.png)

_The initial DM creates a review request; its instruction does not run._

![Actual Web Requests tab with the pending Slack applicant and an ordinary Role selected](/guides/slack/15-dm-role-review.png)

_In the Bot DM sidebar, open **IM roles and pairing → Requests**, refresh if needed, inspect the applicant and receiving App, then choose an existing Role. **Approve this role** sends a fixed ask-again notice; it does not run the initial instruction._

![Actual approved Slack person with an ordinary Role and no management capabilities](/guides/slack/18-dm-approved-person.png)

_The current paired person appears in **People**. Ordinary chat eligibility does not grant management powers. The test Role has none._

![Actual new Slack question answered after the fixed approval notice](/guides/slack/17-dm-fresh-answer.png)

_Only the new question ran: the original DM received 9797, the current Role and empty management capabilities. The reply matched this isolated Host's Source Event, handled Admission and accepted Outbox. The three read-only directories were also checked: current paired people, known external conversations and paired people observed in this conversation; the last is not a complete or current member list._

![Actual revoked and post-restart Slack questions receiving only pending notices](/guides/slack/19-dm-revoke-restart.png)

_Use **People → Revoke authority** to withdraw ordinary chat eligibility. The next question creates a new request instead of running; restarting the same Profile preserves that refusal. Approving the new request again still requires a fresh question and does not replay the blocked messages. This source-candidate evidence does not announce a published npm product or qualify Slack groups/native management controls._

For reusable independent test Apps, run `node scripts/dev-im-test-apps.mjs setup slack` in an interactive terminal. The three-stage wizard saves separate Slack QA1/QA2/QA3 slots in the same private machine-local registry used by Lark; it preserves existing Lark configuration and never starts a receiver. `list slack` shows only metadata. See the [shared QA setup guide](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/agents/im-test-apps.md#reusable-slack-qa-apps).

You need a Slack workspace that allows application installation, permission to create an app (or an administrator's help), and a public test channel. Create a PersonaBot in BotHarness and confirm that it can answer a local DM before testing Slack.

Use a BotHarness product with its qualified IM Provider included. Do not separately install an arbitrary dsh-im version or start a second receiver for the same app.

**This guide documents the qualified source preview, not a published npm release.** The verified product is `0.0.0-test.868`, with Provider `4.32.0-botharness.3` and DSH `0.2.0-rc.1`. If you need to build it, follow the [product installation notes](https://github.com/BotHarness/BotHarness/blob/43ca0c58f88dafa212fc56b64c8665f33c1472a1/docs/product-im-installation.md) at that revision. Keep the launcher's login URL private and reuse the same Profile to retain settings.

Screenshots show actual controls and the dedicated “BotHarness Slack QA” app in DoodleBear. Setup and configured states are labelled separately. Configured runtime captures come from the accepted #868 product; shared-Channel captures come from #845. No tokens appear in the images. Open an image to see its original size.

## 2. Create the Slack application

1. In BotHarness, open **Settings → IM bots → Slack → Start setup** (开始接入).
2. Select **Copy Manifest** (复制 Manifest), then **Open Slack creation page**. At [Your Apps](https://api.slack.com/apps), select **Create New App → From a manifest**. Choose your workspace, paste the copied configuration, review the app name, permissions and events, and create it. Your organization may require administrator approval.
3. Keep the local setup form open; the two token fields will be filled after the app is installed.

![Actual local Slack setup with Copy Manifest, creation link and empty Bot/App token fields](/guides/slack/01-onboarding.webp)

_The empty form shows where to start and where credentials belong; it does not prove a connection._

![Slack Create new app dialog with From a manifest](/guides/slack/02-create.webp)

_Select From a manifest. This capture stops before creation; reuse your own workspace and application name._

The manifest is a starting configuration, not a credential. Compare your app with the settings below before connecting. Slack's [manifest documentation](https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/) explains how the configuration is applied.

### Socket Mode and App Token

Open the app's **Socket Mode** page and enable it. BotHarness receives events through this outbound WebSocket connection; you do not need a public Request URL or an incoming Webhook.

Under **Basic Information → App-Level Tokens**, generate an App Token with **`connections:write`**. Keep the `xapp-…` value private; it belongs in the local **App Token** field, not Bot Token. See Slack's [Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/).

![Actual Slack application with Enable Socket Mode checked](/guides/slack/03-socket.webp)

_The existing QA app has Socket Mode enabled. This page does not display its App Token._

### Bot permissions and events

For **ordinary DM pairing**, check these **Bot Token Scopes** before connecting:

| Bot scope    | Used for                                                                                |
| ------------ | --------------------------------------------------------------------------------------- |
| `im:history` | Receive the subscribed `message.im` events from the app's DMs                           |
| `im:read`    | Check the original DM with `conversations.info`; receiving events alone is insufficient |
| `chat:write` | Send the review notice, ask-again notification and replies                              |
| `users:read` | Resolve the verified sender's display name                                              |

Enable **Socket Mode** with an App-level Token containing `connections:write`. In **Event Subscriptions → Subscribe to bot events**, add **`message.im`**. In **App Home**, enable the **Messages Tab** and allow users to send messages from it. These are separate settings: a Bot scope does not create an event subscription or enable the message composer. Slack documents the [`message.im` event and its `im:history` requirement](https://docs.slack.dev/reference/events/message.im/) and [`im:read` for DM information](https://docs.slack.dev/reference/scopes/im.read/).

After adding a Bot scope, select **Reinstall to your workspace**, review the requested access and complete installation. Confirm that the installed Bot Token has the new scope before retrying. In the #1415 QA setup, `im:history` was already granted but `im:read` was missing; adding it and reinstalling enabled the original-DM check. Keep both tokens local. Slack App permissions allow the integration to receive and send; the Bot's **IM roles and pairing** settings separately decide who may chat with that PersonaBot.

The channel/file scopes below support additional features; they are not all prerequisites for the ordinary DM pairing path.

![Actual QA Bot Token scopes, including chat:write, im:history and im:read after reinstallation](/guides/slack/13-dm-bot-scopes.png)

![Actual DM scopes and users:read; User Token scopes remain empty](/guides/slack/14-dm-scope-detail.png)

_These cropped settings captures show the configured QA App, including its existing optional scopes. They do not qualify the pairing runtime. No OAuth token is shown._

Under **OAuth & Permissions → Bot Token Scopes**, check permissions by purpose:

| Bot scope                   | Used for                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `app_mentions:read`         | Receive channel messages mentioning the app                                                  |
| `chat:write`                | Send and reply as the application bot                                                        |
| `channels:read`             | Inspect public channels for authorization                                                    |
| `users:read`                | Resolve sender IDs to names                                                                  |
| `channels:history`          | Read authorized public-channel context; receive ordinary public-channel text when subscribed |
| `files:read`, `files:write` | Read a mentioned source file and return a processed attachment; enable when needed           |

The screenshots show the already approved QA app, including optional file permissions. Request only the access your use case needs. Adding scopes requires workspace installation or reinstallation before the granted token can use them.

![Bot scopes for mentions and public-channel information](/guides/slack/04-scopes.webp)

![Remaining Bot scopes, including file permissions and users read; no User Token scopes](/guides/slack/05-scopes-detail.webp)

_These are Bot permissions. Signing in as a Human, or granting User Token scopes, does not replace the application bot's authorization._

Under **Event Subscriptions**, enable events and add **`app_mention`** to **Subscribe to bot events**. Add **`message.channels`** if you want ordinary public-channel text or topic following. Save the subscription. Socket Mode removes the Request URL requirement.

![Actual event subscriptions with app_mention and message.channels](/guides/slack/06-events.webp)

_Permissions allow access; subscriptions determine which live events Slack sends. BotHarness still filters them through the authorized channel and intake policy. See the official [app_mention](https://docs.slack.dev/reference/events/app_mention/) and [message.channels](https://docs.slack.dev/reference/events/message.channels/) references._

## 3. Install and connect locally

1. In the Slack app console, use **Install App → Install to Workspace** (or **OAuth & Permissions → Install/Reinstall to your workspace**). Review the requested scopes and complete any administrator approval.
2. Obtain the **Bot User OAuth Token** (`xoxb-…`) under **OAuth & Permissions**. This is the **Bot Token**, used for the installed bot's API operations. It is different from the `xapp-…` App Token used for Socket Mode.
3. Return to the local setup form, enter each token in its matching field and select **Verify and connect** (验证并连接). Credentials stay in the local credentials service; do not paste them into chat, Memory or Git.
4. Confirm the app is online in **Settings → IM bots → Slack**. Invite the application bot to your public test channel through Slack's channel integrations or `/invite @YourAppName`.

![Qualified installed product showing the existing Slack app online](/guides/slack/07-connected.webp)

_The connected account is the actual #868 installed-product result, not a filled-form mock. See Slack's [installation documentation](https://docs.slack.dev/authentication/installing-with-oauth/)._

## 4. Bind the app to the PersonaBot

Open the PersonaBot's DM and, in the **Channel sidebar** on the right, expand **External identities**. Select **+ Bind app**, choose the connected Slack app and confirm. Once the row shows **Ready**, @mentions of the app in channels it belongs to go straight to this Bot's Inbox, and the Bot replies in the same thread. See [External identities](/docs/channel-sidebar/external-identities).

![Bind identity dialog selecting an authenticated IM account](/guides/slack/08-bind.webp)

_Screenshots in this section show the earlier Profile layout; binding now lives in the sidebar's External identities entry._

![Actual bound Slack identity with status, enabled switch, edit and unbind actions](/guides/slack/09-identity.webp)

Each channel appears in the app's conversation list after its first admitted message. **New conversations** decides whether it is admitted automatically (the default) or waits for you under **Waiting**. Use **Mute**, **Rules** and **Block** on a row to quiet, tune or refuse that channel; **Allow again** lifts a block without backfilling missed messages.

## 5. Verify a mention and same-thread reply

In a Slack channel the app belongs to, send an actual @mention selected from Slack's mention picker, for example:

> @YourAppName Please reply “SLACK-OK” in this Slack thread using bridge_reply. Do not send a local DM.

Open **Bot Inbox** in the PersonaBot's sidebar (or the Activity Center), locate the new source and open its details. Check the Slack channel, original sender, receiving identity and message content. “Handled” means the Bot processed the source; it does not replace checking the actual external reply.

![Actual handled Slack source showing original sender, receiving identity and report association](/guides/slack/10-source.webp)

_This #868 source belongs to a real Human follow-up on a previously sent Slack report. Its local route is Inbox-only, so no local DM message is created._

![Actual Slack native topic containing the model's product and restart verification replies](/guides/slack/11-native.webp)

_The model replied BH868-PRODUCT-OK and BH868-RESTART-OK in the original Slack thread. Use your own test phrase to verify your installation; these captures are evidence from the named QA app._

Also send one plain, unmentioned message. With mentions-only intake and no explicit topic-follow policy, it should not enter this Bot's Inbox. Replying once does not automatically make the Bot follow every message in the thread.

## 6. Optional: sync a channel into a local Channel

By default Slack messages reach only the Bot Inbox and do not occupy local DM history. Adding a new sync is being redesigned: **External connectors** will take a conversation from any connected app and stream it into a Channel. Existing syncs keep working. Each member Bot of a shared Channel keeps its own Attention/wake policy.

![Actual shared Channel external connector dialog using an already authorized Slack group](/guides/slack/12-connector.webp)

_This #845 capture shows the earlier connector dialog. Edit, pause or remove existing syncs under **External connectors**._

Pausing a sync stops new intake while keeping its configuration and history. Removing it does not delete earlier messages. Disabling an external identity and pausing a sync are separate actions.

### Ordinary messages, harvest and topic following

Start with @mentions. To collect ordinary text, first enable `channels:history` and `message.channels`, install the changed permissions, then send a plain test message in the channel and refresh. BotHarness requires observed ordinary-message delivery before offering all-message intake or topic following.

Open **Rules** on the channel's row and choose custom **all messages** intake only for the intended channel. Select count/time harvest (for example, 5 messages or 30 seconds), or safely queued immediate wake. For shared Channels, each member Bot chooses when to process those messages through its own Attention settings. Intake, waking and whether to reply are separate decisions.

A Bot may explicitly follow or leave one native Slack topic. Human can inspect or override this in **Topic following**. Unmentioned replies in a followed topic can enter; unrelated topics keep their own rules. A Bot can also request bounded channel, nearby or thread context with continuation, without importing the history as new Inbox messages.

**Bot settings → Slack defaults** controls the default intake, harvest and identity-enabled behavior. A channel's **Rules** can inherit these values or explicitly override them. Global changes apply to subsequent events for inheriting configurations; they do not create accounts, admit channels or replay old history.

Slack can address channels directly, so a saved send target is never required. The **External connectors → Save a send target (advanced)** fallback stays for apps that can't.

## 7. Optional: received and answered feedback

The [#1161](https://github.com/BotHarness/DeepSeekBot/issues/1161) candidate uses an optional checked Provider capability; installing the existing Provider pin alone does not enable it. The isolated candidate has passed live channel and DM checks with native screenshots, a same-source DM transition recording and matching canonical facts. Human QA and published Provider qualification remain pending. Do not infer other platforms or every failure path from these successful examples.

With a compatible Provider and an approved, installed **Bot** `reactions:write` scope:

- **👀** follows a committed Inbox Admission, not Socket Mode delivery alone.
- **✅** follows the accepted reply to that exact source message. The app then removes its own 👀 from that source, never another person's reaction or the thread root. If cleanup is uncertain, both reactions can remain; the attempt is not retried automatically.
- Muted and context-only sources get no feedback. Silence, delegation, waits, unrelated output and failed or uncertain replies do not get ✅. These are app reactions, not Human read receipts.
- Reaction failure or missing support does not block intake, model execution or replies. Reconnect, restart and later scope changes do not replay old feedback attempts.

Approve scope changes and reinstall the app before testing; signing into Slack as a Human does not grant the bot this permission. For DM QA, also verify the app's installed IM scopes, `message.im` subscription and a fresh bound-app DM. Keep one receiver per test app and use a dedicated test channel. Verify both the visible reaction on the original Human message and its corresponding Inbox/Outbox facts.

## Troubleshooting

| Symptom                           | Check and next step                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify/connect fails              | Check the `xoxb-…` / `xapp-…` fields, App Token `connections:write`, workspace installation and Socket Mode. Use the same app's token pair.               |
| Online, but no source appears     | Invite the app to the public channel; verify `app_mention`, an actual @mention, the app bound to this Bot, and the channel not waiting, muted or blocked. |
| All-message option is unavailable | Check `message.channels` plus installed `channels:history`; send a new unmentioned text message and refresh to verify real delivery.                      |
| Context/file reading is denied    | Inspect installed scopes and current membership. Reinstall after approved scope changes; file processing also needs an authorized Workspace.              |
| Source handled, but no reply      | Inspect source/Outbox state and native thread. The Bot may choose silence or have lost its own identity/Grant. An uncertain send is not blindly retried.  |
| Reconnect or restart needed       | Retain the same Profile; run only one receiver for this app. Resume and verify a new message. Reconnection does not backfill missed history.              |

This guide covers qualified **public-channel** mentions, ordinary text, bounded context, native topic following, explicit shared-Channel routing, mentioned-file processing and explicit reports, plus the bounded source-candidate ordinary DM pairing path above. Private channels, Slack group pairing/native management controls, unmentioned file-share intake, edits/deletions, workspace-wide search, automatic gap backfill and a scheduled morning-report service are outside this qualification. Slack read indicators are not BotHarness receipt evidence. For provider-specific boundaries and future adapters, see the [IM integration guide](/dev/guides/im-provider-integration/).
