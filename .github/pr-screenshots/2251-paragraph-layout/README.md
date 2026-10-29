# Android paragraph layout evidence (#2251 / #2252)

Real captures from the same Android 16 phone (1220 × 2712), standard minified arm64 Release. No images are generated or composited. Captures contain only dedicated QA conversations; device identifiers, tokens, private Host metadata and raw accessibility trees are excluded.

## Package identity

- A: main baseline `d6775e6ad119e52ddab2bc19b46b22cb94ed5936`, APK `1856E2D9ECD9A5EB43CBB7AFAB1C573D77A4F714EF41107EEE897737C5914CC8`.
- B: one-property simple-line-breaking implementation `c73f9850f38f9714713675697b3f0fb3743fbe1f`, APK `BDADF188E9EDBCAF018DBBE137AACC0418EEC4713266BFBAE8D97DB6E8E81A84`. The following comment-removal commit changes no runtime behavior.
- Integration: `9d2a2401d15e7379fa887ec63c7afef7483a44b8`, APK `96FD3C026699C0B7EBB2A22BB6D26A308E148F7C1CEC573E34E4F2AD45A9ACCE`. Includes main `1270c97cb8a9ba78350d6fa6d65531a9f19d8f71`; no original matched number is relabeled as an integration measurement.

## Reading the evidence

Completion and matched visual captures below are present and inspected. Integration outcomes are recorded in the full report.

`completion-{plain,prose}-{1-a,2-b,3-b,4-a,5-a,6-b}-{negative,positive}.png` are all independent timing boundaries. Negative means the final suffix is not yet present; positive means the full plain marker or section-100 final list is visible. These were naturally reached without reopening. Compare the intervals in the JSON, not capture file creation times. Screenshot and OCR overhead applies to both arms.

`visual-{a,b}-{10,13,20}-{light,dark}-active.png` are six matched font/theme pairs (font scale 1.0, 1.3, 2.0). The same 20,880-unit English/Chinese paragraph pauses at the same source position. Active captures are 20 seconds into a 45-second provider pause, with zero committed Bot replies. They exercise long English words, combining accents, CJK punctuation, bold text, links, entities and a family grapheme. Specific line endings can change under the new policy; both arms retain native wrapping and scaling. The differing generated Bot avatar/name identifies a disposable run and is not the feature under comparison.

Candidate 1.0/light and 2.0/light use `-retry` filenames after retained CLI transport failures. The 2.0/dark final capture was recovered serially after overlapping accessibility tools interrupted its first dump; the original active capture is unchanged.

`visual-*-end.png` show the final body after reopening, paired with private full accessibility-tree and canonical-body checks. These semantic checks do **not** establish natural completion timing; the separate completion series does.

Integration captures and the interaction outcomes are described in the [full report](../../../docs/research/2251-android-paragraph-layout.md). The [sanitized per-run data](../../../docs/research/data/2251-android-paragraph-layout.json) records all retained measurements and package hashes. Raw traces, XML and local process logs stay private.

No 120-FPS qualification, iOS runtime verification, history-fling performance, peak-memory, power or sustained-temperature claim is made. The phone used a private loopback-only QA network allowance equally in all installed QA packages; it is absent from committed app configuration.
