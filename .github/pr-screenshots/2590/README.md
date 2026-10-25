# Native question routing — #2590

Real macOS Chromium, 1440 × 1000, Chinese/light, pinned DSH 0.2.1-rc.2. Both task-owned Hosts started from main `cd38a528eff629611977eb80133e5aaae2e4b82c`; the after Host uses this PR’s tracked question-registration change. The final after run has no temporary diagnostic instrumentation. Direct DeepSeek V4.1 Flash produced every question and reply.

- `before.png`: a fresh Bot called the native question tool, but no Channel question card appeared during the bounded observation.
- `after.png`: a separate fresh Bot in the same Profile received the same Light/Dark task on the formal fixed build; its question choices render. The separate Bot avoids treating a recovered pending call as a fresh-call success, so its name/avatar and roster differ deliberately.
- `answer.png`: selecting Light specifically in remote Activity wrote the owning Host’s question resolution and resumed the Bot, which replied `ANSWER_QA: Light`. The local Host had no matching Channel and its Channel IDs were unchanged.

Synthetic Bot/Host names and test messages only; every selected full-frame image was inspected. No status bar, real machine name, local path, pairing link, credentials or keyboard suggestions are visible. No pixels were edited. Local originals, ARIA, console and canonical receipts are retained in the task evidence index. These images qualify desktop browser behavior only, not native iOS/Android, store binaries or publication.
