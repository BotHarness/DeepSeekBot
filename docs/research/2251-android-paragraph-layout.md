# Android paragraph line-breaking cost (#2251)

Matched physical Android Release trials show less native paragraph layout work and shorter late-stream presentation gaps with native simple line breaking. This changes line endings; it does not eliminate whole-text layout or qualify 120 FPS.

## Cause and bounded change

Latest-main baseline `d6775e6ad119e52ddab2bc19b46b22cb94ed5936` includes the viewport drawing optimization from #2233. Two fresh baseline runs reproduce the remaining layout cost. A roughly 19,000-unit paragraph receives about 600 text updates; the trace contains about 600 native measurement layouts on `mqt_v_js` and 600 display layouts on the main thread. In one baseline, mean measurement layout grows from 9.84 ms early to 32.80 ms late; display layout grows from 8.33 to 30.22 ms.

Installed React Native 0.88 `TextLayoutManager` builds a StaticLayout for text measurement. `ReactTextView` subsequently sets the complete styled text, and Android constructs its display layout. React Native defaults to `highQuality`, which Android documents as optimizing line breaks across the whole paragraph. The measured one-variable change sets `textBreakStrategy="simple"` on the existing MarkdownText paragraph Text. Both measurement and display layout use the new native strategy. Layout-call counts remain about the same: the optimization reduces cost per layout, not the number of updates. The evidence does not establish that identical-text duplicate commits are absent.

The same strategy applies while streaming and after completion, including headings, quotes and list-item text using this branch. Native text/spans, scaling, graphemes, reveal cadence, accessibility and interaction handlers retain their owners. There is no manual paragraph splitting, new cache, Host change or native-module patch. Code blocks, tables and enriched-markdown fallback retain their previous paths. Memory previews provide `renderInlineBlock` and return before this Text branch. The property is Android-only.

**Trade-off:** simple line breaking does not optimize paragraph-wide line quality. Words and punctuation still use Android's native rules, but specific line endings can differ. Completing a reply does not switch the policy back. This is a JavaScript-only property change; native dependency inputs are unchanged.

## Matched protocol and provenance

Same physical Android 16 phone, 1220 × 2712, actual 120 Hz, normal thermal state. Expo 58.0.14 / React Native 0.88.0. Both arms use a minified arm64 Release and the same paired isolated Host, deterministic provider and input. No live model, Metro, mirror, recorder, accessibility polling or concurrent builds/tests during Perfetto sampling.

The retained QA Host uses DSH 0.2.0-rc.2; the mobile dependency is 0.2.1-rc.2. The private QA transport permits loopback only, equally in both arms. It is not a production-source change.

Implementation measured: `c73f9850f38f9714713675697b3f0fb3743fbe1f`; its later comment-removal/formatting commit `88c49451baee295b5672db8b3fb9c3f37e09df9e` has identical runtime behavior. The following integration at `9d2a2401d15e7379fa887ec63c7afef7483a44b8` includes main `1270c97cb8a9ba78350d6fa6d65531a9f19d8f71`. These matched figures remain attributed to the original measured packages, not relabeled as an integration measurement.

| Package   | APK SHA-256                                                        | Embedded JS SHA-256                                                |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Baseline  | `1856E2D9ECD9A5EB43CBB7AFAB1C573D77A4F714EF41107EEE897737C5914CC8` | `DF437B908A20A7FB6DEB9DB99CC00E6F062BD2DC71CAD0154FF482A4BDCA5493` |
| Candidate | `BDADF188E9EDBCAF018DBBE137AACC0418EEC4713266BFBAE8D97DB6E8E81A84` | `97D59CD83157A20B50E8FB0E1643D868A5C3BC967D8F7D82ACC477126DDBD0FE` |

Both packages have the same `classes.dex` SHA-256: `CBB8133AF5C900598E40A191D7E83208852AA1CC9B197993DBF0104DCCD67321`. JavaScript differs by the Text property; no native input changes.

A B B A A B, three runs per arm, for each scenario. The provider emits 80 graphemes every 32 ms. Each Perfetto trace lasts 45 seconds, with early 2–22 and late 22–42 second windows. Screenshots and canonical checks occur afterward. Inclusive native slices are not independent CPU totals. Scheduled JS CPU includes native measurement executing on that thread and must not be added to its inclusive layout time.

Acceptance was frozen before screening: at least 15% targeted native layout benefit and 10% late presentation-p95 benefit; no greater than 10% early-presentation/UI/completion regression; end-PSS increase within the greater of 15% and 10 MiB. Ordinary prose must not materially regress. Memory below is an end snapshot, not peak memory. Delayed post-trace complete observations are upper bounds, not completion latency.

## Huge single paragraph

19,221 UTF-16 units, same plain fixture as #2220. Three-run medians:

