# Model

Open **Bot DM → Channel settings → Model** (the chat header's **···** menu → **Channel settings…**). Two cards show the models this Bot uses.

![The Model entry in a Bot DM with the main model and task model cards](/guides/channel-sidebar/14-model-zh.webp)

## Read the cards

| Card       | What it shows                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Main model | The `model · effort` that chats with you and hands out tasks. A preset name tag appears when it came from one. |
| Task model | The model delegated tasks use by default. **+N allowed** appears when tasks may pick other models too.         |

## Change the models

Click either card to open the **Model** dialog:

![The Model dialog opened from the sidebar](/guides/channel-sidebar/15-model-dialog-zh.webp)

1. Type in **Main model** or **Task model** to filter the list, then pick a model. When the model supports reasoning effort, choose **Default** or a level below it.
2. To let tasks pick other models, expand **Advanced: let tasks pick a model**, add them and tick the efforts they may use. Optionally write when to use each model, for example “quick lookups and small edits”; the Orchestrator follows these notes when it starts a task.
3. Click **Save**. The change applies to later turns; a task keeps the model it was created with.

Presets are optional. When you have saved presets, **Fill from a preset** at the top fills the dialog; changing anything afterwards unlinks it. To reuse the current settings later, click **Save as preset**, name it and save; this Bot then uses the new preset.

[API and Bot model setup](/docs/model-setup) explains each field and the provider setup.

## Hide or move the entry

Use **Edit sidebar** to move **Model** or hide it, like any other entry. See [Display and layout](/docs/channel-sidebar/display).
