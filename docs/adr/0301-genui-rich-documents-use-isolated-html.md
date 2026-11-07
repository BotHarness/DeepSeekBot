# GenUI rich documents use isolated HTML

- Status: Accepted; Web candidate implemented, release qualification pending
- Date: 2026-11-08
- Authority: Human explicitly preferred the T3 Code approach after reviewing the fixed-catalog limitation
- Supersedes: ADR-0300's declarative-only, trusted-native-renderer decision, not its message ownership
- Specification: [#3684](https://github.com/BotHarness/DeepSeekBot/issues/3684); amendment recorded in its discussion
- Existing implementation: [#3685](https://github.com/BotHarness/DeepSeekBot/issues/3685) includes a version-2 Web HTML candidate; qualification remains separate from implementation

## Problem and decision

GenUI must express the answer, not constrain every answer to a comparison-report schema. Humans need composed visual explanations, charts, tables, comparison cards, timelines, diagrams and local interactive exploration inside ordinary conversation messages, on desktop and mobile. Metrics/table/bar-chart were the first tracer fixture, not the product's capability ceiling.

Adopt T3 Code-style rich HTML documents as the primary GenUI presentation direction. The model authors HTML/CSS and bounded local JavaScript; the product owns validation, isolated execution, publication, document lifecycle and any privileged interaction. Web and desktop embed an isolated document; native mobile uses an isolated WebView rather than reimplementing every generated layout as React Native components. The containers are target adapters, not already qualified implementations.

This deliberately replaces the earlier ban on model-authored executable presentation. It does not make generated code trusted application code, adopt T3's complete security policy, select a new dependency or promise every browser API, external resource or third-party widget will work. json-render is no longer the required conceptual shape; no second universal catalog or parallel native report framework is introduced for new rich content.

## Boundaries that stay unchanged

- **Ordinary message ownership.** The readable summary and immutable document reference belong to the same canonical Source Event. Existing Messaging owners retain destination checks, trusted actors, Admission, visibility, retention and purge. A content-addressed artifact is dependent content, not a second conversation or mutable report authority. Document and bundled-asset reads recheck message access; possession of an artifact identifier is not authorization.
- **Explicit publication.** A Bot explicitly publishes through the existing outward message owner. Diagnostic preview does not publish, create a Channel placement or grant permission to act. Neither arbitrary Tool output nor an ordinary assistant conclusion is auto-published. A refresh appends a new linked document message; it does not overwrite the old snapshot.
- **Exploration versus action.** Local filters, tabs, details and charts do not call a model or mutate business state. A renderer cannot call arbitrary Host RPCs, Tools, shell commands or business APIs. An explicit continuation produces an ordinary attributable Human message through existing Messaging rules, not a private callback to the publishing Bot. Approval, Question and private-input controls retain their current owners.
- **Evidence and fallback.** Each document has a bounded, versioned envelope, a stable content identity and a readable summary. Unsupported content, renderer failure or lost access has an explicit product-owned state; the document cannot hide or replace the surrounding trusted message controls. Summary fallback remains usable without an HTML renderer, including CLI and unsupported external destinations.

## Publication and execution contract

The intended journey is **generate → preview diagnostics → explicit message publication → isolated rendering → local interaction → explicit Human continuation**. All document contracts and bridges here are application-defined BotHarness concepts, not new DSH primitives. Existing Plugin/Service Consumers and authenticated API Gateway carriers remain the integration seams; concrete API names and schemas must be verified during implementation.

Preview and final display must use the same document bytes, bundled assets and effective execution policy. Diagnostics return bounded warnings, errors, dimensions and captures without silently repairing or replacing the published artifact. If bytes or policy change, the earlier preview is not evidence for the changed document. A failed or uncertain publication follows the existing owner's idempotency and reconciliation rules, not a renderer retry loop.

Generated HTML is untrusted active content. The implementation must establish an opaque-origin sandbox or an equivalent native isolation boundary, deny top-frame navigation/popups/downloads and prevent access to app credentials, Host cookies, local files and arbitrary network destinations. An iframe sandbox alone is not an egress guarantee. The first slice targets self-contained documents with immutable packaged assets and no document-initiated remote requests. External links, when supported, are handled by trusted product UI rather than navigation inside the document. Any future external-resource support requires an explicit policy and a separately tested mediation path.

The renderer bootstrap must not expose a generic message-to-RPC proxy. A minimal bridge may carry bounded, validated presentation messages such as height/theme and registered interaction context. The trusted adapter binds each request to the current mounted document, message, Human and permissions, rejects stale/replayed/unrecognized requests, and applies size/rate limits. Page-authored text claiming a capability is not authority. Long-running script, runaway height and memory pressure need bounded failure/recovery behavior; parsing or CSP alone does not establish these limits.

An immutable document does not automatically persist its DOM or JavaScript heap. Recover only explicitly registered, versioned, JSON-serializable private state within bounded limits, keyed to the trusted Human and exact document identity. Arbitrary DOM snapshots, arbitrary code-generated action names and arbitrary business payloads are not durable state contracts. Reuse the Host-owned CAS and access/purge principles, not the old comparison-report field schema. If a document has no registered state contract, reopening may reset local exploration and must not be advertised as state recovery.

## Existing candidate and next tracer

Preserve the #3685 candidate and its tests/evidence. Its canonical publication, message identity, private-state ownership, explicit submission and refresh principles remain useful, but its report schema and renderer are not the general HTML contract. The 24 Web captures and 395 focused tests do not qualify generated HTML, WebView isolation or native behavior. Do not expand that fixed catalog as the primary implementation path, silently migrate stored report payloads, or delete the candidate before a replacement has passed its own journey.

The next tracer uses one self-contained composed document containing explanatory text, a table, multiple chart forms, a diagram/timeline and local controls. It must go through diagnostic preview, canonical message publication, authenticated retrieval, isolated rendering, an explicit ordinary Human continuation and historical reopening. Freeze document bytes, interaction schema and numeric byte/asset/state/height/time limits before implementing that journey; the limits must be enforced, not labels in a prompt. The existing report limits are not automatically suitable HTML budgets.

Start with the Web journey, then validate that exact fixture in desktop and installed iOS/Android containers before claiming the cross-platform goal. Keep one primary replacement journey rather than maintaining two expanding GenUI stacks. Include online CLI/direct Tool paths through the same owners, not a browser-only publishing bypass.

## Acceptance and evidence

- Cover the chosen content forms independently and together, with light/dark themes, narrow widths, keyboard/large text, resizing, scroll anchoring, long history, remount and supported private-state recovery.
- Test script and asset loading under the actual isolation policy; blocked navigation, network/local-file/credential access, forged/stale bridge requests, oversize inputs, renderer crashes, access revocation and purge. No unverified sandbox claim counts as a pass.
- Retain per-scene screenshots, diagnostics, original failures and source/document/policy/build identities. Publish privacy-reviewed PR derivatives to R2 with public readback; never commit captures. Existing report captures remain labelled as report-candidate evidence.
- Compare matched base/candidate conversation journeys and separately budget the document work, including preview/publication, opening latency, foreground scrolling, zero jumps/gaps and bounded resources. Web, desktop, installed native, real model/service and Human acceptance remain distinct gates.

The version-2 implementation uses a shared compiler for preview and Web presentation, nested opaque sandbox frames with a no-network/navigation CSP, checked instance/sequence messages, and the existing Host private-view owner. The model-free preview uses the existing Browser runtime and disposable profiles; no dependency was added. Payload, message, height and preview concurrency/image limits are regression guarded. These guards do not establish a measured end-to-end performance advantage.

**Release gate remains open:** arbitrary local JavaScript in an iframe is not a hard execution/memory boundary. A shared-event-loop runaway script can prevent the Client watchdog from firing. Startup/heartbeat failure handling is implemented but must not be represented as guaranteed interruption or memory containment. Desktop-shell, installed mobile, full accessibility, matched foreground performance and Human acceptance remain independently unqualified.

## Diagram authoring and default appearance

[ADR-0302](0302-genui-diagrams-compile-before-publication.md) adds the Human-approved borderless semantic surfaces, categorical chart palette and product-pinned offline Pele authoring Tool. It compiles selected Mermaid families to SVG before publication; the resulting document still uses this ADR's unchanged message, private-state and authority boundaries. This is not a replacement renderer or a resolution of the hard HTML execution gate.

## Evidence

The [T3 Code investigation](../research/2026-11-07-t3-code-genui.md) records pinned public-source findings, installed-artifact attribution limits and the distinction between preview restrictions and published-page network behavior. It remains historical research, not proof of our policy or the active T3 runtime. The [original interview](../research/2026-11-07-genui-design-decisions.md) preserves the earlier approvals; this later explicit Human preference supersedes its renderer choice without rewriting that provenance.
