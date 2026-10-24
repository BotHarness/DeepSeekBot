# User guide — S1 model and S2 panel paths

## Sub-features

- `entry`: persistent bottom rail info opens one ordinary Global User guide panel; no automatic guide.
- `panel-location`: panel FAQ Show location highlights its visible header, control or panel switcher through Driver.js. For a Messages child with its parent closed, gate Next on opening Messages, then locate the child; Done/Escape restore the leased layout. With Messages already visible, skip the parent step. Other single location hints do not write layout.
- `model-faq`: search and topic selection show bilingual model-scope answers, including unavailable contexts.
- `model-guide`: feature-owned anchors locate the real composer model control and modal. Semantic model-plan completion gates Done; mask clicks do not advance.
- `transient-layout`: the Dock owner excludes tutorial outer/inner state from normal saved preferences; cancellation reveals normal layout and preserves settings/drafts.
- `tob-draft`: Ask Tob opens its existing DM, prefills an empty draft, preserves occupied/structured drafts, and appends only after Insert question. No automatic send.
- `plugin-text`: independently install VRM and read its public Help contribution while its Panel is closed; unload removes help.
- `panel-practice`: use the panel topic's Practice layout action to move, resize, hide and reopen the real panel. Include Sessions nested inside Messages; completion/cancellation restores exact saved layout without replacing the composer or losing drafts.
- `plugin-guide`: independently install VRM, manually open a ready character and choose How do I change the camera? Multiple targets require selection; labels use Panel title plus ordinal in the current eligible-candidate enumeration, not raw instance IDs or a guaranteed visual position. Step resolution highlights the feature-owned header wrapper; its Scene trigger's `aria-controls` links to its own portal. Only that mount's Scene state and camera/tour predicate complete the operation; changes remain afterward.
- `guide-availability`: optional HelpGuide.subscribe notifications refresh availability through contribution-owned subscriptions without replacing an active guide. VRM shares one controls listener per mount between availability and run checks and deduplicates availability notifications; frame updates must not churn the Help catalog.
- `quick-search`: Alt+K reads the existing Panel registry and Help index. Panel results display on/off and toggle; FAQ results reveal the matching expanded answer, reset prior filters and never auto-start a tour.
- `client-access`: help-client inspects the same live Client service opens an exact FAQ with show and cancels the selected guide.

## How to get to it (user POV)

Enter desktop Bot mode, open a Bot DM, and choose User guide at the bottom of the control rail. Read “How do I change this Bot’s model?”, choose Guide me, operate the real model control, and finish. Reopen the answer to choose Ask Tob; verify the unsent text and explicit insertion when a draft already exists.

For S2, open the Sessions topic. With Messages closed, choose Find in Messages, open Messages when prompted, then open Sessions from its header. Next choose Practice layout and manipulate the real nested panel. For the independent Plugin path, manually open a ready VRM Companion, then choose User guide → VRM Companion → How do I change the camera? Open Scene on the chosen character and select the requested Room/Desk view. Do not infer a physical panel's identity from an ordinal alone.

## Driving it with verify-app

Use a task-owned isolated Host and run doctor. Set `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json` and run `node scripts/e2e-user-guide.mjs`. Keep each attempt's screenshots, accessibility snapshots, console errors and canonical model/layout readback. The script closes its own browser in finally; the task must separately stop and verify the Host.

The S2 journey is `scripts/e2e-panel-guide.mjs`. Against the task-owned Host, run both themes separately:

```sh
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json BH_GUIDE_THEME=light node scripts/e2e-panel-guide.mjs
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json BH_GUIDE_THEME=dark node scripts/e2e-panel-guide.mjs
```

`BH_GUIDE_THEME` defaults to `light`; add optional `BH_GUIDE_VRM=1` for the camera path after independently installing VRM. Add `BH_GUIDE_VRM_INSTANCES=1` for explicit mounted-instance selection/removal and `BH_GUIDE_PLUGIN=1` for disabling/re-enabling VRM through the real Plugins settings while the original page owns a guide. `BH_GUIDE_HIDDEN=1` covers a hidden Sessions control; `BH_GUIDE_GROUP=1` requires a synthetic Group named `S2 guide group` (or `BH_GUIDE_GROUP_LABEL`) for Members discovery and DM draft return. The default nested-Sessions path checks layout equality, composer identity and retained draft. Keep theme, source revision and native evidence separate. An optional script branch is a verification path, not evidence of a VRM runtime pass.

Read normal `botharness.bot-mode-layout` before, during and after a guide and after refresh. Cover outer and inner geometry, completion, Escape/close, switching Channel, target removal, Plugin disposal, leaving Bot mode, cancellation during preparation, and an external normal-layout change. Compare the actual model plan via the existing CLI/API. Saved settings and drafts must survive.

With the task browser's local CDP endpoint and exact page target ID, run `deepseekbot help-client --cdp <local-origin> --target <id> --action content`, then availability/state/start/cancel. A successful command proves same-owner access, not the visual journey.

## Gotchas

- S1 (#2717) has Human acceptance; PR #2732 remains unmerged. On October 25, 2026 (JST), both light/dark Web runs passed all the optional S2 branches above, including cross-page Plugin disposal during a guide, one re-registered topic, no automatic guide revival and a fresh guide on the original page. Layout equality, composer/draft retention, VRM camera changes, explicit instance selection/removal and Group Members discovery also passed. The Human subsequently accepted proceeding to S3 and continuing stacked PRs. This does not turn the untested native 125% zoom or native VRM/Plugin paths into passes; preserve those limits for the final desktop qualification. No S3/S4 acceptance is claimed. The Human pulled Quick Switcher/FAQ search behavior forward as feedback, not as acceptance of the rest of S4.
- A persistent task browser profile can restore old tabs on launch even when the previous process exited. The failed Plugin-reactivation run accumulated 61 restored startup pages; Chromium recorded socket-pool exhaustion while the original page waited for a Plugin script. The journey now closes its own restored startup pages, asserts one active page before driving, and closes owned pages before browser shutdown. Keep the failure evidence; do not repair it by weakening Plugin assertions, increasing timeouts or changing DSH module lifecycle. Re-enabled Plugin help is a new registration, so explicitly reopen its FAQ before starting a fresh guide. Never apply this cleanup to a Human/shared browser.
- Workspace reload must preserve saved outer and nested geometry exactly. Dockview serializes visible sizes excluding theme gaps; the layout owner adds those gaps back only when restoring saved geometry. A normal-refresh control reproduced drift before this correction; do not weaken equality assertions.
- The existing Dockview 8.4.1 patch also preserves fractional allocations when the container size is unchanged. A captured post-drag layout reproduced first-reload rounding; the regression covers restore, guide release and genuine proportional resizing. Keep exact equality assertions for this case.
- Driver.js 1.4.0 has a pinned lifecycle patch: overlay/popover capture handlers belong to their own elements, and destruction removes the global Tab handler. Run `packages/client/test/driver-lifecycle.test.ts` plus repeated real start/cancel checks when upgrading it; retained detached popovers were traced to document listeners before this patch.
- Use the observed accessible language; a navigation idle timeout is not a settings failure.
- Preserve the first failed observation before a retry. Native Desktop results must be recorded separately from Web.
- Never navigate another session's native window or use a model response as proof of layout/draft behavior.
