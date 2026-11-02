# Organization access loss — Batch44 / PR #2250

## Freeze

- Source: `5412cbd1701de7890287fd4cde9ab7521c30c65f`; base `c124687079368a4156de00c3edc016bb7c50cad2`.
- Source CI: [39164287814](https://github.com/BotHarness/DeepSeekBot/actions/runs/39164287814), all applicable checks passed.
- Assigned BotHarness e2e iOS 26 Simulator, 402 × 874, English, default text size, light/dark. Existing native build `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; JS-only candidate, no package/app configuration change requiring a rebuild.
- 47 focused component/CloudClient tests and mobile typecheck passed. Two component regressions were observed failing before the fix and passing afterward. Source policy, focused lint/format, ledger and diff checks passed independently of native evidence.

## Actual UAT path

1. Two independent, real synthetic sessions, each verified against JWT signature and authenticated identity. Owner and recipient were distinct; recipient had no existing target membership at any status.
2. Owner used the mobile UI to create one organization invitation. Recipient used actual Review/Join, arriving at the organization with its two existing channels visible. Both channels opened successfully; no message was sent.
3. Immediately revalidated the exact newly created membership's user, organization, member role, non-directory status and absence from the original baseline, then removed only that membership.
4. Recipient `/api/me` remained 200; organization access/list and both individual channel reads returned 403. All original memberships, statuses, roles and guest lists matched the baseline.
5. Actual **Reload channels** removed old rows, named open buttons and pagination. A second reload remained denied. `denied-list-light.png` / `denied-list-dark.png` show this state.
6. Both previously visited channel URLs were opened through the native URL handler. Stable views displayed `ORGANIZATION_ACCESS_DENIED`, without channel names, history, composer or pagination. The generic **Open channel** retry remains on a deep-link screen; tapping it was also denied. Back returned to Cloud services without restoring protected content. `denied-old-route-light.png` / `denied-second-route-dark.png` show route denial.

`authorized-*` images show the authorized state on this same candidate, not a build-before comparison. Prior Batch42 failure is separately pinned in the PR at source `132b33e3c9965fcb5a01066a134f2744269b2d75`: stale rows remained under the denial there. That historical image was not recaptured at this PR's exact base: the assigned Batch44 device/fixture lease covered the candidate and one invitation/membership lifecycle, not a second baseline run. Exact-base matched native recapture remains unqualified; the historical reproduction and failing-before/passing-after component tests are separate evidence.

## Scope and limitations

This verifies cleanup after an observed authorization denial, not instantaneous server-pushed revocation or a zero-frame offline-cache guarantee. Both native channels were empty; populated history and late hydration rejection are covered by component regressions. Test session setup does not qualify Hosted AuthKit/PKCE. Intermediate/maximum text sizes were not rerun in this default-size authorization-lifecycle window; no typography/layout code changed. Android and physical-iOS verification require separate device assignments. These matrix items and screen-reader testing remain explicitly unqualified in #2186. No physical device, Android native, VoiceOver/TalkBack, external delivery, new organization/channel, model call, Host change, deployment, Prod or merge.

## Driver observations

- Workspace button's accessible name contained a colon; the initial expected label did not match. Retained failure, inspected the real snapshot, then used the observed label; no callback simulation.
- The initial invitation list baseline omitted an old accepted audit record; after issuance, it returned that record plus the new pending invitation. The old ID and organization were independently matched to the retained Batch42 provider record. It was preserved; only the one new pending invitation was followed. No duplicate invitation was sent. This does not qualify list completeness or pagination.
- Agent Device used its XCTest fallback after detecting a lingering system-surface host; snapshots reflected app content. No browser authentication or credential screens were recorded.

## Restoration and lane release

Only the new member was removed; the new accepted invitation audit record remains. Existing accepted audit records and original member roles/statuses remained intact. Both own sessions were signed out through the UI, verified inactive, and their latest refresh tokens rejected; every previously active session remained active. Revoked own token files were removed privately.

Original cloud vault, pending invitation, Hosts, stopped app Documents/Preferences and cloud-message-cache bytes/absence were restored. Only newly created cache files positively identified by the frozen channel IDs were eligible for cleanup. Display settings restored; clipboard unchanged. Own driver and Metro stopped; port 8091 free; shared checkout restored to `qa/batch-24` / `648c1202c44f5a5e82ce22596682934745705cef` with its original three untracked documents. Coordinator and TOB notified; Batch44 explicitly released before publication.

Issue #2186 remains open for its other acceptance items. This manifest records the pre-merge Batch44 result; subsequent review, CI and merge status live on PR #2250.
