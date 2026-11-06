# Group invitation candidates

## Sub-features

- `eligible-candidates`: invitations exclude protected Tob, archived/deleted Bots, current members and pending invitees. Tob is identified by the Host's `tob` marker, not its name or slug.
- `private-chat-guidance`: the dialog explains that Tob cannot join Groups and can be contacted privately.
- `ordinary-invitation`: choosing an eligible Bot submits through the existing Channel owner and shows the canonical membership or pending invitation.
- `live-selection`: if a selected Bot becomes unavailable while the dialog is open, submission is disabled and sends no invitation.

## How to get to it (user POV)

Enter Bot mode, open a Group, open Subpanel column if its Members panel is hidden, then choose Invite member. Search or select a Bot and confirm. Tob remains available through its private conversation.

## Driving it with verify-app

Launch a task-owned Host and run doctor. Seed a Group and an ordinary Bot through `botharness/channelCreate` and `botharness/create`; read `botharness/list` for the actual protected identity.

Use `shot --bot-mode --click-text <group-name> --click "Subpanel column" --click "Invite member"` after confirming the current accessible names and column visibility in the ARIA snapshot. Capture the dialog in light and dark. Require the protected identity to be absent, its private-chat guidance visible, and the ordinary Bot selectable. Confirm the ordinary invitation in the UI, then read `botharness/channelGet` for the same Group and require accepted membership (or a pending invitation if automatic acceptance is disabled).

Rename the protected Tob and confirm it remains excluded; give an ordinary Bot the display name Tob and confirm it remains eligible. A direct `botharness/channelGroupInvite` targeting the protected identity must still refuse with `protected-bot` and leave membership unchanged. No model reply is needed.

## Gotchas

ADR-0226 intentionally keeps Tob outside Groups. Fixing this picker must not remove the Host's protected-identity check. A generic management error in the old dialog is not evidence that Tob participation should be enabled. Web evidence does not qualify native Desktop differences.

