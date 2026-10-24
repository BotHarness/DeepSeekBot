# User guide — S1 model path

## Sub-features

- `entry`: persistent bottom rail info opens one ordinary Global User guide panel; no automatic guide.
- `panel-location`: panel FAQ Show location highlights its visible header, control or panel switcher through Driver.js. For a Messages child with its parent closed, gate Next on opening Messages, then locate the child; Done/Escape restore the leased layout. With Messages already visible, skip the parent step. Other single location hints do not write layout.
- `model-faq`: search and topic selection show bilingual model-scope answers, including unavailable contexts.
- `model-guide`: feature-owned anchors locate the real composer model control and modal. Semantic model-plan completion gates Done; mask clicks do not advance.
- `transient-layout`: the Dock owner excludes tutorial outer/inner state from normal saved preferences; cancellation reveals normal layout and preserves settings/drafts.
- `tob-draft`: Ask Tob opens its existing DM, prefills an empty draft, preserves occupied/structured drafts, and appends only after Insert question. No automatic send.
- `plugin-text`: independently install VRM and read its public Help contribution while its Panel is closed; unload removes help.
- `quick-search`: Alt+K reads the existing Panel registry and Help index. Panel results display on/off and toggle; FAQ results reveal the matching expanded answer, reset prior filters and never auto-start a tour.
- `client-access`: help-client inspects the same live Client service opens an exact FAQ with show and cancels the selected guide.

## How to get to it (user POV)

Enter desktop Bot mode, open a Bot DM, and choose User guide at the bottom of the control rail. Read “How do I change this Bot’s model?”, choose Guide me, operate the real model control, and finish. Reopen the answer to choose Ask Tob; verify the unsent text and explicit insertion when a draft already exists.

## Driving it with verify-app

Use a task-owned isolated Host and run doctor. Set `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json` and run `node scripts/e2e-user-guide.mjs`. Keep each attempt's screenshots, accessibility snapshots, console errors and canonical model/layout readback. The script closes its own browser in finally; the task must separately stop and verify the Host.

Read normal `botharness.bot-mode-layout` before, during and after a guide and after refresh. Cover outer and inner geometry, completion, Escape/close, switching Channel, target removal, Plugin disposal, leaving Bot mode, cancellation during preparation, and an external normal-layout change. Compare the actual model plan via the existing CLI/API. Saved settings and drafts must survive.

With the task browser's local CDP endpoint and exact page target ID, run `deepseekbot help-client --cdp <local-origin> --target <id> --action content`, then availability/state/start/cancel. A successful command proves same-owner access, not the visual journey.

## Gotchas

- S1 is pending Human acceptance. S2–S4 remain gated; the Human explicitly pulled the Quick Switcher/FAQ search behavior forward as feedback. This does not qualify the rest of S4.
- Workspace reload must preserve saved outer and nested geometry exactly. Dockview serializes visible sizes excluding theme gaps; the layout owner adds those gaps back only when restoring saved geometry. A normal-refresh control reproduced drift before this correction; do not weaken equality assertions.
- The existing Dockview 8.4.1 patch also preserves fractional allocations when the container size is unchanged. A captured post-drag layout reproduced first-reload rounding; the regression covers restore, guide release and genuine proportional resizing. Keep exact equality assertions for this case.
- Driver.js 1.4.0 has a pinned lifecycle patch: overlay/popover capture handlers belong to their own elements, and destruction removes the global Tab handler. Run `packages/client/test/driver-lifecycle.test.ts` plus repeated real start/cancel checks when upgrading it; retained detached popovers were traced to document listeners before this patch.
- Use the observed accessible language; a navigation idle timeout is not a settings failure.
- Preserve the first failed observation before a retry. Native Desktop results must be recorded separately from Web.
- Never navigate another session's native window or use a model response as proof of layout/draft behavior.
