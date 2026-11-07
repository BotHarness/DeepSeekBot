# GenUI T1 verification matrix

Use this matrix for #3685. A passing parser, unit test or publication RPC is not evidence that a report renders or that an interaction works in the Web Client. Test through the existing canonical publication, private-view and ordinary Human-message owners.

## Run the Web journey

Launch and authenticate a task-owned Host using `verify-app` and the verification resource cleanup runbook. Use a synthetic Bot and no customer data. Then run:

```bash
BH_E2E_INSTANCE=.humanlayer/verify/<name>/instance.json \
  node scripts/e2e-genui-reports.mjs \
  --bot <synthetic-bot-slug> --out <private-evidence-directory>
```

The browser is headed by default. `--with-model` additionally requires a configured test Bot and an actual explicitly published model reply; the default does not qualify model behavior. The runner publishes synthetic messages and ordinary Human submissions to the designated test DM. It closes its own browser in `finally`; the caller owns Host cleanup. Retain failed runs and diagnose them before rerunning with a fresh evidence directory.

## Scene coverage

| Scene                     | Visible evidence                                                                    | Canonical or automated check                               |
| ------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Catalog composition       | Metric, table and bar-chart in an ordinary message after its summary                | Complete bounded report published by the real direct Tool  |
| Each component alone      | Metric-only without an unwanted table; table-only; chart-only with equivalent table | Expected component presence and absence                    |
| Filter and no matches     | Matching row; readable empty state                                                  | Exploration does not append Channel messages               |
| Numeric sorting           | Numeric order, not lexical order                                                    | First visible row                                          |
| Details and selection     | Expanded details, checked rows and selection count                                  | Stable row IDs in private state                            |
| Keyboard                  | Space toggles the focused checkbox                                                  | Host recovers the selected ID                              |
| Another authorized Client | Same saved view on the same Host                                                    | Exact report and CAS version                               |
| Concurrent edits          | Stale Client retains its own draft and shows conflict                               | No silent overwrite; explicit keep/load/save               |
| Reset                     | Filter, selection and other view controls return to defaults                        | Host state matches the reset                               |
| Continue                  | Ordinary visible Human message, then optional real model reply                      | Exact report/snapshot/selection and canonical Source Event |
| Refresh                   | New linked report, old report retained                                              | Fresh snapshot identity and predecessor message            |
| Empty and signed data     | Zero rows; negative/zero/positive/decimal bars around zero                          | Equivalent readable data and bounded bar geometry          |
| Escaped text              | Literal markup in a metric, never executable content                                | Text rendered by trusted React components                  |
| Maximum dataset           | 100 rows, 8 columns and 20 selected rows                                            | Further unchecked rows disabled; no truncation             |
| Presentation              | Wide/narrow Web, actual light/dark theme                                            | Viewport/theme recorded per capture                        |

The three T1 catalog components are metric, table and bar-chart. Approval, Question and private-input cards retain their existing owners; they are not GenUI catalog components. Catalog expansion requires extending this matrix and the runnable journey in the same change.

## Separate remaining gates

Record pass, fail or untested for every layer, never a blanket end-to-end claim:

- Focused automated coverage: malformed/oversized/versioned reports, forged selections, publication failures, idempotent retries, dirty-draft remounts, access loss and canonical Content Purge.
- Additional real Web fault journeys: failed saves, uncertain-response retry, access revocation and purge while a report is open. Unit coverage does not qualify these browser scenes.
- Accessibility: keyboard selection is narrow evidence, not full keyboard navigation, screen-reader or large-text acceptance.
- Performance: matched base/candidate ordinary-history journeys plus separately budgeted added report work, at least three interleaved runs, foreground scrolling and zero jumps/gaps. Timing under shared machine load is not qualification.
- Dynamic-height recovery: `packages/client/test/timeline-window-recovery.test.tsx` reproduces the all-gap window after cached geometry becomes stale. The existing timeline owner retains a measurable edge group so later measurements can recover. This correctness guard is not frame-pacing or performance qualification.
- Desktop shell, installed iOS, installed Android and Human acceptance remain separate. An 800-pixel Web viewport does not qualify a mobile application.

## PR evidence

Keep PNG originals, ARIA observations and the manifest under the task's private evidence directory, with an index in the machine's main checkout. Preserve source SHA plus dirty diff identity, built Host/Client hashes, browser identity, fixtures, canonical references, capture times, viewport and theme. Bind any pre-commit capture to the final source only after verifying production source and bundle identities have not changed.

Inspect every selected image for secrets, login URLs, private content and misleading clipping. Retain failed attempts separately. Publish only reviewed derivatives through the repository's R2 evidence publisher with the full frozen source commit; never commit screenshots or use a Git evidence branch. Verify public readback, retain upload receipts and put representative images plus a complete scene index in the PR Change outline. Verify GitHub-rendered images after writing the PR. An absence state captured in the candidate is labelled as such, not passed off as an older source build.
