# Committed Markdown suffix: Android qualification for #2190

The original report showed a complete persisted reply while the phone stopped after the last table row. Delaying the committed entry and all subsequent downstream frames by eight seconds reproduces that symptom on the retained original APK. The final paragraph's native parent has size 835 x 65 while its React-managed text child has size 0 x 0.

The runtime fix already merged in #2203 preserves React's ownership of child measurement and layout. This PR adds a short-paragraph native regression, six transport-to-playback cases, two Android renderer cases, and the evidence below. It adds no runtime behavior.

## Matched native comparison

All phone cases use the same 4,504 UTF-16-unit synthetic reply, including 120 code lines, 40 table rows and `最后一段：REPLAY_COMPLETE。`, in a fresh DM. No real model is involved. Every accepted case independently rereads exactly one committed Bot reply and observes the actual phone without reopening after send.

| Build and case                                                                                    | Native suffix                                                                      | Canonical body                                           | Result |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| Standard fixed APK: normal, eight-second delay, completion-frame disconnect                       | Visible, screenshots inspected                                                     | 4,504 units, one reply per case                          | Pass   |
| Original APK: normal                                                                              | Visible                                                                            | 4,504 units, one reply per case                          | Pass   |
| Original APK: delayed-2 and delayed-3                                                             | Missing in four consecutive samples, approximately 25–54 s after send; child 0 x 0 | 4,504 units, one reply per case; delayed frames released | Fail   |
| Fixed native APK with byte-identical original JavaScript: matched-delayed-1 and matched-delayed-2 | Visible; child 835 x 65                                                            | 4,504 units, one reply per case                          | Pass   |

The original JavaScript bundle SHA-256 in both matched candidate runs is `4aa9ce7d33c6a3527e9836f20b5497a0561b800d6daeb024edb4f3a09c608170`. Original APK SHA-256: `b77dc749df0436c5dc43019b903565b4761f734ae8ff51fcac32f5457f125033`. Standard fixed APK SHA-256: `dcbc2f9ff034c7b2fc0a2345b06550482e389c1b630a2cdb9d117ce5566a4bf7`.

The Host was the retained isolated DSH 0.2.0-rc.2 fixture; mobile source dependencies are 0.2.1-rc.2. That mismatch remains part of the reproduced environment, not a claimed transport cause. Source tests run on main base `9a51bc602`.

## Decisive native observation

```text
Original, after the complete committed frame has been released:
  StreamRevealView: 0,11811–835,11876
    React text:    0,0–0,0

Same JavaScript, fixed native container:
  StreamRevealView: 0,11811–835,11876
    React text:    0,0–835,65
```

The new native test isolates a delayed short paragraph: mount text after a zero-height parent, apply React's 835 x 65 measurement/layout, then run the parent's measurement/layout pass. It must preserve the text's measured size and bounds. The existing long-text tests cover the same ownership contract. The new test fails against the original implementation (expected 835 x 65, observed 21 x 41 under Robolectric), then passes against the merged fix; all 12 native tests pass. The phone reproduces the more severe 0 x 0 child variant of the same ownership violation.

## Evidence and limits

`before-delayed-tail.png` is original-delayed-2 sample 0; `after-matched-native.png` is matched-delayed-1 sample 0. Both are real 1220 x 2712 light-theme phone captures, identically cropped to x=0, y=1050, width=1220, height=1350. Full private PNG/XML/native-tree snapshots, canonical rereads, producer timings and injection logs are retained locally. No device identifiers, login credentials or unrelated messages are included here.

The initial proxy attempt was rejected by the unchanged Host same-origin check because the proxy changed the Host header. It is a harness failure, not product evidence. Preserving the original Host header corrected the proxy. An early delayed trial's ending was contaminated by navigation to the next fixture; its final result is excluded. Both accepted original failures were repeated with strict conversation-identity checks and per-sample PNG/native evidence.

This establishes the cause for the reproduced symptom and qualifies #2203 against it. The historical one-off run did not retain its native child bounds, so retrospective identity is inferred from the matched symptom and controlled reproduction. It does not establish universal transport robustness, FPS, iOS behavior, or Human manual acceptance.

## Validation and restoration

The focused transport, renderer, window-layout and follow-latest suite passes all 21 tests; mobile type checking and repository lint pass. After the matched trials, the standard fixed APK was reinstalled and passed a fresh eight-second-delay run with one complete 4,504-unit reply and a visible final paragraph. No production code changes are included.
