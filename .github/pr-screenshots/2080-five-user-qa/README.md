# Live Chrome QA — partial, not accepted

2026-10-20, Windows Chrome via the standard Codex extension, default browser viewport (1559px wide; captures are 866–920px tall), Chinese, dark theme. Isolated DSH 0.2.1-rc.2, real OpenCode Go / DeepSeek V4.1 Flash key. Runtime source c1f31e530c9f5cabac96290a3a8707a2c9891155 (production-identical to 7a8edf51b22ffe275d377bc212d94f040432c9c7). These captures precede the recovery/copy fixes shipped alongside this record.

## Captured actions

- 01: first-time homepage instruction uses the obsolete label “仅批准这一次”.
- 02: real model requested creation of QA impatient 2080; actual action is “允许这次”.
- 05: after Allow once, the Bot exists and onboarding advances from 1/5 to 2/5.
- 06: actual native pwsh approval, with three actions and same-tool/current-scope explanation.
- 07: after Allow once, history shows allowed and the model reports completion. The stdout marker is below this viewport; this image alone is not output proof. The visible accessibility tree contained QA_ONCE_2080_A. A subsequent changed-input request is canonically pending, but its screenshot was not captured.

No DOM, product state, screenshot content or tool result was fabricated. Images contain only synthetic QA conversations. No credential is embedded.

## Five-persona limits

Five subagents participated in planning and independent evidence/source review. Their separate Chrome connections failed; the parent serialized the actual browser drive. This is **not five independently completed user journeys**. Three reviewers independently noticed the same onboarding mismatch in the supplied screenshots; that is reviewer agreement, not three distinct users hitting the bug. One parent-driven journey reached creation and first approved terminal success. A frequency ranking across five completed users is unavailable.

The mobile and breaker reviews additionally reproduced unavailable-as-expired and absent submitting text with component tests. These are automated component findings, not slow-3G or browser fault-injection evidence. Full Access wording was checked against its existing permission-snapshot code, not a new live settings capture.

## Blocked follow-up

The browser connection first timed out, then Chrome disappeared from the supported browser inventory even after the Human brought its tab forward. No alternative browser-control mechanism was used. Host doctor remained healthy. Client diagnostics also recorded an unclassified exception and shell-lost/remounted events: the browser console must be inspected after reconnection before declaring the Client clean.

Still required: corrected-copy screenshots; one-click Always allow and changed-input success in the latest build; revoke/reject/Full Access browser cases; real 375px and slow-3G checks; junk/back/double-click browser case; five-persona rerun and final frequency ranking. Existing earlier qualified evidence remains historical. CI success does not satisfy this browser gate. PR remains draft; do not merge.

## Edge continuation (2026-10-20)

The Human authorized the local Edge fallback. Captures 08–10 use its default 1994 × 1178 viewport. 08 shows the pending three-action card; 09 shows saved permission and the real B output; 10 shows the changed-input C request and reply without another card. The parent activated Always allow by keyboard after an unsuccessful mouse attempt. No second confirmation was presented. The sanitized [native proof](edge-proof.json) records three successful pwsh calls and only two Human decisions, with one active current-tool rule. Only harmless output commands were used.

These frames continue the old ax2080-copy Host, launched from c1f31e530. The shared Client was rebuilt during this run; these images therefore do not qualify the recovery fixes at an exact source revision. They prove the ordinary remembered-tool flow and preserve the actual A/B/C outputs. A fresh 35d2838bb Host on 7093 is being tested separately. The five-persona and after-fix gates above remain open.
