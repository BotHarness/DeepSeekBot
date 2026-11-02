# Profile Backup evidence

- `report.png`: user-supplied #2790 screenshot, reported Tobs 1.5.2 / DSH 0.2.1-rc.3; exact source SHA unknown; 1280 × 828, Chinese/dark. Export refusal appeared below Import.
- `after-zh.png`: real restored DSH 0.2.1-rc.3 Web Host, Chinese/dark, 1440 × 1050. Successful download followed by deliberately damaged-file inspection. The error stays under Import; Keeper remains cold.
- `after-en.png`: the same journey in English/light, 1440 × 1050.

Candidate runtime source: `51565eb95301d271570d7053b2cc56fad6fba7d7`; captured 2026-10-26 (Asia/Tokyo). Synthetic data only; images inspected and copied unchanged. Expected HTTP 400 for damaged-file inspection; no other console errors in the final two candidate drives.

The report is a symptom reference, **not** an exact-base matched before/after capture. Packaged Desktop and same-viewport baseline reproduction remain pending under #2794. Earlier browser attempts encountered native Session-reference failures and onboarding interference; these were preserved locally, not presented as passing evidence. Reproduce from Bot settings → Data & privacy → Manage backups; preview/download, inspect the result, then inspect a deliberately damaged file.

Historical v1 → real rc.2 → real rc.3 restoration also preserved identity, Memory, attachment bytes, history, purge facts and cold state through public CLI readback. Host rc.2 / resolved tools rc.3 provenance was verified separately. This does not qualify all future DSH releases.

## Simplified UI

`simple-en.png` and `simple-zh.png`: English/light and Chinese/dark, 1440 × 1050, source `9f03fd35085826b9cab406185d2761c95488d727`, captured 2026-10-26. Same isolated restored rc.3 Profile and damaged-file inspection state as the preceding UI references. `preview-zh.png` shows the three-column export summary. Images are unchanged and publication is explicitly authorized by the user.

English journey passed; Chinese retry passed. The first Host launch timed out and the first Chinese export was refused; those failures are retained locally and the refusal is not explained by the successful retry. Successful journeys had only the expected HTTP 400 for deliberate damaged-file inspection. These captures do not replace packaged Desktop or Human QA.
