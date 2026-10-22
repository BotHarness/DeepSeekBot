# Batch56: native recording starts, then fails; composer interaction evidence

Candidate JS/Host `914bfa57ed04807dc3f94a1ed6a4e678da898591` contains merged #2595 (PR head `085fdcde4d6e5169f162265a8d688f64bf791e16`). Native binary was built at `87724a3b58d556807ef1ba860adcbb96bda6d92f`; the runner qualified reuse with matching strict fingerprint `b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e` and installed executable SHA256 `55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a`. Existing iOS 27 Simulator, signed Debug app, English,402x874, synthetic Recording QA56 chat. This is partial native evidence, not release acceptance.

## Recording result

- Real center and edge taps reached the native button. The microphone is visibly centered.
- Both valid trials: recognition available, permission granted, call:start, native start/audiostart, then audio-capture after21/22ms and end30/31ms after call:start. Neither called app stop/abort. Sustained recording FAIL; root cause remains undetermined.
- An uninstrumented real tap reached the same error UI (`f.png`). Human authorized Speech/Mic for the batch; the runner did not observe the earlier dialog dismissal and does not claim to have performed it.
- The initial observer was invalid: this Hermes Runtime.evaluate path aliased for-const closures to the final method/event. Those earlier unavailable/abort traces are withdrawn, not product failures. Factory-bound v2 passed45 same-runtime fake checks, stayed current during both real trials, and restored button props, methods and listeners. A separate error-only listener without method/button wrapping confirmed audio-capture but provided no usable code/domain.
- A15-second exact-app-PID native log read exited0, parsed1003 records from1004 lines, below its2MiB cap, with no allowlisted facts. It did not persist raw logs. Its counters do not separate PID-filter rejection from missing allowed fields, so empty output cannot establish absence of native errors. No claim that this is an inherent Simulator limitation.

## Composer result

Three-line synthetic draft survived expand/done, attachment-tray open/close and light/dark x large/accessibility-large/accessibility-extra-extra-extra-large changes. Actual send matched exact canonical Host text once; direct DeepSeek reply42 is visible (`s.png`). These are candidate-only captures with no matched Batch56 Before matrix. Larger text screenshots show the input scrolled to later draft lines; do not infer full text visibility, scroll/caret behavior or accessibility acceptance from them. Software keyboard was absent throughout this run: keyboard avoidance is UNTESTED.

| File | Theme | Exact OS text size | Scene |
| --- | --- | --- | --- |
| f.png | light | large | Actual uninstrumented recording failure; centered mic |
| s.png | light | large | Sent synthetic draft and actual reply42 |
| l.png | light | large | Preserved draft; keyboard absent |
| lm.png | light | accessibility-large | Preserved draft; keyboard absent |
| lx.png | light | accessibility-extra-extra-extra-large | Preserved draft; keyboard absent |
| d.png | dark | large | Preserved draft; keyboard absent |
| dm.png | dark | accessibility-large | Preserved draft; keyboard absent |
| dx.png | dark | accessibility-extra-extra-extra-large | Preserved draft; keyboard absent |

## Remaining gates

Stable Listening, second-tap Stop, explicit Cancel and recording interruption/retry matrix remain UNTESTED because recognition ends immediately. Full matched Before/After, software-keyboard clearance, large-text editing/scroll, physical microphone, VoiceOver, Android and release performance remain separate unaccepted gates. Historical Batch54/55 screenshots retain their original scope. Batch56 failure is not a passing After and does not retroactively qualify earlier gesture implementations.

Images were individually reviewed and contain only synthetic QA content; full originals remain private, and these exact copies required no redaction. Hashes in provenance.json. No account screenshots, private logs, device IDs or credentials included. No product fix, new merge authorization or release implied.
