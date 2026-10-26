# Native Chinese and Japanese input acceptance

Product source: `d488ae9b8f074311c741eb636b935d028268f755`.
Environment: iOS 27 Simulator, native Debug app with production JavaScript.
These are acceptance captures from one product version, not a UI change before/after comparison.

This material covers input-method behavior only. The extension of the existing Channel Files capability has already merged and is outside this evidence set. Quote reply is also outside this scope.

## Captures

| Image | Captured state | What it shows |
| --- | --- | --- |
| [cn.png](cn.png) | Chinese candidate active during a fixed prose reply | Unconfirmed Pinyin and the `中文` candidate remain visible while reply paragraphs 3–4 are rendered. |
| [cn-end.png](cn-end.png) | Later state of the same Chinese run | Draft is `QA 中文`; reply paragraphs 34–35 are visible. |
| [jp.png](jp.png) | Japanese candidate active during a fixed prose reply | Unconfirmed `にほんご` and the `日本語` candidate remain visible while reply paragraphs 3–4 are rendered. |
| [jp-end.png](jp-end.png) | Later state of the same Japanese run | Draft is `QA 日本語`; reply paragraphs 33–34 are visible. |
| [long.png](long.png) | Successful 10,000-code-point draft preload | The synthetic draft has been pasted into the native editor. This image predates the Chinese composition steps; it is **not** their final-state screenshot. |

![Chinese composition during reply](cn.png)
![Chinese draft after confirmation and cancellation](cn-end.png)
![Japanese composition during reply](jp.png)
![Japanese draft after confirmation and cancellation](jp-end.png)
![Successful long-draft preload, before Chinese composition](long.png)

## Verified scope

| Functional case | Confirmed final draft | Canonical messages | Timing scope |
| --- | --- | --- | --- |
| Short Chinese draft + fixed prose reply | `QA 中文` | 120→122 | Confirmation, new composition and cancellation overlapped the producer interval. |
| Short Japanese draft + fixed prose reply | `QA 日本語` | 120→122 | Confirmation, new composition and cancellation overlapped the producer interval. |
| 10k Chinese draft, idle conversation | Exact 10k fixture + `中文`; 10,002 code points | Remained zero | Idle functional check. |
| 10k Chinese draft + fixed prose reply | Exact 10k fixture + `中文`; 10,002 code points | 124→126 | Confirmation and fresh `ni` composition completed during production; Delete cancellation straddled producer completion. |
| 10k Japanese draft + fixed prose reply | Exact 10k fixture + `日本語`; 10,003 code points | 126→128 | Confirmation and fresh `か` composition completed during production; Delete followed producer completion while visible playback continued around paragraph 41. |

- **Chinese, during a fixed prose reply:** real Pinyin candidate confirmation produced `QA 中文`. A new `ni` composition was entered and cancelled with Delete. Candidate confirmation and cancellation overlapped the recorded producer interval; the captured native surface also shows reply content progressing.
- **Japanese, during a fixed prose reply:** real candidate confirmation produced `QA 日本語`. Real `k` and `a` keys started a fresh `か` composition, which was cancelled with Delete. These actions overlapped the recorded producer interval.
- **Canonical messages for the two short-draft streaming runs:** count changed from 120 to 122, comprising only the fixture trigger and the fixed reply. Candidate confirmation/cancellation introduced no additional canonical message in these runs. This conclusion comes from canonical readback, not from counting visible rows in a screenshot.
- **Long Chinese draft, idle conversation:** full-text readback confirms the exact original 10,000-code-point fixture followed by `中文`, for 10,002 code points total. A subsequent unconfirmed `ni` suffix was cancelled. Canonical message count remained zero. The final native state is preserved in the original recording and accessibility readback; `long.png` shows only the successful preload.
- **Long drafts with streaming replies:** separate Chinese and Japanese runs confirmed full final-text equality with the unchanged 10k fixture plus `中文` and `日本語`, respectively. Each run added only its fixture trigger and fixed reply to canonical history, with no extra message from input-method actions. Real software-keyboard candidates were visible while reply content grew. Confirmation and a new composition occurred within the producer interval. The Delete actions did not all finish within that interval: Chinese cancellation crossed its end, and Japanese cancellation occurred after its end while local visible playback continued. These results do not claim that every cancellation happened while upstream production was active.

The five published images are unchanged. `cn.png`/`jp.png` and their later-state images document the short-draft runs. `long.png` remains the successful preload image only. The additional long-draft streaming results above are text summaries of separate full-text and canonical readbacks, not new screenshot claims.

The long-draft fixture's UTF-8 SHA256 is `cf0a05e7b0cde427d176cf7d3df32e3a02df16e00c2953d1f246c6b3ab0dd481`. Full-text equality was checked against that frozen fixture plus the confirmed suffix; a screenshot of its visible tail alone would not establish equality.

## Limits

These results establish the listed functional behavior on the Simulator, including the separately recorded 10k Chinese and Japanese draft runs with streaming replies. They do not establish physical-device or Human acceptance, input latency, frame-rate performance, equal cache/draft-store conditions for a benchmark, or complete visible playback through the final reply paragraph. The long-draft streaming checks reused reserve conversations and are functional observations, not matched A/B or performance samples. The earlier idle long-draft check remains a separate case.

## Image integrity and privacy review

Each selected PNG was inspected individually and copied byte-for-byte from its original capture. All are complete 440 × 956 app screenshots. No cropping, masking, resizing, generated content, text replacement or image editing was performed. The visible content is synthetic QA text, synthetic Bot names and avatars, app controls, and the system keyboard/status bar. No pairing link, credential, private Host identifier, unrelated conversation or personal content was visible in the selected images.

The PNGs contain only `IHDR`, `IDAT` and `IEND` chunks; no embedded text metadata was present. [SHA256SUMS](SHA256SUMS) records their copied-file hashes. Raw recordings, accessibility dumps, runtime logs, Profile data and operational identifiers are deliberately absent from this public candidate set.
