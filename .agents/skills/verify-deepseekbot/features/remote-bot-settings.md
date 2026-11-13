# Exact remote Bot settings

## Sub-features

| Sub-feature | Visible result | Canonical proof |
| --- | --- | --- |
| Channel owner | Manage Bot opens the owning Bot and named Host, including Group ownership | Original Host `show`; another same-name/same-slug Host is unchanged |
| Name draft | Save, Discard and Cancel preserve the selected Bot; failed saves retain the draft | `show` and `profileFingerprint` from the original Host |
| Model and preset | Model/effort changes and preset application appear after owner readback | `model-plan` including Bot revision; preset application checks both revisions |
| Workspace | Browse the remote filesystem, authorize a disposable folder, then confirm revoke | `workspace-options` and `grants` on the original Host |
| Approval template | Selection changes for this Bot | `approval-template list --bot` on the original Host |
| Isolation | Offline/revoked/replaced access cannot write elsewhere or replay a draft | Original Host and other Host readbacks; no network membership change |

## How to get to it (user POV)

Connect two isolated Hosts, open a remote Bot DM or a Group whose owning Bot is listed, then choose **Manage Bot** in the chat header. The modal names the Host and Bot and stays independent of Environment Scope and later chat selection. Change Bot name, Models and execution, Authorized folders, and Auto approval. Use the remote folder browser rather than a local OS picker. Confirm folder grant/revoke explicitly. A dirty name prompts before closing or changing section; Save must finish on the original owner, Discard drops the draft, and Cancel keeps editing.

## Driving it with verify-app

Use separate task-owned instances through `scripts/verify-app.mjs` and the documented isolated two-Host connection path. Record parent/product/helper SHAs, launch homes and ports privately. Seed disposable Bots with equal names/slugs on each Host and a remote Workspace through direct CLI. Capture matched Before (remote chat without Manage Bot) and After in light/dark, English/Chinese and narrow layout; publish only reviewed R2 derivatives.

Drive each mutation in the Web Client by accessible name, then use direct CLI against its owning Host: `show`, `model-plan`, `grants` and `approval-template list --bot`. Verify the serving Host’s same-name Bot and Bot collaboration membership remain unchanged. Switch Environment Scope while settings are open and repeat owner readback. Delay a read/save, disconnect/revoke the source and separately re-register the same Host ID with a different Client: old callbacks cannot update a new settings session or submit through the replacement. Failed name saves keep the draft; read-only Refresh settings does not replay them. Restore the original connection for Save or explicitly Discard.

Run three alternating base/head pairs with the same open-settings, read, rename and close intent; retain elapsed time and bounded request counts. A two-Host local Web run does not qualify installed Desktop or native mobile. Clean up only task-owned grants, Bots, observers and Hosts after both canonical and visible evidence is retained.

## Gotchas

- Source connection authentication and canonical permission/directory checks remain authoritative. Visibility is not a new admin/read-only access tier.
- A replaced Client requires closing and reopening settings; its old draft stays bound to the captured Client and cannot migrate to fresh authorization.
- Unsupported system-local interactions are performed on the Bot’s computer. Remote settings never use the serving computer’s picker.
- A lost mutation reply is uncertain. Refresh reads the same owner; it never retries a mutation automatically.
- Native device and Human acceptance are separate from these Web checks. Preserve failed evidence before retrying.
