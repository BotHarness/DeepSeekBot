# Tobs channel groups

## Sub-features

- Create a channel group from the sidebar add menu or a channel move menu.
- Rename or delete through the group header ellipsis, right-click or Shift+F10 menu.
- A pending create/rename/delete blocks repeated submission. A refused or failed request keeps the dialog and name for retry.
- Delete removes only the arrangement: channels remain visible outside groups, and the active conversation remains selected.
- Creating a group and moving channels are separate outcomes. Failed movement keeps the created group and shows the sidebar failure message.

## How to get to it (user POV)

Enter Tobs mode. Use the sidebar add menu to create a channel group. Hover its header for the ellipsis, or right-click the header, then choose Rename or Delete. The delete confirmation explains that channels are retained.

## Driving it with verify-app

Launch a task-owned Host and pass doctor. Use `sectionCreate`, `channelAssign` and `rosterGet` through `verify-app rpc` to seed two groups and channels, then operate the real sidebar with `verify-app shot --bot-mode`.

1. Create and rename a group, including a trimmed name and a duplicate display name. IDs distinguish duplicate names. Whitespace-only input cannot submit.
2. Delete a populated group while another conversation is selected. Verify its channels remain, the selected conversation stays open and `rosterGet` no longer contains the deleted group. Repeat for an empty and the last group.
3. Repeat deletion against the stale ID: it is harmless. Renaming or moving to a removed ID is refused. Restart the same task Host and confirm the group stays deleted.
4. In a task-only browser fault harness, delay or fail only the section mutation RPC: repeated Enter must issue one request; failure keeps the dialog and draft; retry success closes it. Restore the transport and confirm canonical state. Never inject faults into a shared Host.
5. Create a group from a channel move menu, then fail only the movement. The new group stays, the creation dialog closes and a failure banner appears. Retry movement to the existing group, not creation.

The focused suites are `section-management.test.ts`, `bot-sidebar.test.ts`, `roster-store.test.ts`, `roster-bridge.test.ts` and `roster-database.test.ts`. Test evidence does not replace the browser path.

## Gotchas

These are Tobs channel groups, not native DSH Workspace or Session folders. Duplicate names are permitted; there is no product-defined maximum name length. Native `session-maybe` Slot adapter failures observed when opening empty Group conversations are unrelated shell failures: save observe/console evidence, and do not claim those views passed.
