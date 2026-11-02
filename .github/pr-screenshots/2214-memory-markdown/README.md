# Web Memory Markdown verification

Base: `132b33e3c9965fcb5a01066a134f2744269b2d75`.
Captured feature source and running clean Host: `ad787e825fc2b55dd9f8d489b83dc3bc4181021b`.

Before and After use the same synthetic Bot, repository, document and desktop/narrow viewport. Current documents default to Markdown; source remains available. Working and historical diffs keep lines as their default and offer full rendered document sides. The image reference stays the same while its Git/current bytes visibly differ. The narrow comparison is vertically stacked; the supplemental After-side capture follows a real scroll.

`verification.json` records browser/Host identity, the nine exported fixture hashes, layout measurements, expected missing-image refusal and verification limits. The maintained `scripts/e2e-memory-markdown.mjs --name <task-owned-instance>` journey fails if the running Host is dirty or differs from the checkout commit. Fixture setup and private login data stay machine-local.

The external HTTPS fixture is intercepted in the browser with a CORS response: zero requests before the click and one afterward test the consent rule. This is not a qualification of a third-party image server. Missing local images show an explicit result; no historical fallback, model call, native-device check, merge or deployment is inferred. Human QA remains pending.
