# ADR-0302: GenUI diagrams compile before publication

- Status: Accepted; implementation and runtime qualification tracked by #3691
- Date: 2026-11-08
- Parent: ADR-0300 and ADR-0301; specification #3684

## Context

The Human approved borderless semantic surfaces, distinguishable categorical chart colors and evaluating Pele for diagram authoring. Rich HTML remains the composition format; Mermaid is not a replacement for reports, tables or local controls. The pinned primary-source assessment is [Pele research](../research/2026-11-08-pele-genui.md).

## Decision

Use the application-defined `genui_diagram` Tool as a bounded, offline Mermaid-to-SVG authoring capability. Pin Pele 1.13.0; initially register flowchart, sequence and XY only. The Provider compiles in a disposable, independently terminable Node Worker, not the Host event loop or the Client. Enforce an 8 KiB UTF-8 source budget, 48 KiB UTF-8 output budget, 128 graph edges where supported, one concurrent compilation and a 3-second deadline; terminate on cancellation, failure and completion. V8 heap guards are 64 MiB old / 16 MiB young generation, not a total process-RSS guarantee. No user JavaScript, icon/math callback or arbitrary compiler option is accepted. Disable diagram links and images.

Return SVG, dimensions, compiler version and source/output SHA-256 identities. The caller embeds the returned SVG unchanged into a version-2 HTML document, supplies readable equivalent information, previews that complete document, then explicitly sends those same bytes through the existing message owner. Publication separately enforces the complete HTML/envelope budgets. The Tool creates no message or durable store. Online CLI uses the existing direct `bot-tool` runner without a model.

The shared product-owned default stylesheet supplies semantic surface/well/selection tokens, eight stable categorical series, borderless grouping and accessible focus. Pele's theme variables map to that same token contract, including transparent decorative node borders while meaningful connection/axis lines remain. Defaults occupy a low-priority CSS layer; author CSS is not rewritten. Short Orchestrator guidance and Tool descriptions refer to this contract rather than duplicating a palette in prompts. The existing `genui_json` string wire remains unchanged in this slice.

## Consequences and alternatives

- The renderer library is bundled once in the Host worker artifact, not copied into every message or loaded from a CDN. The Client still renders self-contained SVG/HTML and receives no new library execution rights.
- SVG geometry is fixed before publication; responsive scaling is available, but exact client-width re-layout and loaded-font remeasurement are not promised. CJK, narrow-width readability and accessible alternatives need actual visual checks.
- A client-side library/Worker could later support re-layout, but would add packaging, offline loading, lifecycle and policy obligations without being needed for this first slice.
- Tool-returned SVG consumes model context and must fit final HTML; it is not a compact transport for arbitrarily large diagrams. A future declarative document extension requires a separate justified decision, not a hidden rewrite of stored HTML.
- The SVG result's size and timeout checks do not solve ADR-0301's arbitrary-HTML execution/memory isolation gate. Desktop/native, foreground performance and Human acceptance remain separate qualifications.
- Preserve Pele's MIT notice and bundled ISC notice in the distributed core package. Source tests and upstream benchmark claims are not proof of a package-level or end-to-end speedup.
