# Bot Inbox flush-list visual evidence

- Baseline: `953cec92e67a70e3c6f386adbcd6031800683ee2` (merged #2027).
- After: the source changes in this PR; same isolated DSH `0.2.0-rc.2` Web Client.
- English; 1440 × 1000 for dark/light time/source pairs, 1000 × 850 for the compact source pair.
- These are real Client renders of **synthetic response fixtures** for `botAttention`, not evidence of real external messages, model execution, or admission state transitions. The Host roster and DM are real isolated QA state; no production data or credentials are included.
- Fixture: Human pending/handled/ignored, Assignment progress, external Lark message, memory change, snoozed schedule with note; completed group expanded. All seven rows appear in both views.

## Reproduce

1. Build the revision and launch a task-owned rc.2 Host using `verify-app.mjs`; run doctor.
2. Enter Bot mode, select a Bot DM, close Sessions through the control rail so Bot Inbox has a full-height column.
3. Populate representative Inbox states in a QA profile, or intercept only the `botAttention` response with the fixture categories above for visual checks.
4. Expand Done; capture Time view. Use Inbox view options → By source; capture Source view.
5. Repeat in dark/light themes and resize to 1000 × 850.

`measurements.json` records the after-render geometry: body padding, list border/radius/margin and group spacing are zero; all list edges match the body; row inner padding is retained; no horizontal overflow. No page errors were observed. This evidence qualifies Web rendering only; native Desktop was not rerun for this CSS follow-up.

## Light-theme refinement

`before-light-separation.png` is the already-flat Inbox at `e8286248d94653187e11daf98068788d51a73a43`; compare with `after-light-time.png` to isolate the workspace color change. All after images were refreshed for the light-theme refinement. `theme-colors.json` confirms that only the light canvas changes to DSH’s module surface, while Panel colors and both dark colors stay unchanged.
