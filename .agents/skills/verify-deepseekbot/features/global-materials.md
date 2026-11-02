# DeepSeekBot global panel materials (T2)

## Sub-features

- Four independent light/dark palettes: Classic Blue, Mist Purple, Forest Green and Warm Amber.
- Global Header/Body color, opacity and blur, saved per mode through the same local owner and explicit Client CLI as T1.
- Background alpha only; text, controls, bubbles/cards/inputs and native DSH keep their independent surfaces. Menus and modals remain opaque.

## How to get to it (user POV)

Enter Bot mode → Bot settings → Appearance. Pick the mode and palette. Below the per-mode Primary controls, the current mode is named and two groups expose Header/Body color, opacity and background blur. Each control saves immediately. Reapply a preset to restore its known global defaults; the other mode remains unchanged.

## Driving it with verify-app

Launch and doctor one task-owned instance. Run `BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json node scripts/e2e-global-materials.mjs`. The journey uses visible controls and the real CLI executable; it saves light/dark settings and panel screenshots, canonical local readback, computed styles, reload results, and page errors.

The script temporarily places a striped test background behind the Channels content container, sets Body alpha to zero, captures the same empty patch with blur off/on and compares pixel variance. This is a controlled composition fixture, not wallpaper import support or a universal readability guarantee. It removes the fixture and restores the configured material afterward. `--baseline` captures the preceding T1 settings/panel entry state.

For macOS Desktop, follow the task-owned application procedure in [local appearance](local-appearance.md), exercise materials through settings and the same targeted CLI, capture both modes, flush storage, restart and verify the exact saved configuration. Source tests separately cover invalid fields, quota failure, unknown-field retention and theme reset scope.

## Gotchas

- Opacity is percent opaque: 100 is solid and 0 is transparent; controls and text must never inherit element opacity.
- Empty uniform backgrounds cannot visually prove blur. Keep the controlled before/after pixel proof separate from product screenshots.
- A transparent child may show the fill of its parent; per-panel nesting and overrides belong to T3/T4.
- Human QA remains separate from source, CI and automated runtime evidence.
