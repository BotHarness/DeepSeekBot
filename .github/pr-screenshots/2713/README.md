# rc.3 development compatibility

2026-10-24, macOS Web Chromium, 1440 × 900, English/light. Dedicated isolated DSH 0.2.1-rc.3 Host built from this branch. `reply.png` shows the actual Tob conversation after a Host restart, with the persisted `323 VERIFIED` reply from the official DeepSeek Flash route. The prompt did not contain the computed number. Canonical Channel history confirmed a Human message and a Bot-authored reply without `sessionFailure`; browser console reported zero issues.

The earlier Go attempt returned `429 Go usage limit exceeded`. A numeric `42` wait incorrectly matched that error, so it was rejected as proof. The test-only Bot was explicitly switched to official DeepSeek using the existing machine-local credential, leaving the shared default unchanged. An earlier driver attempt used the wrong Home input name; another was blocked by the first-run intro. Failures and observations remain in private local evidence.

This is compatibility evidence, not a before/after UI redesign or native Desktop screenshot. No product UI source changed. It does not qualify Desktop zoom, physical devices, external IM delivery or released npm tarballs. The dedicated Host was stopped, child absence checked and its port verified released; the disposable Profile was removed after exit. No private credentials or Profile data are included.

## Automated checks

- Plugin build, root and mobile typechecks, oxlint (existing warnings), source policy, CLI parity, feature map, preset sync, CI-plan checks, bilingual release ledgers and install-identity checks passed.
- Focused upgrade checks: 41 tests passed; the subsequent version-matrix/theme/Go set passed 38 tests.
- Full suite: 9,438 passed, 27 skipped, 3 failed across 1,082 files. The source-policy test exceeded its 15-second deadline under concurrent load; docs release-surface build failed with ENOSPC; the untouched VRM daylight assertion returned 0.98736 instead of 1 in Asia/Tokyo.
- After heavy jobs exited, a serial UTC rerun of source-policy and outdoors passed all 13 tests. No production code or test timeout was changed to hide these results. The timezone-dependent outdoors assertion is outside this upgrade diff.
- A separate docs build overlapped the suite's internal Astro build in the same output directory and failed on a missing prerender chunk. This scheduling error and the disk-space failure prevent claiming a successful docs build; rerun docs/release-surface validation serially with adequate free space. The failed reproducible output was removed only after both builds exited.

Native Desktop, device QA, source IM Provider requalification, published-package fresh-Profile installation and Human QA remain open. No merge, release, global CLI replacement or migration of an existing Human/shared Profile occurred.
