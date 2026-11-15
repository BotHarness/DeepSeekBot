# Settings during first-Tob preparation

## Sub-features

- Approval Templates, Prompt Presets and Voice settings must remain responsive while a new Profile prepares its first Tob Memory.
- Model catalogs read native configuration once per request and share credential-reference checks within that request. A subsequent request reads current settings.

## How to get to it (user POV)

Open a new isolated Host in the Web Client, enter Bot mode and open Bot settings. Visit Auto approval, Prompts and Voice while first-run preparation is active. Each page should show its real data without waiting for the Tob Memory Git work to finish. The automated journey below verifies concurrent HTTP reads; the later page visits check rendered data after preparation and do not prove concurrent page rendering.

## Driving it with verify-app

Build and launch a fresh named Host. Before opening its Web Client, run `scripts/e2e-settings-loading.mjs` with `BH_E2E_INSTANCE` pointing to its private `instance.json`; optional `BH_E2E_RESULT` saves the timing JSON. The script refuses a populated Bot registry, starts the real onboarding RPC and requires all three settings reads to finish within 500ms during that preparation. It awaits onboarding before exiting, including after a failed budget assertion. No model is used.

After the script completes, first-Tob preparation has finished. Run `verify-app shot` in Bot mode, open `Bot settings` and visit `Auto approval`, `Prompts` and `Voice`. These visits verify only the post-preparation UI state. Keep the screenshots, ARIA snapshots and console output. Read back `approvalTemplates`, `promptPresets` and `voiceProviders` through `verify-app rpc` to correlate the visible records. Stop only this task's Host after verification.

## Gotchas

- A Profile whose Tob already exists hides the initialization regression. The empty-registry precondition is mandatory.
- The script records request intervals and refuses a sample without preparation overlap; the 50ms scheduling delay alone is not proof of overlap. Immediate onboarding rejection is handled and rethrown after the concurrent reads settle.
- This is a local HTTP responsiveness budget, not a foreground paint or Desktop benchmark. Record machine load and do not mix a first-run sample with initialized browser openings.
- Markdown/JSON library storage remains unchanged. SQLite migration is tracked separately in #4227.
- Tob is Owner-only: Member setup refuses before allocating Workspace grants. Member deactivation still drains any member-owned Registry preparation before account cleanup. `packages/core/test/team-member-lifecycle.test.ts` covers that drain, Member Tob refusal and Host ownership changing during Owner Tob preparation; an old Owner must not publish a Tob after the await.
