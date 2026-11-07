# GenUI specification and tracer-bullet handoff

Date: 2026-11-07 (Asia/Tokyo)

Later amendment, 2026-11-08: the Human approved T3 Code-style rich HTML documents rather than treating the three-component report as the long-term GenUI shape. [ADR-0301](../adr/0301-genui-rich-documents-use-isolated-html.md) records the new target; the original specification body and #3685 below describe the earlier declarative slice. The specification discussion records the amendment. Existing Web report evidence is retained, not relabelled as HTML or native qualification.

## Published specification

The Human confirmed Q1–Q15 and authorized `to-spec` followed by tracer-bullet ticket planning. [Specification #3684](https://github.com/BotHarness/DeepSeekBot/issues/3684) is the canonical implementation specification, labelled `ready-for-agent` and `scope:spec`. It contains the user stories, accepted decisions, highest existing testing seam and explicit exclusions. The Human subsequently approved the first ticket and Project and explicitly selected milestone `v1.8.0`; no implementation claim was made.

[ADR-0300](../adr/0300-genui-is-ordinary-message-content.md), the bilingual Context and the living architecture record the architectural authorities. The [interview](2026-11-07-genui-design-decisions.md) retains confirmation provenance, and the linked research reports retain source identities and verification gaps. These documents remain local working-tree changes until reviewed and committed; the GitHub specification does not pretend that they are published main-branch evidence.

## Published first tracer bullet

**[GenUI T1 — Web DM comparison-report complete journey, #3685](https://github.com/BotHarness/DeepSeekBot/issues/3685).** Published as a native sub-issue of #3684 with `ready-for-agent` and `scope:tracer`, no implementation blockers and no assignee/claim. Deliver explicit report publication with metrics/table/one chart, local exploration, ordinary Human submission, visible Bot follow-up, appended refresh, and private view recovery across authorized clients connected to the same Host. Include canonical Messaging, authenticated bridge, Web presentation, online CLI/direct Tool parity, negative regression coverage and an operable isolated runtime journey together.

The highest existing test seam is the public conversation journey through current Messaging owners and authenticated Client transport. Unit/integration tests complement that seam; no separate data source or test-only authority is proposed. The initial fixture is clearly synthetic and bounded; a separate real-model journey is required. Obtain Human feedback on the complete first path before expanding sibling platforms, catalog variants or providers.

Per `to-tickets`, the Human confirmed granularity and Project before implementation-ticket publication. Both issues are in **V1.0 · Channel Streaming & Chat History** (organization Project 6) and milestone **v1.8.0**. The board name does not change the selected release milestone or authorize publication/deployment. Desktop and installed iOS/Android remain accepted target surfaces, not prematurely detailed sibling tickets. One implementation issue does not require another coordination hub; if more slices become warranted, use a dedicated hub, native sub-issue/dependency links and the same confirmed Project. The specification remains open with its original body and type; only the explicitly requested tracking metadata and native child relationship were set.

## Verification and authority boundary

Implementation update: the Human subsequently authorized `implement` for #3685. The task claim is [recorded on the issue](https://github.com/BotHarness/DeepSeekBot/issues/3685#issuecomment-6708065731), and implementation is isolated in branch `codex/3685-genui-web-report`. The working implementation adds a bounded version-1 catalog, canonical message payloads, Host-owned CAS private views, ordinary Human replies, direct Tool/online CLI and a trusted Web renderer. This supersedes the earlier no-claim/no-implementation statements as historical planning evidence, not as runtime or Human acceptance. Qualification results belong to the implementation task outcome; desktop and native remain unqualified.

Planning baseline remains BotHarness `1532839bc9042f2e749de321dd4bfa3b67cb3eb0` on the already-dirty shared checkout. Preserve unrelated work. No feature implementation, dependency installation, Host/browser/device launch, runtime test, deployment or release was performed. Source checks are not installed-native, real-service, performance or Human acceptance.

Specification publication and readback are tracker evidence only. Documentation-only changes add no product hot-path work or runtime dependency; the runtime performance assessment and regression guards remain mandatory within the future implementation slice.
