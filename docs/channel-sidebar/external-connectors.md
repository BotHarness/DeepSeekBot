# External connectors

Open **Bot DM → ··· → Channel settings… → External connectors** (or the Channel sidebar gear, **Channel sidebar settings → Channel settings…**). It lists the external conversations synced into this Bot’s Channels and keeps one advanced action. You don’t need it to receive or reply: [binding an app](/docs/channel-sidebar/external-identities) is enough, and its conversations are managed there. Later, one-way input streams such as webhooks will also live here.

![External connectors with a synced conversation and the advanced send target row](/guides/channel-sidebar/20b-external-connectors-en.webp)

## Read the rows

| Row                               | What it shows and does                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One row per sync                  | Sync name, a state chip (**Receiving**, **Connecting**, **Paused** or **Unavailable**; plus **Bot Inbox only** when it does not add DM history) and “platform · external conversation · condition”. The Switch pauses or resumes intake. |
| **Save a send target (advanced)** | Only for apps that can’t list or address conversations: save one target the Bot can post to proactively. Receiving and replying don’t need it.                                                                                           |

When nothing is synced, the section says **No external sources connected**. Adding a sync here, from any connected app whether or not a Bot has it bound, is being redesigned.

**Syncs decide what is received; the Bot’s [Wake policy](/docs/channel-sidebar/wake-policy) decides when it is processed.**

## Edit, pause or remove a sync

Click a row to open **Edit connector**. Change the name, the condition (inherit, mentions of the receiving identity only, or all ordinary text messages) or the enable switch, then click **Save connector**. **Delete** asks for confirmation. Pausing keeps the configuration and history; deleting does not remove messages already received.

![Editing an external connector](/guides/channel-sidebar/21-external-connector-dialog-zh.webp)

## Advanced: save a send target

Lark, Slack and Discord apps post to conversations directly, so they never need this. For an app whose Provider can’t list or address conversations:

1. Save a **Destination** in the account’s delivery settings under **Settings → IM Bots**.
2. Click **Save a send target (advanced)**, choose the bound **IM account** and the saved **Destination**, and confirm.
3. In the same dialog you can send a message to the target and inspect **Recent sends**. **Revoke this target authorization** removes it.

![The send target dialog](/guides/channel-sidebar/22-conversation-authorization-zh.webp)

## Connect an external conversation to a group Channel

A group Channel can take in everything said in an external group, the way a webhook feeds it. Open the group, choose **··· → Channel settings… → External connectors** and click **Connect an external conversation**:

1. Choose an **App**. Every app a member Bot has bound is listed, with the platform and the Bot that uses it.
2. Choose a **Conversation**. The list shows the groups that app already knows, for example a group where someone has @mentioned it. If yours is missing, @ the app once in that group.
3. Keep **Wake** on **Context only**, or pick **Wake after a batch** or **Wake on every message**, then click **Connect**.

From then on every message from that group appears in the Channel. With **Context only**, member Bots read those messages only when someone @s them, locally or by @mentioning their own app in the group. A member's own wake policy set in this Channel takes precedence. Nothing is sent back to the external group.

The row shows **Waiting for the first message** until one arrives, then **Receiving** and the time of the last message. The app must receive ordinary group messages: Lark needs the `im:message.group_msg` scope. Use the Switch to pause, and **Delete** in the edit dialog to stop new messages; messages already in the Channel stay.

In a local group the same **External connectors** section lists the group's connectors; each row opens its edit dialog. Platform setup: [Lark / Feishu](/docs/lark-connection), [Slack](/docs/slack-connection), [personal WeChat](/docs/wechat-connection). [All sidebar features](/docs/channel-sidebar).
