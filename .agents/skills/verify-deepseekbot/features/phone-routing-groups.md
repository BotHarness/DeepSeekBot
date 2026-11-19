# Routing Group editing on the phone

## Sources

- `apps/mobile/app/settings/routing-group.tsx`
- `apps/mobile/src/ui/chat/routing-group-editor.tsx`
- `apps/mobile/test/routing-group-editor.test.ts`
- `packages/host-client/src/model-settings.ts`

## Terms

- Routing Group
- Model Choice
- Settings

## Sub-features

- Create a Routing Group, rename it, and edit the fallback order of its models, nested groups, and Subscription Engines.
- Confirm deletion and show in-use references, dependency cycles and revision conflicts.

## How to get to it (user POV)

Open Settings → Models and presets → Routing Groups. Add a group or open an existing one.

## Driving it with verify-app

Use the assigned [shared device QA](../../../../docs/agents/device-qa.md) lane. Pair to its disposable QA Host as the owner and seed two known models through the normal provider setup. No model reply is needed.

1. Open Settings → Models and presets → Routing Groups. Add a named group with both models. Save and verify the new row. Use `deepseekbot model-group <id>` to confirm the stored members and order.
2. Open the group again, rename it, and add a second Routing Group. Verify the picker shows models and eligible groups and excludes the one being edited. Reorder with the row controls, swipe a member to remove it, save, and read back the order and nested group ID.
3. Create a group that uses the edited group. Try adding that parent to the edited group and verify the cycle banner and retained draft. Try deleting the edited group and verify the banner names the parent. Cancel a delete confirmation once. Remove the reference, confirm deletion, and verify the group disappears on the phone and CLI.
4. Open an existing group on the phone and update it from the CLI. Save a phone edit and verify the revision banner and retained draft. Reopen the group to read the latest revision. Confirm that backing out of an unsaved draft asks before discarding it.
5. Repeat the editor and member-picker checks in light and dark and at default, intermediate and maximum system text sizes. Open each text field with the native keyboard and verify the caret, save action and sheet dismissal remain reachable.

Follow [Subscription Engines in Routing Groups](routing-group-engine-members.md) for the phone engine-picker, edit, and save-refusal checks.

## Gotchas

- Record the source SHA, device/build, each step's result and before/after captures.
- Remove the QA groups in dependency order.
