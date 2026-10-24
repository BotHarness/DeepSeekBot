# User guide — S1 model path

## Sub-features

- `entry`: persistent bottom rail info opens one ordinary Global User guide panel; no automatic guide.
- `model-faq`: search and topic selection show bilingual model-scope answers, including unavailable contexts.
- `model-guide`: feature-owned anchors locate the real composer model control and modal. Semantic model-plan completion gates Done; mask clicks do not advance.
- `transient-layout`: the Dock owner excludes tutorial outer/inner state from normal saved preferences; cancellation reveals normal layout and preserves settings/drafts.
- `tob-draft`: Ask Tob opens its existing DM, prefills an empty draft, preserves occupied/structured drafts, and appends only after Insert question. No automatic send.
- `plugin-text`: independently install VRM and read its public Help contribution while its Panel is closed; unload removes help.
- `client-access`: help-client inspects the same live Client service and cancels the selected guide.

## How to get to it (user POV)

Enter desktop Bot mode, open a Bot DM, and choose User guide at the bottom of the control rail. Read “How do I change this Bot’s model?”, choose Guide me, operate the real model control, and finish. Reopen the answer to choose Ask Tob; verify the unsent text and explicit insertion when a draft already exists.

## Driving it with verify-app

Use a task-owned isolated Host and run doctor. Set `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json` and run `node scripts/e2e-user-guide.mjs`. Keep each attempt's screenshots, accessibility snapshots, console errors and canonical model/layout readback. The script closes its own browser in finally; the task must separately stop and verify the Host.

Read normal `botharness.bot-mode-layout` before, during and after a guide and after refresh. Cover outer and inner geometry, completion, Escape/close, switching Channel, target removal, Plugin disposal, leaving Bot mode, cancellation during preparation, and an external normal-layout change. Compare the actual model plan via the existing CLI/API. Saved settings and drafts must survive.

With the task browser's local CDP endpoint and exact page target ID, run `deepseekbot help-client --cdp <local-origin> --target <id> --action content`, then availability/state/start/cancel. A successful command proves same-owner access, not the visual journey.

## Gotchas

- S1 is pending Human acceptance. S2–S4 are not implemented by this journey.
- Use the observed accessible language; a navigation idle timeout is not a settings failure.
- Preserve the first failed observation before a retry. Native Desktop results must be recorded separately from Web.
- Never navigate another session's native window or use a model response as proof of layout/draft behavior.
