# Workspace request approval — #2080 slice 1

Real isolated DSH Hosts, Windows, 1440 × 1100, English, dark theme. All conversations and directories are synthetic QA fixtures. No login URL, credential, private Profile data or unrelated conversation is included.

- `before.png`: pending request on untouched main `ad12b096b116c616811d71ffd0adf2dcca458038`. Human authorization reproduced a read-only Grant (`false`, revision `0`). The adjacent #2290 main update does not change this Workspace path.
- `after.png`: the same two-file task shape before approval on clean runtime `18ad131d598f876478470b7858c5310f6c4eec44`, based on main `87340ee0eb3edd7bd1a2438b992a44af54048931`; the action explicitly promises folder read/write.
- `completed.png`: the request resolves, a canonical read/write confirmation appears and the Bot commits its completion reply. Canonical readback and real tool traces separately verify both native files, a completed Assignment, handled original task and stable duplicate approval.

Bot names, temporary directory suffixes and markers differ between isolated runs. The viewport, theme, locale and requested two-file behavior match. The screenshot is UI evidence; `proof.json` records the bounded persistence/execution result. Human QA remains pending.
