# Pele for BotHarness GenUI: source-only assessment

Research and retrieval date: **2026-11-08 (Asia/Tokyo)**. Upstream: [`obsidianmd/pele`](https://github.com/obsidianmd/pele), pinned to **[`3a2f075ee0c3d914f0fad3545fc0f193693975ac`](https://github.com/obsidianmd/pele/commit/3a2f075ee0c3d914f0fad3545fc0f193693975ac)**, package version **1.13.0**. The GitHub commits API returned this revision for `main` during retrieval; its committer timestamp is **2026-10-31T00:07:28Z** and its release commit identifies 1.13.0. All upstream file citations below are immutable links to that revision, not promises about later releases. [Commit][commit] · [Package manifest][package]

Scope: background research using upstream documentation and source only. No dependency installation, build, benchmark, rendering, application runtime, browser, device, tracker operation, or subdelegation was performed. Source inspection is not proof of browser/native compatibility, security containment, accessibility acceptance, or performance in BotHarness. The existing worktree's unrelated changes are outside this research.

## Conclusion

**Evaluate Pele as an optional Mermaid-to-SVG diagram compiler complementary to the GenUI rich-document renderer, not as that renderer's replacement.** Its public contract accepts diagram text or a parsed diagram model and produces SVG plus dimensions and link metadata. It does not accept arbitrary composed HTML as its input contract, implement a general document/control system, or provide an arbitrary-JavaScript execution boundary. This is an integration assessment derived from the API and security contract, not a tested BotHarness integration. [API][api] · [Security][security]

Do not describe current Pele as merely a small flowchart-only Mermaid subset: the pinned release explicitly targets every built-in diagram family in Mermaid **12.1.0**. Equally, do not call it fully interchangeable with Mermaid.js: it has independent parsers/layout, documented syntax differences, partial configuration support, no external Mermaid plugins, and no arbitrary HTML-label or callback parity. [Compatibility][compat] · [Contributing][contributing]

## Actual purpose and public contracts

Pele's purpose is converting Mermaid notation to themeable SVG. The main entry includes all diagram types; rendering is synchronous unless using its lazy-loading wrappers. The browser helper adds DOM insertion, container sizing, font observation and optional zoom. This is a graphics compiler plus browser presentation helper, not an Obsidian vault API or a general HTML application framework. [README][readme] · [API][api] · [Mount implementation][mount]

| Surface                         | Actual contract and implications                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render(source, options)`       | Accepts `string \| DiagramModel`; returns `RenderResult` synchronously. Output fields are `svg`, `width`, `height`, `type`, `mermaidType`, and `links`. The SVG is a string, not a PNG, PDF, HTML document, React component, or native view.                                |
| `parse(text, options)`          | Returns a parsed diagram model that can be reused at different rendering widths. Do not infer a stable cross-version, JSON persistence or IPC wire contract merely because a model is exposed.                                                                              |
| `detectType(text)`              | Recognizes a diagram family without requiring registration.                                                                                                                                                                                                                 |
| `supports(text)`                | Checks family availability, not whether the complete diagram parses. A positive result is not validation.                                                                                                                                                                   |
| `mount(element, text, options)` | DOM-only convenience layer returning a handle with `result`, `source`, `error`, `update`, `refresh`, `destroy` and optional zoom. Parse/render failures are presented in the container and exposed through `error`/`onError`, rather than necessarily thrown to the caller. |
| `pele/core`, `register(...)`    | API with explicit diagram registration instead of automatically including all families.                                                                                                                                                                                     |
| `pele/lazy`                     | `load`, `renderAsync`, `mountAsync` load diagram modules asynchronously; core compilation is not thereby moved to a background thread. Keep API imports on the same entry point.                                                                                            |
| `PeleError`                     | Structured unsupported-diagram, syntax, semantic and limit failures, with available type/source-position details. Messages/snippets can include untrusted source; display them as text.                                                                                     |

Sources for the table: [API][api], [Type definitions][types], [Core implementation][core], [Lazy loader][lazy]. A BotHarness raster preview would still need a separate rasterization/capture path; Pele's documented render result is SVG, not an image-file export pipeline. [API][api]

## Mermaid compatibility and coverage

### Supported families at the pinned revision

The upstream compatibility matrix lists **33 families**. Grouping below is for this assessment; it does not establish parity for every option within a family. [Compatibility][compat]

- Graphs and software structure: flowchart, swimlane, sequence, class, state, entity relationship, git graph, mindmap, requirement, architecture, C4, block, agentflow, railroad, tree view, use case.
- Planning, chronology and process: Gantt, kanban, timeline, user journey, event modeling, Wardley map, Ishikawa, Cynefin.
- Quantitative/set/specialized graphics: pie, quadrant, XY chart, Sankey, Venn, packet, radar, treemap, info.

Aliases and beta spellings matter: examples include `graph`/`flowchart`, `stateDiagram`/`stateDiagram-v2`, `xychart`/`xychart-beta`, `sankey`/`sankey-beta`, multiple `railroad-*-beta` dialects, and the C4 context/container/component/dynamic/deployment headers. Resolve supported input against the pinned matrix, not a remembered older list. [Compatibility][compat]

For ordinary data graphics, the XY parser/renderer implements bar and line plots; dedicated pie, radar, quadrant, Sankey and treemap families broaden coverage. This is useful chart coverage, but not evidence of an unrestricted grammar-of-graphics API, arbitrary chart-library plugins, or built-in dashboard forms/tooltips/data-fetching. A composed report still needs a document renderer to arrange prose, tables, multiple graphics and controls. [XY parser][xy-parser] · [XY renderer][xy-render] · [Compatibility][compat] · [API][api]

### Compatibility is not visual or behavioral identity

- **Independent rendering:** upstream documents different positioning, spacing and routing. Mermaid theme selection does not transfer; `themeVariables` colors have a narrower series-palette role. A syntax label such as `flowchart-elk` is not evidence that Pele runs ELK or reproduces ELK layout. [Compatibility][compat] · [Flowchart skipped specs][flow-skips]
- **Labels and interaction:** SVG text supports selected formatting and breaks; arbitrary HTML labels are excluded. URL-oriented `click` statements are supported, but JavaScript callbacks are ignored. This rules out reproducing arbitrary embedded web controls through Mermaid labels. [Compatibility][compat] · [Security][security]
- **Configuration:** frontmatter, initialization directives, comments and accessibility descriptions are supported, but configuration coverage varies by family. The source can override supplied `config` defaults through frontmatter/directives; integration policy must not confuse default configuration with enforced limits. [API][api] · [Compatibility][compat] · [Types][types]
- **Extensions and divergences:** external Mermaid plugins, including ZenUML, are unsupported. Pele accepts non-ASCII Sankey names beyond the documented Mermaid baseline; invalid nonnumeric Sankey values can become a Pele syntax error rather than Mermaid's empty flow. Sankey gradients also depend on unique ID prefixes. [Compatibility][compat]
- **Evidence strength:** upstream compares accepted syntax and parsed data using ported Mermaid parser specs and differential fuzzing. Its skip manifests explicitly exclude renderer plumbing/layout tests or explain differing internal representations. This supports a compatibility strategy, not a proof of complete syntax equivalence or pixel parity. [Contributing][contributing] · [Flowchart skipped specs][flow-skips] · [Sequence skipped specs][sequence-skips]

## Rendering and layout architecture

The source shows a pipeline from bounded input/type detection and preprocessing, through per-family parsing/model construction, into family-specific renderers producing an SVG string. Core registration maps diagram implementations to their families. The SVG builder supplies a common root, accessibility metadata, dimensions and CSS-variable-driven styling. [Core][core] · [Types][types] · [SVG root][svg-root]

For graph-style layouts, the repository owns layered/Sugiyama-style layout, compound grouping/directions, edge routing and label placement rather than requiring a runtime Mermaid/Dagre/ELK dependency. This should not be generalized into “every diagram uses one graph algorithm”: chart and other specialized renderers have their own logic. [Layered layout][layered] · [Compound layout][compound] · [XY renderer][xy-render] · [Package manifest][package]

Text sizing uses canvas measurements when available and a built-in approximate width table otherwise. The fallback contains special handling for wide and zero-width characters; it is still an estimate, not proof of exact CJK/emoji/font-shaping parity. A custom `TextMeasurer` is supported. Different fonts and measurement contexts can change geometry. [Measurement implementation][measurer] · [API][api]

Responsive behavior is not just uniform SVG scaling: `maxWidth` can change wrapping, spacing or layout, and supported families may switch to vertical layout below the default 640-pixel breakpoint. Some diagrams can still exceed the requested width. `mount()` observes resizing, schedules redraws and reacts to font loading; `render()` alone requires caller-managed width changes. A message-list integration needs explicit teardown via `destroy()` and scroll/height handling; upstream responsiveness does not establish zero-jump timeline behavior. [API][api] · [Mount implementation][mount]

## License, dependencies and offline packaging

**License:** the project is MIT, copyright 2026 kepano; preserve its notice and permission text. Its `LICENSE` additionally carries an **ISC notice for the vendored Lucide reset icon**. Mermaid-derived compatibility specs/grammars are identified as MIT in the README. “MIT package” must not cause the bundled icon notice to disappear from distribution notices. [LICENSE][license] · [README][readme]

**Dependency distinction:** the manifest declares no production `dependencies` and documents zero runtime dependencies. It does declare development tooling/test dependencies, including `@mermaid-js/parser`, `@braintree/sanitize-url`, `beautiful-mermaid`, esbuild, Jison, js-yaml, TypeScript and Vitest. That development list is not the set of runtime libraries shipped to a reader; optional host-provided math rendering or sanitization can add separate integration dependencies. [Package manifest][package] · [README][readme] · [Security][security]

**Published shapes:** ESM main bundle `dist/pele.js`, browser IIFE/global `dist/pele.global.js`, declarations, and split ESM core/lazy/per-diagram entries. Build source targets **ES2022 for ESM**, and **ES2021 for the global browser artifact**. The browser-build rationale explicitly names Safari 15/macOS 12 Quick Look and warns that syntax lowering does not polyfill built-ins. This is a source-level compatibility target, not a tested BotHarness browser matrix. Package `engines.node >=20` is not a React Native engine guarantee. [Package manifest][package] · [Build script][build] · [Browser build options][browser-build]

**Offline feasibility — inference, not a verified package:** vendor an exact released artifact/version with notices into BotHarness-controlled assets, or use the project's regular bundler. The all-family bundle avoids on-demand diagram-module fetches; a split/lazy deployment must package every reachable local chunk and satisfy its import/CSP rules. CDN examples using `@1` are floating-version online examples, not an offline or reproducible deployment design. Readiness requires checking the actual packaged artifact, not only the source manifest. [API][api] · [Build script][build] · [Lazy loader][lazy]

“No runtime dependencies” does **not** mean “cannot make network requests”: diagram images and links are enabled by default, and fonts/typesetter resources are controlled by the embedding app. For a no-network GenUI policy, disable image/link output where appropriate, provide approved local fonts/icons, and independently apply the document/container network and navigation policy. [Security][security] · [Theming][theming]

## Native and cross-container constraints

There is no native React Native view contract in the documented exports: the browser mount path takes an `HTMLElement`, uses DOM/SVG and browser observation/input facilities, and is not directly a React Native component. **Inference:** a WebView/local rich-document container is the nearer reuse path; an alternative is a separate SVG/native adaptation, which would have to preserve or translate CSS variables, fonts, dimensions, links and accessibility. Neither path was tested here. [API][api] · [Package manifest][package] · [Mount implementation][mount] · [SVG root][svg-root]

Server/worker string rendering is feasible at the documented API level because text measurement has a non-DOM fallback, but fallback measurements and missing worker fonts can produce different layout. Browser `mount()` and interactive zoom still need their browser environment. Upstream specifically recommends an app-terminable worker when a time limit is needed; that is an integration responsibility, not a built-in execution deadline. [API][api] · [Measurement implementation][measurer] · [Security][security]

Math needs special care on iOS/WebKit: the API documentation notes a WebKit restriction for HTML inside SVG and recommends a MathML-only approach for that example. A host-supplied SVG math result is another supported shape. Any optional typesetter, its local assets and the actual WKWebView/Android WebView behavior require independent validation; generic SVG support alone is insufficient. [API, Math section][api] · [Types][types] · [Security][security]

## Theming and accessibility

Pele exposes color/surface/border/accent/font/radius variables, eight series variables, and element classes such as `.pele-node`, `.pele-edge` and `.pele-label`. Color changes can apply without recomputing geometry. Font changes can affect measurement and need refresh; `mount()` reads CSS fonts and monitors loading. **Recommendation:** map approved BotHarness document tokens to `--pele-*` inside the actual isolated document; parent-page inheritance must not be assumed to cross an isolation boundary. [Theming][theming] · [API][api]

The common SVG root emits `role="graphics-document document"`, diagram-type role description, and escaped `<title>`/`<desc>` content wired through ARIA when accessibility fields are present. Supply a unique `idPrefix` per rendered diagram; `mount()` does so automatically. The zoom implementation uses native buttons with accessible names, configurable labels and keyboard handling. These are concrete mechanisms, **not** a claim of complete screen-reader usability, meaningful node/edge reading order, accessible chart data alternatives or WCAG conformance. [SVG root][svg-root] · [API][api] · [Zoom implementation][zoom]

**Unverified acceptance needs:** readable CJK/emoji and large text at narrow widths; theme contrast including author-specified fills; VoiceOver/TalkBack and desktop screen-reader behavior; keyboard zoom/focus/navigation; an understandable text/table alternative for important data; link handling without stealing conversation focus. These are proposed BotHarness gates, not upstream test results. [Theming][theming] · [SVG root][svg-root] · [Zoom implementation][zoom]

## Security boundary: diagram compiler, not JavaScript isolation

Upstream describes escaping text, filtering styles and URLs, and excluding source-authored scripts/event handlers/HTML labels. However, HTTP(S) images and HTTP(S)/mailto/tel links plus relative addresses are enabled by default. `links: false` and `images: false` disable those surfaces; unsafe schemes such as `javascript:`/`data:`/`vbscript:` are blocked. Internal note-link metadata is explicitly not URL-filtered and must go through the embedding application's navigation policy. [Security][security]

Trusted callbacks are a separate boundary: icon markup and math markup returned by the embedding app are inserted without Pele filtering them. `mount()` accepts an optional sanitizer; there is no basis to advertise automatic blanket sanitization of every host-provided extension. Error messages belong in `textContent`. Keep render options under trusted application control. [Security][security] · [API][api]

Default guards are **50,000 source characters**, **4,000,000 SVG characters**, and **5,000 edges for flowchart/agentflow**. Characters are not transport bytes; the edge guard is not documented as a universal complexity bound for every family. Core checks SVG length after diagram rendering returns, so output-length rejection alone is not a hard peak-allocation cap. There is no documented built-in wall-clock or memory quota; the upstream worker recommendation matters for hostile/expensive diagrams. [Security][security] · [Core][core] · [Types][types]

**Consequences for GenUI:** compiling a restricted diagram DSL may reduce the need to execute generated chart code. It does not contain arbitrary scripts elsewhere in a generated HTML report, make same-thread JavaScript interruptible, prevent WebView navigation/credential exposure by itself, or replace sandbox/CSP/bridge ownership and resource policy. Treat the HTML document's isolation and Pele's input/output policy as separate controls. This conclusion follows from the narrowly scoped renderer contract and explicit host responsibilities, not from an attempted exploit or measured isolation test. [API][api] · [Security][security]

## Performance: claims versus evidence

The pinned upstream landing source advertises approximately sixfold smaller delivery and an upper-bound speedup of 500×, with a comparison table giving 230 kB versus 1.6 MB gzip and 0.05–0.3 ms versus 6–82 ms render times. **These are upstream claims, not measurements made in this research, not universal bounds, and not BotHarness conversation/opening/scrolling results.** The landing source does not attach a raw result log and hardware identity to that table. [Landing source][landing]

The repository does provide inspectable benchmark methodology: [Browser comparison script][bench-browser]

- Fetches Mermaid 12.1.0 by default and compares it with the locally built Pele global bundle in headless Chrome; package/library and Chrome identities are printed.
- Fixtures cover flowchart documentation examples, a small flowchart, 50-/500-node trees, a sequence and a class diagram, not all 33 families or realistic mixed GenUI documents.
- Prepares a common subset of diagrams both engines can render, reports success counts, calibrates repetitions for at least 25 ms samples, alternates engine order across five passes, and reports medians.
- The timed functions assign SVG into `innerHTML`, so this is more than a parser-only microbenchmark. It still does not establish presented-frame smoothness, full layout/paint completion per iteration, cold startup, foreground scrolling, mobile memory, or end-to-end document performance.
- Prints minified/gzipped sizes of the selected built artifacts; those values depend on the exact revision/build and comparison artifact.

The separate Node benchmark measures flowchart corpora and synthetic trees/meshes, optionally against beautiful-mermaid; it catches failed renders and reports completion counts. That script is not a native or browser-presentation benchmark. No benchmark was run here and no independently measured speedup or bundle size is asserted. [Node benchmark][bench-node]

**Assessment:** performance is a credible reason to evaluate the library, not grounds to replace the renderer or claim a user-visible improvement. Before adoption, freeze the package/artifact, fixtures, fonts, document/container policy and runtime identity; compare repeated interleaved base/candidate runs, retain failures and ranges, and measure compilation, first open, resize, memory and foreground timeline behavior separately. Web, desktop, installed iOS/Android and Human acceptance remain separate gates. This is proposed follow-up work, not authorization or completed validation.

## Recommended role and bounded follow-up

1. **Recommended: complementary compiler.** Keep rich HTML responsible for document composition and local controls; let trusted integration code turn selected Mermaid content into policy-bounded SVG. Prefer a small, explicit registration set for a first evaluation, without misrepresenting upstream's broader coverage. [API][api] · [Compatibility][compat]
2. **Alternative to evaluate: compile before publication.** Store/display a fixed SVG derivative with exact diagram/compiler/options/font provenance if the product does not need client-side layout adaptation. Account for changed geometry on narrow devices, CSS packaging and accessible fallback content. This is a design option, not a claim that Pele supplies BotHarness persistence or provenance. [API][api] · [Theming][theming]
3. **Not recommended: general renderer replacement or security shortcut.** Neither the diagram DSL nor SVG output supplies arbitrary HTML composition, state/submission ownership, a trusted Host bridge, or arbitrary-JavaScript isolation. [API][api] · [Security][security]

Before any dependency or implementation decision, validate one fixed mixed report fixture plus representative flowchart/sequence/XY/Sankey/CJK cases, documented non-parity/error cases and adversarial size/link/icon/math cases. Check offline packaging and font availability, cancellation outside the Client main thread, accessibility alternatives, license notices and actual native containers. This research changes no runtime path or dependency; **runtime performance impact is none for this document-only change**, and no regression guard was executed or newly qualified.

## Primary-source index

[commit]: https://github.com/obsidianmd/pele/commit/3a2f075ee0c3d914f0fad3545fc0f193693975ac
[readme]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/README.md
[package]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/package.json
[api]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/website/src/content/docs/api.md
[compat]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/website/src/content/docs/compatibility.md
[security]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/website/src/content/docs/security.md
[theming]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/website/src/content/docs/theming.md
[contributing]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/CONTRIBUTING.md
[flow-skips]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/tests/compat/flowchart/SKIPPED.md
[sequence-skips]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/tests/compat/sequence/SKIPPED.md
[types]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/types.ts
[core]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/core.ts
[lazy]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/lazy.ts
[mount]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/mount.ts
[svg-root]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/svg/root.ts
[zoom]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/zoom.ts
[layered]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/layout/layered.ts
[compound]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/layout/compound.ts
[measurer]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/text/measurer.ts
[xy-parser]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/diagrams/xychart/parser.ts
[xy-render]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/src/diagrams/xychart/render.ts
[license]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/LICENSE
[build]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/scripts/build.mjs
[browser-build]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/scripts/browser-build.mjs
[landing]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/website/src/content/pages/index.md
[bench-browser]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/scripts/bench-mermaid.mjs
[bench-node]: https://github.com/obsidianmd/pele/blob/3a2f075ee0c3d914f0fad3545fc0f193693975ac/scripts/bench.mjs
