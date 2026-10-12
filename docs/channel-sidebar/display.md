# Display and layout

In a Bot DM or local group, open the **Channel sidebar** and click its gear, **Channel sidebar settings**. The first item, **Channel settings…**, opens the chat’s [Channel settings](/docs/channel-sidebar#choose-a-feature) dialog; the rest affect presentation, not the Bot’s model, Memory contents or execution permissions.

## Width and tabs

- Drag the sidebar’s left separator to resize it. The default width is **320 px**, with a **260–560 px** range.
- Focus the separator and use Left/Right arrow keys for keyboard resizing; Home/End choose the minimum/maximum width.
- On a wide window the sidebar shows icon tabs at the top. The selected tab shows its label; the others show an icon with a tooltip. Left/Right arrow keys, Home and End move between tabs. Use the edge toggle to close/open the whole column.
- A Bot DM has **Sessions** (Sessions and Bot Inbox) and **Memory** (Memory files and Memory evolution); every other entry, including optional plugin entries, is its own tab. Bot Inbox appears only when it has records.
- A tab with two visible entries splits into a top and bottom pane that scroll separately. Drag the divider, or focus it and use Up/Down (Shift for bigger steps) and Home/End; double-click it to reset to half. The split is remembered per tab.
- In a narrow window (960 px or less), the sidebar opens as an overlay of collapsible entries: click an entry title to expand/collapse it. Close the overlay with its toggle, the backdrop or Escape. Changing the selected chat closes the temporary overlay.

## Order and visibility

On a wide window, click **+ Views** beside the tabs:

1. Clear or tick a tab’s checkbox to hide or show it. At least one tab stays visible.
2. Drag a tab’s handle to move it, or focus the row and press Alt + Up/Down.
3. Changes apply immediately. Press Escape or click outside to close the menu.

In the narrow overlay, choose **Edit sidebar** in the gear menu instead:

1. Drag an entry’s handle to move it. Alternatively, focus the handle and use Up/Down arrow keys.
2. Use **Hide …** or **Show …** to choose which entries appear.
3. Click **Done** to save the draft, or **Cancel** to discard it.
4. **Restore defaults** resets the draft’s default order and visibility; click **Done** to apply it.

![The narrow-overlay editing mode with ordering and visibility controls](/guides/channel-sidebar/08-sidebar-display-zh.webp)

Hidden tabs and entries keep their data. Bot and Channel layouts have separate ordering/visibility preferences; switching between Bots does not create a new Bot-specific order. The selected tab and expanded/collapsed entries are remembered for the selected Bot or Channel. Preferences are stored in the current client browser; this guide does not promise that another browser or device shares them.

## Feature display settings

| Gear-menu option               | Choices and effect                                             |
| ------------------------------ | -------------------------------------------------------------- |
| Memory evolution · Terminology | **Memory** or **Git** labels/grouping; no repository change.   |
| Sessions · Session view        | **Current** or **All** for the selected Bot’s owned Sessions.  |
| Sessions · Layout              | **Flat** or **By workspace**; groups do not relocate Sessions. |

These menu selections apply immediately. In the narrow overlay they are separate from the **Edit sidebar** draft’s **Done/Cancel** buttons, and opening a feature settings submenu can temporarily preview that entry; closing the menu restores its ordinary disclosure state.

For details, read [Memory evolution](/docs/channel-sidebar/memory-evolution) and [Sessions](/docs/channel-sidebar/sessions). Optional plugins may add their own display settings when available. [All sidebar features](/docs/channel-sidebar).
