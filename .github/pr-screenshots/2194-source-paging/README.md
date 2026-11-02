# N1 Header / environment paging — UAT evidence

PR #2199 / issue #2194. Captured 2026-10-18 UTC through assigned shared Simulator Batch 30.

- Baseline: `da9ee46aaca938924a2a3057c9b46ff18bb06977`.
- Tested implementation: `14614a6ecf2e134cbc4c293e0b1c3e9dac5a2d07`.
- Installed iOS development binary: `494a20f1e`; compatible unchanged iOS runtime dependencies/config. JS-only test, no install/build. Later evidence-only commits do not change tested source.
- Simulator viewport: 402 × 874 pt; PNGs 1206 × 2622. English app launch, matched test fixtures, system light/dark, default content size `large`.
- Source CI: [39136877251](https://github.com/BotHarness/DeepSeekBot/actions/runs/39136877251) succeeded. Full mobile: 731 passed, 8 skipped. Native acceptance below is separate from CI.

## Evidence and scope

| Path                                                                 | Observed result                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `before-{light,dark}.png` / `after-{light,dark}.png`                 | Same final UAT data at baseline and implementation. Activity-style Header, local Computer alias, source tabs above unchanged search/create. Floating gear belongs to the development client.                                                                           |
| `environment-paging.mp4`                                             | Actual content swipes between Computer and authorized Organizations; stable source strip follows selected page. All is shown separately in final screenshots. No synthetic pager/state rendering.                                                                      |
| `empty-organization.png` / `guest-organization.png`                  | Empty member Organization remains selectable; same-name guest Organization exposes only its one invited channel.                                                                                                                                                       |
| `before-cloud-activity.png` / `after-cloud-activity.png`             | Same persisted Cloud scope and Other unread category: baseline showed Computer feed; implementation explicitly says unavailable and hides unrelated actions/count. Baseline scope was prepared via test fixture, then the actual Activity UI was opened.               |
| `after-intermediate-*.png` / `after-maximum-*.png`                   | Actual accessibility-medium and accessibility-extra-extra-extra-large in both themes. At maximum, long names truncate and existing search/list layout remains compressed. These are inspection captures, not full accessibility approval.                              |
| `maximum-selected-organization.png`                                  | Selected long Organization remains in view at maximum text; actual paging and vertical list scroll exercised.                                                                                                                                                          |
| `guest-send-proof.json`                                              | A uniquely marked guest-channel message sent via mobile UI committed once with the correct Human identity.                                                                                                                                                             |
| `computer-send-proof.json`                                           | A uniquely marked Computer message sent via mobile UI appears once in owning Host CLI readback.                                                                                                                                                                        |
| `cloud-offline-proof.json`                                           | Guest Cloud send committed once while only this task's Computer route was disconnected. Shared Host stayed running.                                                                                                                                                    |
| `restored-draft.mp4` / `restored-draft.png` / `reconnect-proof.json` | Following offline app restart and route reconnection, opening the Computer channel restores the unsent draft. Canonical history has zero draft sends, exactly one earlier explicit send. The recording shows the final reconnection/open path, not the entire restart. |
| `cleanup-host-proof.json`                                            | Only newly identified task pairing revoked; original device ID/status preserved.                                                                                                                                                                                       |

Native UAT used an independent test-user session prepared through the existing UAT driver (not a new Hosted AuthKit acceptance). Temporary guest grant removed and read back; 3 original member Organizations remained. Task session revoked, latest refresh rejected, prior sessions preserved. Original signed-out cloud vault, unpaired Hosts, Documents/preferences restored; appearance/text size restored, own Metro/proxy/driver stopped, shared QA checkout restored and lane released. Test messages remain as designated UAT evidence; no Prod changes or merge.

## First failures and limits

- At `7f7d153`, All clipped because the tab library measured normal text but overlaid selected bold text. `14614a6` uses equal bold metrics; final captures show the corrected label. `first-failure-all-clipped.png` is deliberately **not** final-head evidence.
- `baseline-settings-blank.png`: Settings opened blank at both baseline and candidate. Drawer navigation worked; Settings content is not qualified here.
- Cold launch while Computer is offline cannot repopulate its roster until reconnect. Draft persistence/reconnection and independent Cloud send passed; complete offline cached roster browsing is not claimed.
- A driver wait used a label selector for text exposed as a value and timed out; visible screenshot/AX text plus canonical readback independently confirmed draft restoration. No product failure was inferred from that wait.
- The existing creation/search controls have source regression coverage; no new native creation workflow was run in this slice. N2/N3 own their redesign.
- Only one active Computer was tested. Android native, physical iPhone, VoiceOver, Release/120 Hz behavior and Human QA remain unverified. Cloud Activity capability is deferred; this slice prevents unrelated Computer data from masquerading as Cloud Activity.
- HTML explainer is a review aid, not native evidence. Rendering CLI succeeded; local-file browser inspection was blocked by the browser URL policy and is not claimed.

## Review correction — Batch 32

Tested source `908f3935e072787479a5ed9fa929aba576a3a694` (main `907885c3` integrated), CI [39148076956](https://github.com/BotHarness/DeepSeekBot/actions/runs/39148076956) passed. Compatible installed iOS native baseline `494a20f1e`; no build or dependency changes.

Spec review found that different Organizations named “My workspace” had identical visible and accessible labels. Collision-only labels now show an Organization suffix and service hostname, with full identity in the accessibility label; keys/order/permissions are unchanged. Native taps and swipes reached the empty member Organization and the other channel-only guest Organization. `selection-proof.json` records independently checked canonical API channel sets: zero versus one, under the same verified UAT user. `same-name-organizations.mp4` records the actual paging. No messages sent in this rerun.

`collision-*.png` captures default/intermediate/maximum system text in light/dark at 402×874 pt. At a live maximum-text change, the strip initially retained its old offset (`collision-max-dark.png`); tapping the selected tab scrolled it fully into view (`collision-max-selected-dark.png`). Long hostnames truncate, while the distinguishing suffix remains visible. Full labels were inspected as accessibility metadata, not VoiceOver. The original send/draft/restart checks above were on source `14614a6`; these source paths did not change in the correction and were not replayed here.

Standards review: no actionable findings. Spec review: one P2 (ambiguous same-name Organization labels), fixed and revalidated. Full mobile suite after the source fix: **732 passed / 8 skipped**; integrated focused tests and typecheck passed. All required integrated-head CI passed.

Cleanup: only this run’s guest grant/session revoked; three preexisting member Organizations and prior WorkOS sessions preserved; latest test refresh rejected. Original cloud/Host state and app Documents/preferences restored byte-for-byte. Display settings and shared checkout restored; own driver/Metro stopped and lane released. Android, physical iPhone, VoiceOver and Human QA remain unverified. A local Metro IPv6/IPv4 mismatch and a premature identity probe were test setup failures, corrected without application changes.
