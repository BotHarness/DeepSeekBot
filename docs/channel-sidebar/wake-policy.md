# Wake policy

Open **Bot DM → ··· → Channel settings… → Wake policy** (or the Channel sidebar gear, **Channel sidebar settings → Channel settings…**). The wake policy decides, for each kind of incoming message, whether this Bot wakes up right away, waits for a digest, or only records it.

![The Wake policy rows, one per source](/guides/channel-sidebar/16-wake-policy-zh.webp)

## Read the rows

Each row is one source. The second line is the current rule; **Customized** means you or the Bot changed it from the built-in default. Rows marked **Read only** cannot be edited here. The **ⓘ** button on every row shows the full rule, recent wake count, revision and who changed it last.

| Source                                                           | Options and effect                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Human DM, Bot DM, Group mention                                  | Always wake right away. Choose **Fold into the running turn** (default) or **Queue as its own turn** for messages that arrive during an active turn.                |
| Ordinary Group messages                                          | Wake for every message / after a digest / only on direct mentions / record silently. Initial digest: 5 messages / 30 seconds. Count 1–100; interval 1–3600 seconds. |
| Assignment reports                                               | Wake by report state or reply request (default), or wake for every report. Applies to reports that reach the Inbox afterward.                                       |
| Group invitations, join requests/decisions, Assignment lifecycle | Read only.                                                                                                                                                          |

## Change a rule

1. Click the source row.
2. Choose the rule. For a digest, set the message count and the interval in seconds.
3. Click **Save**. **Restore default** removes your change for that source.

![Editing the ordinary Group message rule with digest thresholds](/guides/channel-sidebar/17-wake-policy-dialog-zh.webp)

## In a local group

Open the group and choose **··· → Channel settings… → Wake policy**. Each member Bot has a card: the second line is its rule in this group, plus a line for each external platform whose rule differs. **Channel override** marks a rule set for this group; without it the Bot's own default applies. Click a card to choose the rule and thresholds, or **Restore** to use the Bot's default again; see [Members and group management](/docs/channel-sidebar/groups).

The wake policy does not change the model, API provider or workspace permissions.
