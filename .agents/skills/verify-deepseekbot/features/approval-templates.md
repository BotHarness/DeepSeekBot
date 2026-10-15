# Approval Templates and auto approval

A Human writes Approval Templates, a PersonaBot selects one, and the Approval Reviewer answers that Bot's operation approvals by the template's text before any card is posted (ADR-0207).

## Sub-features

- `library` is Bot settings → Auto approval: every template with `Built-in` or its file name, its description and the Bots that use it. `New` creates one; `View` opens a built-in read-only with `Copy`; `Edit` opens a Human template with `Save` and `Delete`.
- `cli` is `deepseekbot approval-template list|show|create|edit|delete` and `approval-template-set <bot> <name|off>`. Files live in `$DSH_HOME/botharness/approval-templates/<name>.md`.
- `select` is the Bot's channel settings → Auto approval page, or the composer workspace panel.
- `reviewer` leaves a folded `Auto-approved by <template>` or `Auto-rejected by <template>` system line in the Channel.
- `guard` turns a Bot Shell call that selects a template, or edits or deletes a template some Bot uses, into a Human card that the reviewer and saved rules never answer. Creating a template, or editing one no Bot uses, runs without a card.

## How to get to it (user POV)

- Bot mode → `Bot settings` → `Auto approval`.

## Driving it with verify-app

Preconditions: `launch` reported a model credential and `doctor` passes. Point the CLI at the instance with `--host <origin>` and `--token-file <file holding the launcher token>`.

- **Library.** `shot <label> --bot-mode --click "Bot settings" --click "Auto approval" --wait-text "Get the work done"`. Then `--click "Edit"` on a Human template or `--click-text "View"` on a built-in, and `--click "Copy"` then `--click-text "New"` to save the copy. Proof: the file appears under `approval-templates/`.
- **Reviewer follows the text.** Create a template that rejects files named `secret-plan` with a fixed reason, select it, and DM the Bot to write `/root/bh-1824/secret-plan.txt` and ask to leave the sandbox. Proof: `rpc botharness/channelMessages` holds a system entry with `toolAutoApproval.outcome: "rejected"` and that reason, and the file does not exist.
- **Guard.** Copy the launcher token to a file the Bot's Shell can read and give the Bot the full CLI command. `create` returns with no card. `edit` of a template another Bot uses posts a `toolApprovalRequest` entry; `tool-approval-decide <channel> --message-id <id> --outcome rejected` leaves the file's hash unchanged.

## Gotchas

- `/tmp` is writable inside the Bot sandbox, so a write there never reaches the reviewer. Use a path outside it.
- The model tends to refuse to edit the template it is itself bound by. Exercise the guard with a template another Bot uses.
- The default Bot only exists after the Web Client first loads; run one `shot` before CLI calls that need its id.
