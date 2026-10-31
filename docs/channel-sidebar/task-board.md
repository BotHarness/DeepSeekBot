# Task board

The **Task board** is a read-only progress panel inside the **Channel sidebar**. It answers one question about the chat you are reading: what are the Bots here working on right now, and how far have they got.

It is not a task manager. You cannot create, edit, assign or close anything from it, and it stores no tasks of its own.

## What this panel is, and what it is not

- It shows the **Assignments of the current chat** — the work this Bot DM or this group already asked for — together with the execution steps those Assignments produce.
- It shows **execution steps**, meaning the tool calls an Assignment made. It does not show the `todo_write` plan an Assignment keeps internally, and it does not replace [Sessions](/docs/channel-sidebar/sessions).
- It is **not a global Kanban**. Tasks do not follow you between chats: every chat has its own set. A global, persistent task board with cards that Humans and Bots both edit is a separate capability.

## Open the panel

- **Wide window:** click the task-board icon next to the chat header’s settings gear. The tooltip names the action — **Open the task board**, or **Close the task board** once it is open.
- **Narrow window:** expand the **Task board** entry in the sidebar overlay.
- The panel is **closed by default**, and each chat remembers its own state. Opening it in one chat does not open it in another: switch to a chat you never opened it in and the panel is closed there; switch back and it is open again.

## What you see

The panel groups the work per Bot and lists one card per Assignment.

- Groups are ordered by their most recent activity, cards inside a group by when they last changed.
- In a group chat every group starts **collapsed**; the panel remembers your collapse choice per Bot, and a Bot that joins the chat later also starts collapsed.
- A card shows the Assignment title, a state chip (**Working**, **Needs input**, **Idle** or **Finished**), the progress as `x/y steps`, the step that is running now, and how long ago it changed.
- Expand a card to read its steps: finished steps keep a check mark, the running step is highlighted, a failed step is shown in the error colour.
- Click a card to open its work dialog, where **Open Session** takes you to that Assignment in DSH.

Progress counts the steps the panel has received, so it reads `12/15 steps` rather than a percentage — the step list keeps the most recent 40 entries of an Assignment, and a percentage of a truncated list would mislead.

## The five states

| State           | What it means                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Empty           | This chat has no Assignments yet.                                                              |
| Loading         | The panel is reading the chat’s Assignments.                                                   |
| Error           | The read failed. **Retry** reads again.                                                        |
| Row unavailable | One Assignment is listed, but its Session is no longer reachable; the rest of the panel works. |
| Truncated       | The chat has more than 200 Assignments; the panel shows the 200 most recent and says so.       |

If a refresh fails while older data is on screen, the panel keeps that data and marks it **stale** instead of emptying itself.

## Refresh and cost

- The open panel reads the chat every 10 seconds, and only while the tab is visible.
- **Closing the panel unmounts it: no requests, no timers.**
- Steps are read lazily: only for expanded groups, only for Assignments that are working or waiting on someone, and at most four at a time. Collapsed groups and finished Assignments are not re-read on every tick.
- Two failed reads in a row stop the automatic refresh; use **Retry** to start again.

## Board settings

The gear at the top right of the panel opens three switches that only affect this panel:

- **Show finished steps** — hide the completed steps of an expanded card and keep failures visible.
- **Expand Bots that are working** — leave a group open while it has work to report. Off by default, so a group chat stays as collapsed as you left it.
- **Only working tasks** — hide idle and finished Assignments.

The same three switches also appear as shortcut buttons at the top of the panel body.
