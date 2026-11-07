# GenUI design interview and decision record

Date: 2026-11-07 (Asia/Tokyo)

Later amendment, 2026-11-08: the Human explicitly preferred T3 Code-style rich content. [ADR-0301](../adr/0301-genui-rich-documents-use-isolated-html.md) supersedes the declarative-only/per-platform-native rendering choice below, while retaining ordinary-message and authority boundaries. This interview remains the historical Q1–Q15 record, not the latest renderer decision.

Status: Q1–Q15 and the final shared understanding are Human-confirmed, including the corrected ordinary-message semantics in Q11 and trusted per-platform rendering in Q13. The architecture is recorded in [ADR-0300](../adr/0300-genui-is-ordinary-message-content.md) and the living architecture; this file retains the interview evidence. The Human authorized specification and tracer-bullet issue planning; the published specification is [#3684](https://github.com/BotHarness/DeepSeekBot/issues/3684). No dependency, concrete wire schema or product implementation is approved.

## Purpose and authority

The Human requested that we deepen the recommended Channel presentation direction and use `grill-with-docs` to settle a GenUI design. This authorizes design discussion and its documentation, not implementation, dependency installation, runtime launches, or a broad presentation refactor.

This file records the interview. It is not a parallel architecture authority. Confirmed product terms belong in `CONTEXT.md` and `CONTEXT.zh.md`; durable architectural trade-offs belong in `docs/adr/` and the living architecture. Create those entries only when the corresponding decisions are actually settled.

## Evidence baseline

- [json-render assessment and comparison](2026-11-07-json-render-genui-assessment.md).
- [DSH ecosystem investigation](2026-11-07-dsh-genui-ecosystem.md).
- Source baseline for those investigations: BotHarness `1532839bc9042f2e749de321dd4bfa3b67cb3eb0`, branch `codex/3214-3248-performance`. Other tasks have uncommitted work; no cleanup is authorized.
- Source inspection is not runtime verification. Candidate installation, real model output, browser interaction, native interaction, live IM delivery and callbacks, performance, and Human acceptance remain unverified.

## Existing constraints, not new design decisions

- `CONTEXT.md` defines Source Event content/provenance authority and Channel placement. GenUI must not silently introduce a competing transcript store.
- ADR-0037 owns canonical Messaging facts and transactional placement/admission/outbox relationships.
- ADR-0250 keeps ordinary assistant output private and makes outward publication explicit. A generated view does not automatically authorize publishing a private Tool result.
- ADR-0039 owns external delivery intent and uncertain outcomes. Rendering is not delivery evidence.
- Existing approval, Question and private-input owners remain authoritative unless an explicitly accepted future ADR changes that decision.
- A proposed report-first tracer bullet is a sequencing recommendation, not an agreed permanent product ceiling.

## Design tree

1. Root constraints: primary Human outcome; required surfaces and acceptable fallback; generated-code trust policy.
2. After those settle: the first observable journey; local-only versus model-visible interaction; read-only versus business mutation.
3. After interaction semantics settle: document identity and revisions; state ownership; replay, stale submissions, sharing and lifecycle.
4. After actual journeys and adapters are known: shared presentation module depth; renderer/protocol choice; DSH integration seam; dependency compatibility and migration.
5. After a concrete slice is defined: CLI parity; performance baseline and guard; browser/native/IM acceptance; rollout and reversibility.

Recompute the next question frontier after each Human response. Do not ask downstream questions whose prerequisites remain open, or ask the Human to supply facts recoverable from code and primary sources.

## Round 1 — Human-confirmed

### Q1. Primary outcome

Question: What is the first concrete situation where a Human should prefer GenUI over today's Markdown/table or existing request cards?

Recommendation, not decision: Prioritize examining and manipulating a Bot-produced result in the conversation: bounded report views, local filtering/selection and explicit follow-up. Validate a read-only report first without treating read-only as the permanent scope. Do not start by making an unrestricted application builder.

Human answer: Users should see intuitive, visual, interactive results in the conversation on mobile and desktop Apps, and obtain information through interaction. The recommended tracer-bullet sequencing is reasonable.

Decision: GenUI targets interactive information/results in the conversation, not unrestricted application generation. The report-first tracer bullet is accepted as sequencing, not a permanent read-only ceiling. A read-only report may still have local exploration controls; the exact interaction behavior is not yet settled.

Status: Confirmed.

### Q2. Required surfaces

Question: Where must the complete experience work, and where is a readable summary plus a link acceptable?

Recommendation, not decision: Treat Web and native mobile as target consumers of the same product semantics, while validating the first slice in Web. Initially let external IM carry a summary/protected link rather than promise equivalent controls. This does not select a native renderer or authorize a launch.

Human answer: Agrees with the recommendation, explicitly mentioning both mobile and desktop Apps in Q1.

Decision: Web, desktop App and native mobile are target consumers of the same product semantics. Validate the first narrow slice in Web without calling that native acceptance. External IM may initially carry a readable summary and protected link. Neither identical platform widgets nor a specific native rendering technology is selected.

Status: Confirmed.

### Q3. Generated-code trust policy

Question: Does GenUI need to execute model-authored JavaScript/TSX, or can the default product contract restrict generation to trusted catalog entries and declarative data?

Recommendation, not decision: Default to bounded declarative data rendered by trusted implementation code; model content does not obtain arbitrary scripting, networking or business authority. If executable task apps are a real requirement, evaluate a separately isolated artifact path rather than running generated code in the main Client document.

Human answer: Follow the recommendation.

Decision: The default GenUI path is bounded declarative data rendered by trusted implementation code. Model-authored content does not acquire arbitrary JavaScript/TSX execution, networking or business authority. Executable task apps, if later justified, require a separately designed isolated artifact path.

Status: Confirmed.

## Additional research — T3 Code

The Human requested investigation of the current T3 Code GenUI implementation. The [primary-source investigation](2026-11-07-t3-code-genui.md) is complete at public source identity `6d450a4284852af137b2f3407fddd89eb76e7644`. It distinguishes exposed contracts, public source, installed artifacts, and active runtime. Active client/server identity and runtime behavior remain unverified; installed app metadata and source package versions also differ.

The current session directly exposes `html_preview` and `html_render`, and earlier outputs demonstrate inline HTML attachments with responsive height metadata. Those observations alone do not prove a sandbox policy, persistent interaction state, a Host business-action interface, or exact equivalence to a public repository/build. Research conclusions must distinguish those evidence levels.

This investigation can inform implementation selection, but does not reopen the agreed trust policy automatically. A product can borrow an inline visual experience without adopting arbitrary generated HTML execution.

Research inputs, not new accepted decisions:

- The plain HTML path is generated document -> preview diagnostics -> published, thread-owned HTML attachment -> Web iframe / mobile WebView. Source shows persisted HTML and a history reference, not a bounded component-patch protocol or durable local interaction state.
- Preview-before-publish is an agent workflow expectation, not a mandatory server-enforced gate in the inspected implementation. Diagnostics and actual publication therefore need separate interpretation.
- Plain HTML interaction and the separately documented MCP Apps bridge are not equivalent. Theme/resize/link messages are not a general business-action or model-continuation contract.
- Published HTML has an opaque-origin iframe sandbox, but the inspected CSP does not establish network prohibition. Preview's public-address proxy must not be treated as the published document's network policy. No runtime security test was performed.
- Native-App support does not itself require every generated view to use native controls: the inspected T3 mobile path uses a WebView. For BotHarness, native controls versus a trusted, bounded WebView renderer is a future implementation decision; neither has been selected by Q2.
- Borrow preview/publish separation, product-owned document identity, theme/size/overflow contracts, explicit diagnostics and recovery. Do not import arbitrary generated scripts, external resources or local-file embedding by analogy.

At research handoff, completion was not treated as a Human answer to Q4–Q6, and no additional question frontier was opened solely by the delegate result. The subsequent explicit Human answers are recorded in Round 2 below.

## Round 2 — Human-confirmed

### Q4. Local exploration versus an instruction to the Bot

Question: Should exploring the displayed data stay local until the Human explicitly asks the Bot to continue with a selection?

Recommendation, not decision: Filtering, sorting, changing a chart view and opening details operate on the available report data without a model call or business mutation. An explicit continue/submit control creates a visible, attributable instruction through the existing product owner. Do not wake the Bot for every click or silently turn exploration into a business action.

Human answer: Reasonable; agrees.

Decision: Exploration of the available report data stays local without model calls or business mutations. A separate explicit continue/submit action is required to hand a selection or request back to the Bot through the existing product owner. The submitted content, audience and durable representation are not yet selected.

Status: Confirmed.

### Q5. Data time semantics

Question: Should a report preserve the data snapshot used for the answer, rather than silently change as live data changes?

Recommendation, not decision: Default to a timestamped result snapshot. An explicit refresh creates a distinguishable new result/revision while preserving the basis of the old answer. Real-time dashboards require an explicit later behavior and its own lifecycle/resource policy.

Human answer: Follow the recommendation.

Decision: Default reports represent timestamped data snapshots. An explicit refresh produces a distinguishable new result or revision without silently changing the basis of the previous answer. Placement of the refreshed result is a downstream decision; an appended message versus an inline revision selector is not yet selected. Real-time dashboards are outside the initial behavior.

Status: Confirmed.

### Q6. How much composition the model controls

Question: Should the Bot compose a bounded vocabulary of semantic visual building blocks rather than be limited to one fixed report template?

Recommendation, not decision: Permit useful combinations of headings, metrics, tables, charts, filters and details within a trusted catalog and layout constraints. Keep platform layout and controls owned by the renderer; do not expose arbitrary HTML/CSS/JavaScript or bake provider-specific card dialects into the product contract. Exact vocabulary, input support and catalog size remain downstream decisions.

Human answer: Follow the recommendation.

Decision: The Bot may compose a bounded semantic vocabulary rather than fill only fixed report templates. The trusted renderer owns platform layout, theme, accessibility and controls. This does not approve arbitrary generated HTML/CSS/JavaScript or a provider-specific card dialect as the product contract. Exact vocabulary, layout grammar, dependencies and protocol remain unresolved.

Status: Confirmed.

## Round 3 — Human-confirmed

### Q7. Exploration state in a shared Channel

Question: If two Humans open the same report, should one person's filtering and selection change the other person's view?

Recommendation, not decision: Treat exploration state as the current Human's private browsing draft over a shared report snapshot. Do not synchronize it to other readers or turn it into a collaborative document by default. A filter is a display preference, not a read-authorization rule. Reopen/cross-device recovery is a later decision after state scope settles.

Human answer: Follow the recommendation.

Decision: A report snapshot is shared according to existing Channel read authority, while each Human's filtering, sorting and selection are a private browsing draft. Exploration does not synchronize to other readers or make the report collaborative. Filtering does not create or narrow data-access authorization. Persistence and cross-device recovery remain downstream choices.

Status: Confirmed.

### Q8. Explicit submission and model-readable context

Question: Should asking the Bot to continue create a visible, attributable Human request in the same Channel, with the exact report snapshot and relevant selection attached?

Recommendation, not decision: Publish a readable Human request with validated references to the report, snapshot and selected items, plus only the relevant data context. Route it through the existing Channel/Source Event/Admission owner. The Bot should not have to infer the request from opaque browser-local state or silently execute a generated callback. Existing Channel membership/read rules still apply; business mutation is separate.

Human answer: Follow the recommendation; learn from T3 Code.

Decision: Explicit continuation publishes a visible, attributable Human request in the same Channel, with validated references to the exact report snapshot and relevant selection/context. It uses existing Source Event/Channel/Admission ownership, not an opaque browser callback. Q11 subsequently settles group routing through ordinary message rules. This instruction does not itself authorize business mutation.

T3 qualification: The Human wants to learn from T3's experience. The investigation distinguishes its plain HTML presentation path from MCP Apps interaction; visible canonical requests are our confirmed product requirement, not a newly proven guarantee of plain `html_render`.

Status: Confirmed.

### Q9. Placement of refreshed results

Question: Once a refresh completes, should the new report appear as a new message linked to its predecessor instead of replacing the old report in place?

Recommendation, not decision: For the initial slice, append a new report message with an explicit relationship to the previous snapshot. Keep the previous content and selections interpretable; do not add an inline revision-management interface initially. Requesting fresh data does not itself authorize paid or external side effects.

Human answer: Follow the recommendation; learn from T3 Code.

Decision: A completed refresh appends a new report message with an explicit relationship to its predecessor. The old snapshot and the meaning of selections against it remain intact. The initial path does not replace the old report in place or introduce an inline revision-management interface. Requesting fresh data does not itself authorize paid/external side effects.

T3 qualification: T3's published HTML attachment/reference model is a useful precedent. Our predecessor relationship, Channel publication and refresh semantics remain BotHarness product decisions rather than inferred T3 guarantees.

Status: Confirmed.

## Renderer feasibility investigation — source audit complete

A read-only audit on 2026-11-07 checked the same source baseline. The inspected renderer/card/timeline/mobile paths had no tracked working-tree diff; the shared checkout was dirty and this was not an atomic snapshot. Findings are implementation inputs, not authorization to select or launch a renderer:

- Existing typed Channel content already has separate Web and native presentation consumers (`packages/core/src/channels/channel.ts:290`, `packages/client/src/client/channel-message-body.tsx:462`, `apps/mobile/src/ui/chat/conversation-screen.tsx:296`). Shared semantics do not require sharing a DOM component tree.
- Mobile declares `react-native-webview`, but no current application WebView component/import was found. The removed full-Host WebView is not a reusable GenUI renderer (`apps/mobile/README.md:72`). A bounded bundled document would require new packaging, navigation/network restrictions, bridge, sizing and accessibility work.
- The current Client bundle depends on the DSH module loader; it is not a standalone HTML renderer (`tsdown.config.ts:15`). Existing authenticated attachment routes and device gateway forwarding do not establish executable-document hosting.
- Web React 18 and mobile React 19 do not establish a shared renderer runtime. Candidate package declarations are recorded in the assessment; no dependency/runtime compatibility was tested.
- Both renderer approaches must meet actual timeline measurement and remount obligations (`packages/client/src/client/timeline-window.ts:114`, `apps/mobile/src/ui/chat/conversation-screen.tsx:1633`). No measured performance winner exists.
- Host Human identity and read-position storage are precedents, not a generic report-view persistence API (`packages/core/src/channels/sqlite-store.ts:480`). ADR-0078's initial local-Human scope is not proof of multi-account isolation. Q10 is a target requiring scoped implementation, not an existing capability.

No build, installed native check, security exercise, performance measurement or Human acceptance was performed.

## Round 4 — Human-confirmed, with Q11 corrected

### Q10. Recovery of private exploration state

Question: Should the same Human recover their last filters, view and selected items when reopening a report, including on another authorized device connected to the same Host?

Recommendation, not decision: Persist a bounded private view draft scoped to Human and exact report snapshot under product ownership. Restore only still-valid control/item references. Keep it out of shared Channel history and PersonaBot Memory; allow resetting the view. Immediate interaction stays local, while saving view preferences does not constitute a model call or business mutation. Synchronization conflict semantics and offline behavior are later implementation decisions.

Human answer: Follow the recommendation.

Decision: Recover bounded private exploration state for the same Human and exact report snapshot, including another authorized device connected to the same Host. Restore only valid references and allow reset. Product-owned operational state stays outside shared history and PersonaBot Memory. This does not authorize new multi-account infrastructure or establish offline/conflict mechanics.

Status: Confirmed.

### Q11. Recipient of explicit continuation

Question: In a group Channel, should continuation from a report address the PersonaBot that published it rather than whichever Bot/Session happens to be active?

Recommendation, not decision: Explicitly address the publishing PersonaBot with the report's identity and snapshot. Do not broadcast a generic wake to every Bot. Resolve the current legitimate execution through that Bot's existing owner, not an old Session ID; if membership or availability no longer permits it, show a coded refusal instead of silently redirecting. Ordinary admission rules still apply and existing approval owners are unchanged.

Human answer: GenUI should be published directly as an ordinary message, visible under group message rules; GenUI content and ordinary messages are first-class peers.

Decision: GenUI is ordinary message content, not a separate transcript, private callback channel or Session-bound panel. Explicit continuation is an ordinary attributable Human message and follows existing Channel routing, Admission, mentions and Wake Policy. Publishing-Bot provenance is context, not a permanent recipient binding. Existing membership/history authorization still governs visibility; group membership is not an unconditional grant to every historical item. Private exploration stays private until explicit submission publishes relevant context.

Superseded: The recommendation to automatically target the publishing PersonaBot is not approved.

Status: Confirmed with corrected recommendation.

### Q12. First complete acceptance journey

Question: Should the first end-to-end journey be a bounded comparison report in one Human–Bot DM, with local exploration, explicit continuation and an append-only refreshed result?

Recommendation, not decision: Start with a small report containing key metrics, a table and one chart type. The Human filters/examines details, selects items, explicitly submits a request, receives a follow-up, and refreshes into a new linked report. Validate the first Web path before extending to the target desktop/native surfaces. Free-form business forms, live dashboards and business-executing controls are not part of this first slice. Group semantics are designed now but need not expand the first implementation before Human feedback.

Human answer: Follow the recommendation.

Decision: The first complete tracer bullet is one Human–Bot DM comparison report with metrics, a table and one chart type; local filtering/details/selection; explicit ordinary Human submission and Bot follow-up; and an appended refreshed report. Verify Web first, then target desktop/native separately. Group semantics apply to the design without expanding the first implementation before Human feedback. Free-form business forms, live dashboards and business-executing controls remain outside this slice.

Status: Confirmed.

## Round 5 — Human-confirmed

### Q13. Renderer ownership

Recommendation, not decision: Share a versioned bounded catalog, validation and interaction semantics; use trusted Web/desktop DOM adapters and native mobile adapters for the first small catalog. Do not require a bundled WebView or upgrade Web React merely to adopt a renderer. Keep json-render core/catalog as a prototype candidate, not a selected dependency. This favors existing presentation seams, not an unmeasured performance advantage; broader chart/application needs can reopen the trade-off with matched fixtures.

Human answer: Follow the recommendation.

Decision: Share catalog, validation and interaction semantics; use trusted DOM adapters for Web/desktop and trusted React Native adapters for mobile. Do not require a bundled WebView or a Web React upgrade. json-render core/catalog remains a prototype candidate, not a selected dependency. No measured performance advantage is claimed.

Status: Confirmed.

### Q14. Publication readiness and streaming

Recommendation, not decision: In the first slice, publish a report only after complete schema, reference, size and authorization validation. Show ordinary progress before publication, not actionable partial GenUI. Later incremental display can be a separately qualified extension; never treat provisional content as a settled snapshot or authority to submit.

Human answer: Follow the recommendation.

Decision: The first slice publishes only complete, validated reports. Ordinary progress may precede publication, but partial GenUI is not actionable or a settled snapshot. Incremental rendering remains a separate future extension.

Status: Confirmed.

### Q15. Fallback and lifecycle

Recommendation, not decision: Every published report includes a readable summary in the same canonical message. An unsupported catalog version or failed renderer shows that summary without executing unknown components. Explicit selection submission requires valid snapshot/item references and current authority; failure preserves the draft and explains the refusal instead of dropping context or silently targeting another recipient. Historical content remains governed by existing message retention and read rules, not a separate GenUI lifecycle.

Human answer: Follow the recommendation.

Decision: Include a readable summary in the same canonical message. Unsupported/failed rendering uses that summary without executing unknown content. Invalid selections or current authority failures preserve private state with an explicit refusal, not silent context loss or recipient redirection. Existing message lifecycle and retention remain authoritative.

Status: Confirmed.

## Documentation and verification

The bilingual Context defines GenUI content as ordinary message content with private exploration. ADR-0300 and the living architecture record the accepted design without claiming implementation. No design-interview frontier remains; concrete schema names, resource budgets and concurrency algorithms are bounded implementation work, not authorization to expand product scope.

The Human confirmed the shared understanding and requested `to-spec` followed by `to-tickets`, then approved the single complete first Web ticket, Project 6 and milestone `v1.8.0`. Specification #3684 and its native sub-issue [#3685](https://github.com/BotHarness/DeepSeekBot/issues/3685) are published with `ready-for-agent` in that Project and milestone. The ticket preserves the complete narrow Web journey, rather than splitting backend, protocol and renderer into horizontal tickets. An issue-specific implementation claim is still required before product work. A bilingual documentation change fragment references the real specification issue; it describes the design, not shipped behavior.

This interview note changes no product hot path and introduces no runtime dependency; its performance-impact exemption is docs-only. No product tests or runtime acceptance are claimed.
