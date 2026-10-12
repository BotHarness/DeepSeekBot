# Channel sidebar

The **Channel sidebar** is the right-hand column in **Bot mode**. It follows the selected chat: a PersonaBot DM shows that Bot’s own resources; a local group shows the group’s members. Configuration for the chat lives in **Channel settings**. Opening a native DSH Session takes you to a different, Session-scoped interface.

These pages use DSH **0.2.0-rc.1** and the public **deepseekbot** package. First complete [installation](/docs/installation) and [API and Bot model setup](/docs/model-setup).

## Open the sidebar

1. Enter **Bot mode** and open a Bot DM or a local group in the left roster.
2. If the right column is closed, click **Expand the Channel sidebar** at the right edge.
3. On a wide window, click a tab at the top of the sidebar: **Sessions** (Sessions and Bot Inbox), **Memory** (Memory files and Memory evolution), **Screen** (Computer and Browser, when those plugins are installed), and one tab for each other entry. Hover an icon for its name. In a narrow window the sidebar is an overlay of collapsible entries; click an entry’s title to expand or collapse it.
4. Switch chats to inspect the resources for that Bot or group. Check the chat header before using an action.

![The Bot DM with the Channel sidebar on the right](/guides/channel-sidebar/01-sidebar-overview-zh.webp)

## Choose a feature

| In a Bot DM                                                        | What you can do                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [Memory files](/docs/channel-sidebar/memory-files)                 | Browse the current repository tree and read a file in the center.                                     |
| [Memory evolution](/docs/channel-sidebar/memory-evolution)         | Inspect uncommitted changes, Git history, branches and recovery checkpoints.                          |
| [Sessions](/docs/channel-sidebar/sessions)                         | Open this Bot’s Orchestrator and Assignment Sessions in DSH.                                          |
| [Bot Inbox](/docs/channel-sidebar/bot-inbox)                       | Inspect source messages and Assignment reports that the Bot has received.                             |
| [Workspace Grants](/docs/channel-sidebar/workspaces) ¹             | Review and explicitly authorize the Host folders available to this Bot.                               |
| [Schedules](/docs/channel-sidebar/schedules)                       | Wake this Bot on a cadence, run a schedule now, and lock it from Bot edits.                           |
| [Model](/docs/channel-sidebar/model) ¹                             | Check and change the models this Bot uses for chat and new Assignments.                               |
| [Wake policy](/docs/channel-sidebar/wake-policy) ¹                 | Choose, per source, whether this Bot wakes right away, after a digest, or not.                        |
| [External identities](/docs/channel-sidebar/external-identities) ¹ | Bind who this Bot speaks as on Lark / Feishu, Slack or WeChat; IM pairing and approval notifications. |
| [External connectors](/docs/channel-sidebar/external-connectors) ¹ | Edit and pause conversations synced into a Channel; advanced saved send targets.                      |

| In a local group                                                   | What you can do                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [Members and group management](/docs/channel-sidebar/groups) ¹     | Inspect members, invite a Bot, handle join requests and edit the group. |
| [Wake policy](/docs/channel-sidebar/wake-policy) ¹                 | Choose, per member Bot, how ordinary messages in this group wake it.    |
| [External connectors](/docs/channel-sidebar/external-connectors) ¹ | Connect, edit and pause external conversations synced into this group.  |

¹ A **Channel settings** section, not a sidebar entry. Open it from the chat header’s **···** menu or the sidebar gear, **Channel sidebar settings → Channel settings…**. In a group, Members stays in the sidebar; Group management is in Channel settings.

[Display and layout](/docs/channel-sidebar/display) explains width, tabs, the Views menu, visibility and feature-specific display options. [Settings guide](/docs/settings) covers the rest of the non-IM settings.

## Why an entry may be missing

Bot-only entries do not appear in a group; group management does not appear in a Bot DM. The Bot Inbox entry is conditional on having records or a loading/error state. **Schedules** is hidden by default; turn it on in the **+ Views** menu. A tab may also be hidden there (or an entry through **Edit sidebar** in the narrow overlay). Model, Workspace Grants, Wake policy, External identities, External connectors and Group management are in Channel settings, not the sidebar.

Optional plugins can contribute further entries. The public npm package does not include the Browser or Computer packages: their absence is expected. When those packages are installed and available, follow [Share a browser tab](/docs/daily-browser) or [Computer export and migration](/docs/computer-export) for their separate prerequisites and procedures. Connecting an IM application is a separate setup flow; after that, External identities and External connectors manage this Bot’s use of it.
