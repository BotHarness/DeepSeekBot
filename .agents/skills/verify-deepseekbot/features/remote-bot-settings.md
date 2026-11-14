# Native remote Bot settings

## Sub-features

| Sub-feature | Visible result | Canonical proof |
| --- | --- | --- |
| Profile | Existing Bot profile controls show the selected remote Bot | Original Host show; serving Host's same-name Bot stays unchanged |
| Model | Native composer model controls retain the target choices | Original Host model-plan and Bot/preset revisions |
| Workspace | Native folder browser lists the target and grants its folder | Original Host workspace-options and grants |
| Approval | Existing approval controls apply to the selected Bot | Original Host approval-template list --bot |
| Isolation | Leaving, replacing or disconnecting the source prevents further writes | Both Host readbacks; no fallback or replay |
| Human chat | Files remain available without Bot settings or model controls | Human DM and Group visible controls |

## How to get to it (user POV)

Connect two isolated Hosts, select the remote Environment and open a Bot DM. Use the same profile, model, folder and approval controls as a local Bot conversation. There is no separate remote settings dialog. Browse folders on the target computer; remote chat must not open the serving computer's OS picker. Confirm folder authorization and revocation through the existing controls.

## Driving it with verify-app

Use task-owned instances through scripts/verify-app.mjs. Record source SHAs, launch homes and ports privately. Seed disposable Bots with equal names on both Hosts and a disposable target folder. Establish the documented reciprocal relationship and verify both fingerprints before opening remote chat.

Drive each mutation by accessible name, then read the owning Host through direct CLI: show, model-plan, workspace-options, grants and approval-template list --bot. Verify the serving Host's same-name Bot stays unchanged. Browse and authorize the target folder, then revoke the task-owned grant. Preserve native confirmation and revision checks.

Disconnect or replace the captured Client while folder resolution is pending. Its result must not trigger a grant or readback against a replacement Client. Failed or uncertain mutations must not be automatically retried. Regression coverage: packages/client/test/remote-folder-access.test.ts, packages/client/test/remote-conversation-source.test.tsx and apps/mobile/test/bot-settings.test.ts.

Capture matched light/dark, English/Chinese and supported narrow desktop views after finite message animations settle. Compare the same native control intent in three alternating base/head pairs; retain all failures and bounded request counts. Web evidence does not qualify installed Desktop or native mobile. Clean up only task-owned grants, Bots, observers and Hosts after retaining visible and canonical evidence.

## Gotchas

- Source authentication and canonical permissions stay authoritative; UI visibility grants no access.
- A changed source requires a fresh conversation context; old callbacks cannot migrate to new authorization.
- Folder browsing retains target entries and pagination while removing its native-picker hint.
- Pure Human chat retains Files and hides Bot-only panels, model, workspace and token controls.
- Preserve failed evidence before retrying; Human acceptance and native device checks remain separate.
