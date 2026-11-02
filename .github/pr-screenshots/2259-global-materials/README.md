# T2 global panel materials evidence

Baseline: T1 `17ba45f46ec1d6ab99516d7f6af36dfefd2f82ae`. After: the T2 commit containing this directory. Web captures are 1440 × 1000, English, with a task-owned DSH 0.2.1-rc.2 Host and fresh browser. Baseline settings show the prior entry point without material controls. After captures show light Forest Green with separate custom Header/Body materials, then dark Warm Amber. No real chat content is included.

## Verified

- Focused source regression: 84 tests in seven files; lint, format, root/mobile typecheck and build pass.
- Live Web settings and targeted CLI use the same local owner; Header/Body values render, light/dark state stays separate and reload restores the exact configuration. Page errors: zero. Home activity-card background and element opacity stay unchanged by material edits.
- Controlled stripe fixture remains mounted for both pixel captures. Web brightness variance: 16256.25 without blur, 38.32694214875846 with blur. This proves backdrop composition in the tested browser, not readability on arbitrary media.
- Task-owned official macOS Desktop 0.2.1-rc.2: light/dark material render, UI/CLI readback and same-application-directory restart restore pass. Native pixel variance: 16256.25 without blur, 47.290591715976916 with blur.
- Native DSH body theme attribute and inline style are unchanged through the exercised appearance changes. Controls retain full element opacity; modal stays opaque.

## Limits

Human QA is pending for T1 and T2. T2 is a dependent Draft under the Human's expanded all-slice authorization. No merge or deployment is authorized. Windows Desktop, forced native storage failure, plugin unload, arbitrary wallpaper readability and all internal message variants are not covered by these captures. Wallpaper import and panel-specific overrides belong to later slices. Storage refusal, unknown-field retention and per-mode preset reset are source-tested. Full local suite was not repeated for T2; CI is reported separately on the PR. The black native Home control is the existing Configure model primary button in an unconfigured isolated Profile, not a message composer.

## Reproduce

Build, launch and doctor an isolated instance with `scripts/verify-app.mjs`, then run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-global-materials.mjs`. Native steps are in the global-materials feature map. Review both Header/Body controls in Appearance, switch modes, reapply a preset, restart and inspect native DSH surfaces before accepting.
