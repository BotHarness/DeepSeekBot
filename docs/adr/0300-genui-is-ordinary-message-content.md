# GenUI is ordinary message content with private exploration

- Status: Message ownership retained; presentation decision superseded by ADR-0301; Web DM T1 candidate in #3685
- Date: 2026-11-07
- Authority: Human-confirmed design interview, Q1–Q15
- Specification: [#3684](https://github.com/BotHarness/DeepSeekBot/issues/3684)
- First implementation slice: [#3685](https://github.com/BotHarness/DeepSeekBot/issues/3685), milestone v1.8.0

GenUI must let Humans examine visual results and continue the conversation on Web, desktop and native mobile. This decision originally chose bounded declarative content in ordinary messages, rather than an independent task-app transcript, model-authored executable UI or callbacks privately bound to the report's publishing Bot. On 2026-11-08 the Human preferred T3 Code-style rich content; [ADR-0301](0301-genui-rich-documents-use-isolated-html.md) supersedes the declarative-only/native-renderer restriction. Message visibility, provenance, explicit publication and routing remain unchanged. Catalog-specific contracts below describe the original report slice, not the future HTML wire format.

## Ownership and behavior

- **Message facts.** GenUI content and its readable summary belong to the same canonical Source Event under existing Messaging ownership (ADR-0036/0037). A timestamped report snapshot identifies its data and stable selectable items. References must not become a second mutable report store; display projections and caches are derived. Existing Channel membership, history, purge and read rules govern access and retention. A filter never grants or restricts access to underlying data.
- **Publication.** The Bot explicitly publishes through the existing outward message owner (ADR-0250), which checks destination and authority. Neither ordinary assistant output nor arbitrary Tool results are automatically published. Validate the complete catalog version, structure, data references and resource limits before publishing the first slice. Generation progress is ordinary progress, not actionable partial GenUI. External delivery remains governed by Outbox evidence and uncertain-outcome rules (ADR-0039).
- **Private exploration.** Filtering, sorting, chart views, detail inspection and selection do not call a model or mutate business state. Persist only bounded view preferences and stable selection references, scoped to the trusted Human and exact report snapshot, in product-owned operational storage (ADR-0041). Restore valid state for that Human on another authorized device connected to the same Host; allow reset. This is not shared history, PersonaBot Memory, a data copy or proof of general multi-account support. Reading or restoring state rechecks access. Message purge invalidates dependent drafts; private state cannot resurrect purged content.
- **Explicit continuation.** Submission creates an ordinary visible Human message in the same Channel, containing a readable request and validated references to the report, exact snapshot and relevant selections/context. The Host derives the actor, validates submitted references against canonical content, and uses existing Messaging/Admission/mention/Wake Policy rules. The report author is provenance, not a hidden recipient or permanent Session binding. Submission is not authorization for a business mutation. A stale reference or lost authority preserves the private draft and returns an actionable refusal without silently redirecting or dropping context; the draft remains unusable if access has been revoked.
- **Refresh.** An explicit request for fresh data follows ordinary messaging. A completed refresh appends a new report message linked to its predecessor; it does not rewrite the old answer, migrate old selections silently or add an inline revision-management interface. The predecessor relationship is not itself a Source Revision. It does not override ordinary deletion, purge or retention.

## Presentation decision

Historical presentation choice, superseded by [ADR-0301](0301-genui-rich-documents-use-isolated-html.md). It still describes the existing #3685 candidate, not the current rich-document target.

Share a bounded, versioned semantic catalog, validation rules and interaction meanings. Use trusted DOM presentation for Web/desktop and trusted React Native presentation for mobile. The model composes allowed semantic elements; trusted code owns layout, theme, accessibility and controls. Do not share DOM components into React Native or introduce a universal provider protocol without demonstrated consumers.

The initial catalog covers metrics, a table, one chart type and bounded exploration/submission controls. Unknown components, unsupported versions or renderer failures fall back to the readable summary in the same message, without executing unknown content. Existing approval, Question and private-input controls retain their owners and are not generic catalog actions.

No dependency is selected. Start without requiring a new runtime dependency; json-render core/catalog remains a focused prototype candidate if it materially reduces this catalog's validation/composition work. Adopting its React renderer must not smuggle in a Web React upgrade. A bundled WebView is not the first-slice renderer; broader needs may reopen that choice with equivalent fixtures and actual cross-platform evidence. This is an ownership/integration choice, not a measured performance claim.

Learn from T3 Code's separation of preview diagnostics and published message content, including stable content identity, sizing and theme handling. This does not adopt generated HTML/JavaScript execution or assume its plain HTML surface supplies ordinary Human-message callbacks. Model-authored executable apps, streaming interactive partial content and external rich-card adapters are separate future decisions.

## First tracer bullet and qualification

One Human–Bot DM: explicitly publish a comparison report with metrics, a table and one chart type; locally filter, inspect details and select entries; explicitly send an ordinary Human follow-up; receive a Bot reply; request refresh and receive a linked new report. Reopen the exact report and recover private exploration on another authorized device connected to the same Host. No free-form business forms, live dashboards or business-executing controls enter this slice.

Implement through the existing Host owners, canonical Messaging transaction, authenticated bridge and Client message surfaces, with matching online CLI commands and a direct model-free Tool path. Establish the first runnable Web journey before expanding to desktop and installed iOS/Android acceptance. A backend foundation or disconnected renderer demo is not a completed tracer bullet. Obtain Human feedback before expanding catalog variants or external providers.

Regression coverage must include invalid/oversized payloads, unsupported versions, forged selections, access loss, duplicate submission/replay, refresh linkage, failed publication, state recovery and purge. Freeze the catalog fixture and resource limits before implementation; reject excess rather than truncate an interactive snapshot silently. Private-draft save conflicts must not overwrite a newer view silently; offline recovery is not promised by this decision.

Compare the existing conversation journey with the added report journey, budgeting publication/validation and renderer cost separately. Measure opening latency, long-history scrolling, height/remount recovery, zero jumps/gaps, bounded memory and view-state writes. Use identical fixtures and the repository's interleaved-run requirements; qualify Web, desktop, installed native, large text, keyboard/screen-reader interaction and Human acceptance separately. No runtime or performance gate has been run for this decision.

## Evidence and delivery boundary

The [interview](../research/2026-11-07-genui-design-decisions.md), [json-render assessment](../research/2026-11-07-json-render-genui-assessment.md), [DSH survey](../research/2026-11-07-dsh-genui-ecosystem.md) and [T3 investigation](../research/2026-11-07-t3-code-genui.md) record source identities and limitations. GenUI content, catalog and private drafts are application-defined concepts, not new DSH primitives. This ADR does not approve dependency installation, implementation, runtime launches, release or tracker writes. Open implementation questions such as wire names, numeric resource limits and draft concurrency mechanics must be resolved within the bounded slice, not by introducing a parallel authority.
