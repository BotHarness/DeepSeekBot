# Final merged-source iOS Simulator acceptance — #2837

Source and Host: `e2cee221af78e1c1a0d90395757c0cdd4c3a9d01` (merged PR #2813). These captures do not qualify later main commits.

Locally built Debug Simulator app `0.0.1 (1)`, iPhone 18 Pro Max, iOS 27, Chinese, 1320 × 2868. Native executable SHA-256: `d0b5331e8f35cc0361e0ca121ea51208a0fffd4cab0d2f1ff57a431abdd985a0`. Initial unsigned build could not persist pairing; final captures use the successful ad-hoc-signed build with real pairing. No production signing, release or cloud build.

All selected images are unchanged native pixels or exact decoded recording frames. Test names/content are synthetic; credentials, pairing screens and private computer names are excluded. Some early images retain the floating developer-tools control. File hashes are in [manifest.json](manifest.json). Raw recordings, action logs and canonical readbacks are retained in the local indexed task archive.

## Confirmed paths

- Send: normal at video 105.066667s, muted at 108.011667s (~3 seconds), explicit failure at 115.138333s, restored after retry at 134.643333s. No visible Sending caption. Canonical readback contains one matching message at revision 2. [Normal](send-normal.png), [muted](send-muted.png), [failure](send-failed.png), [recovered](send-restored.png).
- Draft retained across Settings foreground/return and changing conversations; another conversation did not inherit it. Input and Send remained reachable across three text sizes × two themes; an actual send at the largest size was confirmed by the Host. This does not establish every screen in the accessibility matrix.
- Empty and short histories load and show the composer: [empty](empty.png), [short](short.png).
- Long history entry: all 110 recording frames reviewed. Frame 105 at 4.965s still skeleton; frame 106 at 4.996667s first readable content already includes the final message after LATEST 120. No captured intermediate jump; frames 106–110 stable. This fixture uses Human messages, not rendered Bot Markdown. [Last skeleton](history-loading.png), [first readable](history-first.png).
- Home cold load: name-trailing native spinner and skeleton at 12s, correct uncached error copy at 24s, restored nine-row roster at 46s. The recorded action hit `chat-list-retry` before the task Host was resumed. Result is "Retry clicked, then list recovered when Host became available", not recovery caused by the click alone. [Loading](cold-loading.png), [error](cold-error.png), [restored](list-restored.png).
- Successful no-match search: [result](search.png).
- Normal Home → blank Bot creation: draft/details retained, pre-acceptance request failure survived backgrounding, recovery restored name/persona, successful resubmission created exactly one Bot and automatically opened its ordinary DM. This does not qualify an accepted creation whose response is lost. [Created DM](created.png).

- Model settings remain reachable from the real Home → DM → Bot details path, without changing configuration: [model settings](model-entry.png). This is not successful model recovery from missing credentials.

- Chat connection Retry was separately clicked while the task Host remained paused; the Host was then resumed and the chat reconnected. The first raced tap was discarded.

- Creation Back: fill a name, inspect the selected environment, return to Home, reopen blank creation; the unsubmitted name is retained. [Returned form](create-back.png).

## Limits retained for follow-up

Text categories are `large`, `extra-extra-extra-large`, and `accessibility-extra-extra-extra-large`. Maximum-size title truncates visually while AX retains the complete name. Live appearance switching temporarily left keyboard/status-bar appearance inconsistent: the transition captures are evidence of that limitation, not a blanket dark-mode pass. After refocusing, a [stable maximum-text dark capture](text-max-dark-stable.png) confirms a dark keyboard and white status-bar text; the transient mismatch did not persist. The visible technical error is the real test-provider quota refusal. [Intermediate dark](text-mid-dark.png), [maximum light](text-max-light.png), [maximum dark transition](text-max-dark.png).

A global test-Host pause interrupted the encrypted stream before a distinct older-page failure was established; connection retry is not substituted for history retry. Selectively delayed media and accepted-response-loss recovery need a suitable external fault harness. A real normal-flow request for Markdown was committed, but the existing test model returned QUOTA/429; no credentials were changed or retries used to evade the quota. Android, physical devices, real VoiceOver/TalkBack speech and Human acceptance remain separate. Consult #2837 for the final per-case matrix and any later evidence.

Task: `codex/local/01a173e4-538f-7f31-a9a2-af6e1a7305a9`.
