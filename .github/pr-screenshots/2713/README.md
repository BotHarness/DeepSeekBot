# rc.3 development compatibility

2026-10-24, macOS Web Chromium, 1440 × 900, English/light. Dedicated isolated DSH 0.2.1-rc.3 Host built from this branch. `reply.png` shows the actual Tob conversation after a Host restart, with the persisted `323 VERIFIED` reply from the official DeepSeek Flash route. The prompt did not contain the computed number. Canonical Channel history confirmed a Human message and a Bot-authored reply without `sessionFailure`; browser console reported zero issues.

The earlier Go attempt returned `429 Go usage limit exceeded`. A numeric `42` wait incorrectly matched that error, so it was rejected as proof. The test-only Bot was explicitly switched to official DeepSeek using the existing machine-local credential, leaving the shared default unchanged. An earlier driver attempt used the wrong Home input name; another was blocked by the first-run intro. Failures and observations remain in private local evidence.

This is compatibility evidence, not a before/after UI redesign or native Desktop screenshot. No product UI source changed. It does not qualify Desktop zoom, physical devices, external IM delivery or released npm tarballs. The dedicated Host was stopped, child absence checked and its port verified released; the disposable Profile was removed after exit. No private credentials or Profile data are included.

## Automated checks

- Plugin build, root and mobile typechecks, oxlint (existing warnings), source policy, CLI parity, feature map, preset sync, CI-plan checks, bilingual release ledgers and install-identity checks passed.
- Theme consolidation: 41 focused tests passed, including entry-specific refusal precedence and directory semantics. Both public converters produced byte-identical output trees and equal return values compared with the pre-refactor implementation.
- Focused upgrade checks: 41 tests passed; the subsequent version-matrix/theme/Go set passed 38 tests.
- Full suite: 9,438 passed, 27 skipped, 3 failed across 1,082 files. The source-policy test exceeded its 15-second deadline under concurrent load; docs release-surface build failed with ENOSPC; the untouched VRM daylight assertion returned 0.98736 instead of 1 in Asia/Tokyo.
- After heavy jobs exited, a serial UTC rerun of source-policy and outdoors passed all 13 tests. No production code or test timeout was changed to hide these results. The timezone-dependent outdoors assertion is outside this upgrade diff.
- A separate docs build overlapped the suite's internal Astro build in the same output directory and failed on a missing prerender chunk. The failed reproducible output was removed only after both builds exited. Once space recovered, the docs release-surface test (including its Astro build) passed serially in 36 seconds. The original full-suite result remains recorded above.

Native Desktop, device QA, source IM Provider requalification, published-package fresh-Profile installation and Human QA remain open. No merge, release, global CLI replacement or migration of an existing Human/shared Profile occurred.

## Forward admission follow-up

The subsequent Human-requested change removes exact runtime-label gates from development launch, source-profile installation and optional zoom setup/lease. Build pins and historical qualification versions remain evidence. DSH engines now admit `>=0.2.0-0`, including later prereleases; Host-provided native modules omit npm peers that would exclude unknown prerelease tuples. Theme source hashes and adapter protocol checks remain.

Real isolated launches of 0.2.0-rc.2, 0.2.1-rc.2 and 0.2.1-rc.3 passed authenticated plugin API checks using the same stopped task-owned Profile. Each Host exited and each port was released before the next version. The initial older-version install exposed patch line-number sensitivity; runtime patch generation now requires a unique matching request shape and uses its actual line location. These checks prove API startup and version transitions, not a new model reply or native zoom interaction. The earlier screenshot predates this follow-up; it is retained as the initial rc.3 model-reply evidence.

Follow-up automated validation: 112 compatibility/launcher/theme tests passed, 84 packaging/provider tests passed, and four source-installer admission cases passed. Build, root typecheck and lint passed (existing lint warnings). The IM Provider candidate is `.22` for changed install metadata; the published `.21` archive and registry integrity record are unchanged.

## Omission scan

The follow-up scan fixed six categories: verifier SDK equality/wrong-runtime reporting; artifact build-label equality; assuming Go adapter and CLI versions match; a missing optional IM import that could fail after Host startup; native QA release-label gates (including Windows stop/status); and stale current development/VRM docs. Historical released-package qualification remains historical.

The verifier now forwards `--dsh-version` and records the runtime path. A real `verify-app` launch/doctor on 0.2.0-rc.2 with an rc.3 workspace reported the actual version, matching launch record and authenticated API as healthy. The owned Host exited, no child processes remained and its port was released before Profile removal. Focused omission tests passed (123 tests initially; 107 in the final rerun including the optional IM summary assertion). Optional source IM transport and native Desktop interaction were not exercised by these checks.

## Edge-case follow-up

The Home-wide launcher lease prevents concurrent preparation and changes beneath a live Host. Dead launchers can release their recorded preparation lock; unknown cleanup keeps a blocking record. Failed verification waits for the Host and individually identified descendants, including descendants remaining in the detached Host's process group after early Host exit. Profiles and logs are retained. Windows legacy processes with unknown Home ownership fail closed; Windows native execution remains unqualified here.

Go adapter source containing the exact reviewed native Session-header repair skips patch installation. Unknown or ambiguous shapes still fail.

The prior CI test shard and npm prepare both failed the same `memory-restore-report` provenance fixture. Copying scripts into a disposable repository omitted `node_modules`; the verifier's new compatibility import requires `semver`, so Node exited before creating evidence. The fixture now links its dependencies, ignores that link for provenance, and asserts subprocess diagnostics before reading evidence. This is a fixture dependency failure, not a Memory runtime failure.

Focused regression: 103 tests across launcher, model patch, Memory provenance and verifier. Includes real child/grandchild termination and port rebinding, parent early exit, live/concurrent Home refusal, dead-launcher recovery, native-repaired Go source, termination-error refusal and unresolved-cleanup retention. Lint and formatting pass. No real model/native Desktop claims are added by these lifecycle tests.
