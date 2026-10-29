# #3170 iOS27 Simulator acceptance

Base main: `64df18786d2e38d04ad9032ab007648b07c76053`. Repair: `229309db02782692950d4149ebeafbc6e1690876`.

Fresh signed Release Simulator build, iPhone18ProMax, iOS27.0, 440×956pt. Native and bundled JS initially both main64df. Repair incremental bundle built from the identical one-line diff before committing229309; binary and bundle hashes in manifest. No Metro, phone, LAN or Serve changes.

## Results

- PASS: actually disconnected test transport; cached chat visible offline; Host disband while disconnected; reconnect clears messages, retains name and shows missing-channel notice, without loading skeleton. Relaunch does not restore group.
- PASS: long-press context menu and profile Settings each open confirmation, Cancel keeps group/messages; each entry actually disbanded a separate disposable group; canonical Host list removed it.
- PASS: final Host group count0; app relaunch shows empty Chats.
- FAIL → FIXED: iOS glass destructive button inherited blue accent. Explicit danger tint keeps native destructive role. Light/dark English/Chinese and all3 text sizes retested.
- PASS:228 focused tests;1 skipped; mobile typecheck, lint, changelog validation.
- UNTESTED: physical iPhone, VoiceOver gestures, iOS18 fallback, store build. Android is owned by Windows and has a separate issue outcome, not this report.

## Appearance matrix

Default=`large`, intermediate=`accessibility-medium`, maximum=`accessibility-extra-extra-extra-large`. App locale changed through Settings; OS appearance/text size changed through simctl. Max native menus and long English warnings scroll; all actions and full warnings remain reachable. A scroll viewport clipping content outside its bounds is expected, not text truncation.

| Locale | Theme | OS text category                      | Entry                  | Result |
| ------ | ----- | ------------------------------------- | ---------------------- | ------ |
| en     | light | large                                 | Chats context menu     | PASS   |
| en     | light | large                                 | Group profile Settings | PASS   |
| en     | light | accessibility-medium                  | Chats context menu     | PASS   |
| en     | light | accessibility-medium                  | Group profile Settings | PASS   |
| en     | light | accessibility-extra-extra-extra-large | Chats context menu     | PASS   |
| en     | light | accessibility-extra-extra-extra-large | Group profile Settings | PASS   |
| en     | dark  | large                                 | Chats context menu     | PASS   |
| en     | dark  | large                                 | Group profile Settings | PASS   |
| en     | dark  | accessibility-medium                  | Chats context menu     | PASS   |
| en     | dark  | accessibility-medium                  | Group profile Settings | PASS   |
| en     | dark  | accessibility-extra-extra-extra-large | Chats context menu     | PASS   |
| en     | dark  | accessibility-extra-extra-extra-large | Group profile Settings | PASS   |
| zh     | light | large                                 | Chats context menu     | PASS   |
| zh     | light | large                                 | Group profile Settings | PASS   |
| zh     | light | accessibility-medium                  | Chats context menu     | PASS   |
| zh     | light | accessibility-medium                  | Group profile Settings | PASS   |
| zh     | light | accessibility-extra-extra-extra-large | Chats context menu     | PASS   |
| zh     | light | accessibility-extra-extra-extra-large | Group profile Settings | PASS   |
| zh     | dark  | large                                 | Chats context menu     | PASS   |
| zh     | dark  | large                                 | Group profile Settings | PASS   |
| zh     | dark  | accessibility-medium                  | Chats context menu     | PASS   |
| zh     | dark  | accessibility-medium                  | Group profile Settings | PASS   |
| zh     | dark  | accessibility-extra-extra-extra-large | Chats context menu     | PASS   |
| zh     | dark  | accessibility-extra-extra-extra-large | Group profile Settings | PASS   |

## Evidence

Selected screenshots in this directory are original native captures with synthetic content, inspected for publication. Local paths, pairing state and unrelated settings captures are not published.

All three disposable groups and the temporary pairing were removed; active devices and pending requests are both zero. Original pairings preserved; system language, light appearance and default text size restored. Owned services and driver stopped; Simulator shut down. Shared services unchanged. Original evidence retained privately.