| Metric                                               |    Baseline |   Candidate |
| ---------------------------------------------------- | ----------: | ----------: |
| Constructing StaticLayout, inclusive                 | 10,657.6 ms |  7,221.8 ms |
| Generating StaticLayout For DynamicLayout, inclusive |  9,550.5 ms |  6,383.1 ms |
| Text drawing, inclusive                              | 13,681.5 ms | 13,320.9 ms |
| Early UI frame p95                                   |   28.126 ms |   26.086 ms |
| Late UI frame p95                                    |   92.290 ms |   39.099 ms |
| Early presentation-gap p95                           |   33.180 ms |   24.978 ms |
| Late presentation-gap p95                            |  107.893 ms |   74.701 ms |
| Late mean presentation gap                           |   26.812 ms |   21.280 ms |
| Scheduled JS CPU, both windows                       |    24.523 s |    20.994 s |
| End total PSS                                        | 356,437 KiB | 349,142 KiB |

Measurement-layout time falls 32.2%, display-layout time 33.2%, late presentation p95 30.8%, and scheduled JS CPU 14.4%. End PSS falls 2.0%. Drawing changes little, consistent with a layout-targeted intervention. These are bounded scenario results, not a stable 120-FPS claim or an energy measurement.

Keep the sixth candidate trial: it has only 8.3 ms in onMeasure but 11,277.2 ms in setText, while its DynamicLayout cost remains 6,361.4 ms. Work moved into setText; onMeasure alone would incorrectly imply near-zero layout. All trials remain in the sample data.

## Ordinary prose

21,492 UTF-16 units across 100 headings, short paragraphs and lists. Three-run medians:

| Metric                               |    Baseline |   Candidate |
| ------------------------------------ | ----------: | ----------: |
| Constructing StaticLayout, inclusive |  1,478.9 ms |  1,352.5 ms |
| DynamicLayout generation, inclusive  |    268.5 ms |    251.0 ms |
| Text drawing, inclusive              |  6,032.1 ms |  6,057.1 ms |
| Early UI frame p95                   |    5.950 ms |    5.986 ms |
| Late UI frame p95                    |    5.590 ms |    5.836 ms |
| Early presentation-gap p95           |    8.428 ms |    8.429 ms |
| Late presentation-gap p95            |    8.424 ms |    8.421 ms |
| Scheduled JS CPU                     |    20.249 s |    20.383 s |
| End total PSS                        | 327,940 KiB | 316,958 KiB |

No material measured frame/CPU/end-PSS regression. All twelve performance runs independently verified one canonical Bot reply, expected full body and naturally visible final marker, at actual 120 Hz. This does not qualify history-fling performance.

## Independent visible completion

Separate A B B A A B trials use the same packages and fixtures, with nominal 1.5-second screen capture and Windows OCR on the PC. No Perfetto runs simultaneously. Each conservative interval begins at the last negative capture's start and ends at the first positive capture's end. All 24 boundary images were manually checked. Plain completion requires the full final marker; prose requires section 100 and its complete final two-item list, not just the heading.

| Scenario              | Baseline median interval | Candidate median interval | Candidate upper / baseline lower |
| --------------------- | -----------------------: | ------------------------: | -------------------------------: |
| Huge single paragraph |          40.236–42.306 s |           37.181–39.248 s |                            0.975 |
| Ordinary prose        |          38.713–40.715 s |           38.746–40.751 s |                            1.053 |

Both meet the predeclared no-greater-than-10% regression guard, even using the conservative bound. The candidate plain interval is earlier; ordinary prose overlaps. Captures/OCR add overhead equally to both arms: these are not uninstrumented absolute completion latency or final-opacity measurements. All twelve runs have one full canonical reply, a naturally visible ending without reopening and actual 120 Hz.

All twelve performance traces report no nonzero Perfetto error/data-loss stats. Thermal status is 0 at the start and end of every trace. This is a short-run thermal check, not a sustained heating or battery result.

## Visual, interaction and integration qualification

The six matched font/theme pairs (1.0, 1.3 and 2.0 × light/dark) pass: native wrapping, English long-word emergency breaks, combining accents, CJK punctuation, emphasis, links, entities and the family grapheme remain readable; the exact line endings deliberately differ. All 24 active/final images were inspected. Every final canonical body equals the complete 20,880-unit input; final accessibility checks are after reopening and are separate from natural-completion timing. At 2.0 in dark mode, long-pressing the completed candidate reply opens its reaction and Copy/Share menu. Final integrated Release `9d2a240` passes both 19,221-unit plain and 4,504-unit rich replies: CLI exit 0, exact canonical body and naturally visible ending without reopening, at actual 120 Hz. These checks establish correctness, not new latency measurements. The rich reply shows headings, nested emphasis, strikethrough, inline code, entities, a link, family grapheme, ordered/nested/task lists, quotations, 120 code lines and 40 table rows. Actual scrolling moves from the final table to earlier rows and then the formatted beginning; tapping Return to latest restores row 40 and the final marker. Long press opens reactions and Copy/Share. An initial swipe outside the bubble caused no movement and is retained privately, not counted as a pass.

