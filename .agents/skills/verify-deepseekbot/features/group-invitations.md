# Group member selection and invitations

## Sources

- `packages/client/src/client/{environment-creation,section-management,group-member-controls,group-member-picker,personabot-deletion}.tsx`
- `packages/core/src/features/channels/group-members.ts`
- `apps/mobile/src/ui/chat/{invite-selection,invite-sheet,invite-sheet.android}.{ts,tsx}`

## Terms

- Group invitation
- Channel membership
- Team mode
- Host Member
- PersonaBot Deletion
- Tob

## Sub-features

- `desktop-create`: fill the name with no selections to create an empty Group. Select multiple Bots before creating a second Group to see an outcome for each Bot. Switching Hosts clears selected identities and keeps the name.
- `desktop-existing`: Add members opens the same picker. Search for a second target and verify the first selection remains available to review and remove.
- `eligible-candidates`: invitation candidates exclude protected Tob, archived/deleted Bots, current members and pending invitees. Tob is identified by the Host's protected identity check. The existing Group dialog retains private-chat guidance for Tob.
- `mixed-team-batch`: an authorized user can add an eligible Host Member and invite their reachable Bot in one batch. Show the prerequisite when the Human is absent. The selected Human gets immediate private Channel and history access. A Bot joins or remains pending according to auto-accept.
- `retry`: a target that becomes unavailable before submission has an individual failure result. Retry that result in the same Group. Replaying a submission with the original operation keys after an unconfirmed response produces no duplicate Group or invitation.
- `deleted-member-recovery`: deleting an ordinary Bot that belongs to two Groups clears both memberships and any owner/wake-policy references atomically. Restart repairs legacy missing members without changing history. Group reads omit references that became invalid after startup. The existing member-removal command can remove a legacy missing reference.

## How to get to it (user POV)

Enter Bot mode. Choose Create channel from the roster menu. For an existing Group, open its Members panel in the subpanel column and choose Add members. On mobile, use Invite member from the existing Group Info flow.

## Driving it with verify-app

Launch a task-owned Host and run doctor. Seed a Group and two ordinary Bots through `botharness/channelCreate` and `botharness/create`. Inspect `botharness/list` for the protected identity. Confirm accessible names from the ARIA snapshot.

- In Create channel, fill the name, select two Bot checkboxes and create. Read the resulting Group using `botharness/channelGet` and compare its members and invitations with the rows in the result dialog.
- Open the seeded Group and its Members panel, then select Add members. Select one Bot, change the search, select another Bot, and submit. Save screenshots in light and dark. Verify protected Tob and current Bot members are absent. Repeat with Bot auto-accept disabled and require a pending result.
- With Team mode on, use an authorized Human and a second active Host Member who owns a reachable Bot. Check the prerequisite from the Bot row, select the Human and Bot, confirm the history hint and submit. Verify the Human's Channel access and the Bot outcome through the Host. Repeat with a stale target and compare a confirmed partial result and retry with canonical membership and invitation state.
- Compare CLI candidate and result projections with the UI for the same Host using `group-member-picker` and `group-members-add`. Exposing the member candidates without the corresponding Channel permission must be refused or omit that participant type. No model reply is needed for accepted invitations.

## Gotchas

For #3635, create two disposable Groups containing the same ordinary Bot and a surviving peer. Delete the ordinary Bot with Memory retained through the existing confirmation flow. Read both Groups and require only the peer to remain, then remove the peer from each Group. Check the Members panel after refresh. Automated rollback/restart coverage is in `packages/core/test/personabot-deletion.test.ts`; passing those Core tests or online CLI checks alone does not establish Web, native or Human acceptance.

ADR-0226 intentionally keeps Tob outside Groups. Fixing this picker must not remove the Host's protected-identity check. A generic management error in the old dialog is not evidence that Tob participation should be enabled. Web evidence does not qualify native Desktop differences.
