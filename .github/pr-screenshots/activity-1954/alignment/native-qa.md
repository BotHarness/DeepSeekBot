# Native search alignment — 2026-10-16

- Before source: `df40659ff1e2d0f3ce3f2834cb88d09ee1a029ca` (PR head e46d507aa added evidence only).
- After source: `a24cc09457a6c156656f273c71a4c26390240c40`; equivalent local QA source `4cd840a1b`.
- Same iOS 26 Simulator and installed compatible Batch 6 binary, portrait 402 × 874, default text size, task-owned empty authenticated Host. Query `needle` has no results in this fresh Host. Four unedited native images; no crop or image manipulation.

The reported mismatch exists in the original image, not GitHub scaling. At the dark search field’s horizontal center (y=84), the original glass outline spans x=4…385 in a 402-pixel image: left gutter 4, right gutter 16. The final outline spans x=16…385: both gutters 16. Light appearance was also visually inspected. The native shared glass background extends beyond its custom content; the width reserves that allowance and both outer gutters. Native glass and the single native clear control remain.

Final-source mobile typecheck and 21 focused Activity/style tests passed. Repository lint/policies, changelog and formatting passed. Previous full mobile suite (434 passed / 8 skipped) belongs to the preceding search-section source; it was not rerun for this width-only fix. Both source-review axes found no new actionable findings.

Run limitations: initial developer-client load timed out, then succeeded on reload. During final cleanup, a clear-query request returned Host 400 while the machine also reported disk exhaustion; causality is not established, and this run does not claim a new end-to-end clear-query acceptance. The clear control emptied the text; earlier successful clear behavior is documented in preceding reports. A redirected source-check attempt was interrupted by disk exhaustion; final typecheck, focused tests and lint were rerun successfully without that redirection. No request was approved or answered.

Only iOS 26 portrait geometry was checked here. Earlier developer-reload status-bar limitation, Android/physical-device/accessibility/landscape and latest-main integration limits remain. No native rebuild, merge or release. Device cleanup is recorded in the PR QA comment.
