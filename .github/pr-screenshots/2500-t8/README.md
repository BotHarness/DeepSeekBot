# Remote Host settings evidence

Requested by Vain, issue #2500, PR #2540. Captured 2026-10-22 JST at 1440 × 900, English, light/dark, in disposable local Web Hosts. No Desktop, native phone or physical-machine tailnet qualification.

The final captures run source `e04195b49ad952b4c5da5e391ee5c720609b25f7` on main `30f62e48c7d9b79a085a52df691af277d0fe6fe9`. Subsequent changes only refresh evidence and the verification journey. `bl.png` / `bd.png` retain the original pre-feature menu baseline; new settings pages use that absence state as their predecessor.

| Files        | Observed result                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| al/ad        | Remote settings added beside Change icon and Remove                                                  |
| ml/md        | Source Host default genuinely changed from Flash to Pro; native revision 1 → 2; local Host unchanged |
| pl/pd        | Existing preset name saved on Enter/blur; composition Enter does not submit                          |
| st           | Another client changed revision 2 → 3; the old page refused without overwriting                      |
| mr           | Test transport omitted catalog revision; shared client refused before sending a write                |
| ul/ud        | Source Host usage and Memory activity                                                                |
| sl/sd, mc/xc | Source Host storage, media/message previews and explicit confirmation                                |
| ol/od        | Offline settings content unmounted without local fallback                                            |
| rl/rd        | Revoked pairing unmounted settings content                                                           |
| xl/xd        | Removing the only Remote Host forgot its browser record and hid the strip                            |

The source Profile retained a provider-only AX Patch so the native default-model settings owner could persist changes. No owner or revision check was bypassed. CLI also performed a real Pro → Flash change, rejected stale revisions, rejected cleanup without `--confirm`, and rejected the source Host's preview token on the other Host. The browser's delayed preset write stayed on its original Host after closing and switching to This host.

The fresh live-model attempt selected only `deepseek-v4-pro` and received `429 GoUsageLimitError: Go usage limit exceeded`. No successful new reply is claimed, and no retry was made. Existing task messages visible in the background are older fixtures.

Full build, typecheck, lint, format, docs build, 119 related tests and 7 artifact/docs tests passed. Browser diagnostics showed no page exceptions; expected request cancellations and disconnect failures are retained in private task evidence. Task Hosts were stopped and their ports released after QA. Native iOS/Android light/dark/large-text checks remain an external handoff for the shared phone model-settings change.
