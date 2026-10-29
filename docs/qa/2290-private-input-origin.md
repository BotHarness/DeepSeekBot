# Private-input origin qualification for #2290

The controlled reproduction covers a local Human DM with two currently accepted synthetic IM requests arriving while a native `secret_cli` approval is pending. It does not identify every condition in the original intermittent report.

- Starting main: `b0e35529c7197402e79820d2ca737b392caec9ff`.
- Candidate implementation: `7f4aaadd7a5de33a6210a008196bdd09e54cc067`.
- Integrated current main: `33334b22cb7d9e79f667b171d089c71df2dc572a`; clean native replay after the integrated build at `2c1c9142c3bf8eb7831302ec03d910ab90c4851c`, with no browser console issues.
- Runtime: the repository-pinned DSH `0.2.1-rc.2`, isolated Profiles, synthetic private accounts and a controlled in-process IM Provider.
- Operation: installed `gh --version`, with a synthetic `GH_TOKEN` supplied only through native private-account references; no GitHub API request or global authentication change.

| Observation                        | Starting main Runtime                                                        | Candidate Runtime                               |
| ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Accepted concurrent IM sources     | 2, both explicit source leases current                                       | 2, both explicit source leases current          |
| Automatic origin                   | Refuses with `Select one live accepted IM source_event_id for private input` | Local Human interaction                         |
| Human decision                     | Allow once                                                                   | Allow once                                      |
| Actual approved native Tool result | Original source-selection error                                              | `command-v1`, `successful: true`, `exitCode: 0` |
| Committed Bot reply                | Refusal                                                                      | Success and exit code                           |

The cropped screenshots and allowlisted result report live under [the PR evidence directory](../../.github/pr-screenshots/2290-private-input-origin/). Native Session snapshots, launch metadata, full accessibility trees and raw local logs are deliberately excluded from the public artifacts.

## Automated coverage

Nine new cross-module cases use real canonical Source Event/Admission flows, the Runtime, PrivateInputs, the native local Credentials Provider and the approval broker. They cover pure local DM, one/two IM steering inputs, queued IM batch collection, local Group interaction, local steering into an IM turn, explicit source selection, same-account ambiguity, source revocation, unaccepted local history and later scheduled reuse. Existing private-input tests retain expiry, account replacement/revocation and active-use cancellation checks.

Passed checks:

- Four focused core files: 53 tests.
- Seven origin/continuation/schedule/approval/command files: 56 tests, overlapping the first run's origin cases.
- Six docs/CI-plan/verification/source-policy files: 66 tests.
- Repository lint, changelog checks, root TypeScript check, source build and touched-file formatting. After current-main integration, lint, TypeScript, full build and 28 origin/native-continuation/inventory tests passed again.
- Synchronized docs site build, including slides and 606 generated pages. Chinese OG font regenerated after content synchronization; final font bytes equal the starting main bytes.

## Environment observations and limits

The ordinary Windows build initially emitted Node imports from `vfile` into the Client. Normalizing importer paths for this task's Client build selected the existing browser modules. That temporary build adaptation is not part of this fix. The machine's saved Go model selection was absent from the newer pinned catalog, so the task-local launcher used the existing developer DeepSeek fallback without changing shared model configuration. The docs build needed a task-local Node/Corepack invocation for its Windows `pnpm` child process. These environment adaptations do not change private-account authority.

Interrupted and pre-fixture QA attempts were not accepted as feature proof. The final qualification uses a fresh isolated Profile; a separate clean replay verifies saved-account reuse. Synthetic event IDs include a per-launch nonce to prevent replay collisions. The base and candidate native results are checked by the approved call ID, rather than by model-authored success text alone.

This does not qualify real Lark/Discord rendering, GitHub API permissions, production deployment, or every protected consumer independently. The shared consumption boundary is covered by regression tests; Human QA and merge remain pending. Follow [the feature journey](../../.agents/skills/verify-deepseekbot/features/private-input-origin.md) to repeat the isolated check.
