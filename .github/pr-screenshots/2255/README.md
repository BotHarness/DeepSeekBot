# PR2255: Chats top search

The only bottom destinations are Chats, Activity and Settings. The existing Chats header owns conversation-name, online-message and retained-message results. There is no Search route or new page. Coverage and unimplemented-Cloud hints are removed. Empty results use a centered native state. Online and retained queries debounce for 150 ms; new input immediately invalidates stale retained results.

## Source and build

Production source: `28c7667083f6c7b0b9b428dd08198728175a84df`; merged base `1f399f12bee277a8e9aeaa02e86497bdfe151bbd`. Android16 POCO, arm64-v8a, Expo58/RN0.88.1 debug development build. New and installed certificates matched; every installation used `adb install -r`, preserving data. There was no uninstall or data reset.

The Chinese six-case matrix used source9398900a80dc, APK32efd45b. Final source28c7667083f6 changes only the empty-error retry accessibility identifier; its APK64ef15c6 was rechecked with Chinese empty state and the full English matrix. The final build source, full APK hashes and every capture are in [results.json](results.json). Search/cached-conversation behavior and visible layouts are unchanged by that identifier-only patch.

## Native results

- PASS: Chats top entry, three bottom tabs, one query returning both conversation and message results, real keyboard, source names, exact message30 highlight.
- PASS: English/Chinese x light/dark x font1/1.3/2: 12 cold offline runs. Every result opened the retained message; its body/highlight were visible; Back preserved the query and identical result bounds after dismissing the restored keyboard.
- PASS: offline short conversation from QA B had its single cached message and none of QA A's needle messages. Capture `b.png` is from18cf79d4b; the conversation component is unchanged in final source.
- PASS: revoking only QA B closed one stream, removed its results and cache, and kept QA A's cache. `revoke.png`.
- PASS: public `group-delete --confirm` on the one disposable QA A group deleted31 messages. Its search results and cache disappeared; the same query showed the centered empty state. Host group/timeline then refused `unknown-channel`/`not-found`.
- PASS: canonical timeline and read position stayed byte-identical during the final offline verification window.
- PASS: 121 focused tests in8 files; Android native module3/3; typecheck/lint/format. Applicable CI checks passed on production source28c7667083f6.
- UNTESTED: current iOS native UI, physical iPhone, accessibility and Human acceptance. The old iOS Batch46 remains historical and is not relabeled as a pass for this UI.

## Captures

`before.png`: former independent Search page, sourcea8b78a7750e8, English/light/font1. `entry.png`, `after.png`, `keyboard.png`: final Chats entry/native expanded results/real keyboard, English/light/font1, source28c7667083f6. Expanded Material search is a native window belonging to Chats, not a separate app route. `empty.png` and `empty-zh.png`: centered native no-results states, final build. A matched old Android empty-result capture was not retained; the prior-page capture documents the removed tab and hints, not a same-state empty comparison.

[Search -> exact result -> Back recording](back.mp4). Scrcpy capture was hidden, without audio or input control; all phone actions used explicit-device ADB.

Each matrix pair has a search image and a `-f` highlighted-message image. All unredacted hierarchy files, serials, device/Host identities, pairing material, private Profiles and logs stay machine-local. Public fixtures contain only synthetic QA text.

## Earlier failures and limits

Earlier candidates exposed cold-cache focus settling and a short retained viewport stuck behind loading. They were fixed and retested; failed local captures remain retained. A stale Windows Metro file index also caused a development bundle failure while new files were added; restarting the task-only server resolved it. The final log retains baseline dependency-cycle/deprecation warnings. No Release or frame-rate claim is made.

Earlier native cache-eviction/explicit-recovery proof used a941dcd0c4bc, before the new entry and final layout changes. Current controller/conversation regressions cover those contracts, but that older run is not claimed as a fresh native recovery pass. Full local mobile runs also had known Windows-locale assertions reproduced on main; final focused checks and CI passed.

## Restoration and handoff

Original six pairings were compared by exact identity and retained. Only QA2255/QA22552 were removed. Follow-system language, font1.0, night-no and the original PerfMain workspace were restored and visibly checked. Both task Hosts and Metro were stopped after authenticated doctor/port/Profile identity checks; shared CLI paths required the second identity check rather than a broad path-based kill. Private Profiles/evidence were kept. Only task USB reverse mappings were removed and the lease was released; Human Host39340 was excluded. See the redacted restoration facts in results.json.

The final return-position matrix used a single-hit query30 and additionally recorded the full2255 journey. A nonzero long-list search-return position was not separately rechecked in the current M3 path; earlier old-page scrolled proof remains historical. The original PR stays Draft pending its remaining native/Human acceptance; this follow-up does not relabel old iOS evidence.