All 40 retained canonical bodies (including the two CLI-error visual attempts) equal their exact frozen inputs. The [image index](../../.github/pr-screenshots/2251-paragraph-layout/README.md) identifies the original measured and integrated packages. Focused renderer/window tests pass (10). The initial full mobile suite passed 762 tests (9 skipped). After integrating main, the full suite passes 788 tests (9 skipped) with an English default locale in the test process; mobile typecheck also passes. An unmodified run under this Windows machine's zh-CN locale failed four newly merged cloud-channel-cache tests that hard-code English labels. Removing this PR's sole Text property reproduces the same four failures; an isolated English-locale control passes all nine tests in that file. Product code, test assertions and system locale were not changed. Repository lint and changelog checks also pass with the evidence additions; formatting is checked on the final evidence commit. Standards and Spec review are repeated against the final head before merge; CI and external review remain separate merge gates.

Two mixed-language visual driver attempts (`visual-b-10-light`, `visual-b-20-light`) returned `host-unreachable` after a send receipt, although both exact canonical bodies and final accessibility checks passed. Original failed attempts are retained; fresh equivalent `-retry` cases pass with CLI exit 0. Authenticated Host health/observation were checked after the first; the second receipt subsequently reports handled with one reply. The CLI maps multiple fetch failures to this error, so the transport cause is unresolved. These visual-only retries do not exclude or alter any performance/completion sample.

The final accessibility dump for `visual-b-20-dark` exited 137 when the runner started a second capture too early. The original active screenshot and successful CLI result are retained; its final reopened-body capture was repeated serially and passes. The premature gesture capture is excluded from published evidence.

## Sources and reproduction

- [Android line-break strategies](https://developer.android.com/reference/android/text/Layout#BREAK_STRATEGY_SIMPLE): native simple versus whole-paragraph high-quality behavior.
- [React Native Text](https://reactnative.dev/docs/text#textbreakstrategy-android): public property and default. Installed 0.88 source was also checked directly.
- [Android 16 TextView](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-16.0.0_r1/core/java/android/widget/TextView.java): setText, useDynamicLayout and display-layout construction.
- [Per-trial sanitized measurements](data/2251-android-paragraph-layout.json).
- [Prior report and plain replay body](2220-android-paragraph-drawing.md#reproduction-input).

Reproduce after claiming the shared Android lane: build the recorded base and candidate as normal minified arm64 Release, pair to the same isolated QA Host, replay the fixed plain/prose fixtures through a fresh disposable Bot DM, and alternate A B B A A B. Record actual refresh, thermal state, native trace, scheduled JS CPU, canonical body and visible suffix. Use full-text native cost attribution, not only onMeasure. Raw traces, XML, device identifiers, Host credentials and fixture metadata remain private.

## Exact replay inputs

The plain input is linked above. The generator below is the exact source for prose, mixed-language visual and rich-text integration fixtures; unused short diagnostic fixtures are omitted. Strings are compared byte-for-byte to every canonical Bot reply, with hashes recorded in the public data.

````js
const paragraph =
  '我们用固定内容测试流式消息的渲染。每次回放的字符、分块和时间间隔保持一致，滚动时应保持阅读位置，回到底部后继续跟随。**强调文字**与列表用于覆盖 Markdown。\n\n';
const fixtures = {
  prose: Array.from(
    { length: 100 },
    (_, i) =>
      `## 第 ${i + 1} 段：稳定的流式内容\n\n${paragraph}${paragraph}- 固定分块，固定时钟\n- 原生布局与可访问文本\n\n`,
  ).join(''),
  long: Array.from(
    { length: 80 },
    () =>
      'Native wrapping keeps readable words and punctuation together while this paragraph grows. Antidisestablishmentarianism tests a long word; café tests combining marks. 这是一个没有段落换行的长段落，用来检查连续增长的文字是否稳定。**加粗内容**、[链接](https://example.com)、&amp; 与家庭表情👨‍👩‍👧‍👦应保持完整。',
  ).join(''),
  rich:
    '# 格式验收\n\n中文 **加粗与 _嵌套斜体_**、~~删除线~~、`inline &amp;`、&amp;、[链接](https://example.com) 和 👨‍👩‍👧‍👦。  \n硬换行\n\n3. 第三项\n4. 第四项\n   - 嵌套列表\n\n- [x] 已完成\n- [ ] 未完成\n\n> 引用第一段\n>\n> 引用第二段\n\n```ts\n' +
    Array.from({ length: 120 }, (_, i) => `const row${i} = "中文<&amp;>🙂";`).join('\n') +
    '\n```\n\n| 项目 | 值 |\n|---|---|\n' +
    Array.from({ length: 40 }, (_, i) => `| 第 ${i + 1} 行 | **稳定** |\n`).join('') +
    '\n最后一段：REPLAY_COMPLETE。\n',
};
````
