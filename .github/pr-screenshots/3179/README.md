# iOS 27 missing-group repair

440 × 956 pt iPhone 18 Pro Max Simulator, Chinese, system text size `large`, light/dark. Before: #3179 d70501441097 after remote disband. After: the same flow with terminal-state repair. Native shell 7e0dbe1def2e, RN0.88.1 Release, fresh bundled JS; no native-input changes.

Synthetic dedicated groups have the same display names; distinct IDs per run. Before images show loading skeleton and raw ID; after images retain the group name with no skeleton. Dark pair includes typed draft and disabled Send. Light pair has an empty draft. No screenshot edits.

PASS: actual open group → Host CLI disband → old content clears, original title remains, no skeleton, typed-draft Send disabled, return removes group from list; both themes. CLI confirms deleted=true/messages=1 for each.

Focused screen/hook tests60PASS; same new regressions against pre-repair screen2FAIL/1PASS. Mobile types and touched formatting pass. Complete local mobile run did not finish (one parallel home-search assertion failed; isolated repeat39PASS); do not report full suite PASS. CI is separate.

Offline/reconnect, retained-offscreen, en/font matrix, Android, physical Release performance and Human acceptance of #3179 remain UNTESTED. Simulator proof does not qualify those cases.
