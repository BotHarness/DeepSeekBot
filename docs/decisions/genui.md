---
Publish: true
---

# GenUI decisions

GenUI presents interactive content inside ordinary messages. The Host owns publication and continuation through the existing Messaging path.

## GenUI belongs to the ordinary message

<a id="adr-0300"></a>

The canonical Source Event carries a readable summary and a versioned immutable snapshot or document reference. The Bot explicitly publishes through the outward message owner. Message access, retention and purge govern the content and its bundled assets. Local exploration does not publish or invoke a model. The Host restores only bounded, declared private state scoped to the trusted Human and exact snapshot, with access checks and compare-and-set writes. Canonical purge removes affected state and invalidates retained Client controllers.

Explicit continuation is an ordinary attributable Human message in the same Channel. The Host validates the snapshot and submitted references and supplies bounded `genuiReplyContext` separately from the visible request. Existing routing and Admission rules apply. Refresh appends a new linked message. Historical version-1 reports remain readable.

Why: Ordinary message ownership gives a document the same audience, provenance and lifecycle as its answer. Private state preserves exploration without creating a second transcript or authority. Explicit continuation leaves routing and access with Messaging.

Enforced by: [Host publication, access, continuation and purge](../../packages/core/test/genui-document.test.ts), [version-1 report handling](../../packages/core/test/genui.test.ts), [private view state and retries](../../packages/client/test/genui-document-view.test.ts).

## Rich HTML renders through the isolated GenUI surface

<a id="adr-0301"></a>

Version-2 content uses self-contained HTML, CSS and local JavaScript. Generated scripts run in QuickJS with a limited DOM adapter inside an offline, disposable Worker. The trusted surface validates inert snapshots and paints them inside a dedicated script-disabled iframe. The frame CSP denies script execution and external requests, and the native WebView adapter denies navigation, file access and storage. Trusted adapters own the bridge and surrounding message controls. Unsupported content, lost access and failures leave the readable summary available.

A loaded runtime uses one Worker with at most four live document leases and 64 MiB of aggregate WASM linear memory. It bounds interpreter execution at 200 ms, dispatched commands at 500 ms, startup and liveness at five seconds and the mirrored height at 20,000 px. Queue and protocol limits apply per surface. An ordinary unmount releases its own lease. A hard Worker stop explicitly fails its sibling surfaces. Preview uses the same renderer and policy with exact artifact identity, and publication remains explicit. Web runtime loading keeps the parser and WASM out of the ordinary Client entry.

Why: Rich content needs a composition format for charts, text and controls. Guest execution and trusted presentation have distinct capabilities so authored scripts can drive local interactions while the product retains authority over navigation, data access and actions.

Enforced by: [actual Web renderer isolation and failure behavior](../../packages/core/test/genui-html-browser.test.ts), [mirror validation and CSP](../../packages/client/test/genui-dom-mirror.test.ts), [message card shell and fallback](../../packages/client/test/genui-document.test.tsx), [native WebView policy](../../apps/mobile/test/genui-webview-policy.test.ts), [preview artifact identity](../../packages/core/test/genui-preview.test.ts), [runtime packaging](../../scripts/test/genui-runtime-assets.test.mjs).

## Diagrams compile offline before publication

<a id="adr-0302"></a>

The application-defined `genui_diagram` Tool and its direct CLI path compile flowchart, sequence and XY Mermaid with pinned Pele in a disposable Node Worker. The compiler bounds input, edges where supported, output, concurrency and duration. It disables links and images and returns SVG, dimensions and source and output identities. The Bot can embed that SVG in the complete document, supply a readable equivalent, preview it and explicitly publish the same bytes. The shared default stylesheet supplies borderless semantic groups, focus and eight categorical colors, with Pele mapped to the same tokens. Author CSS can override those defaults.

Why: Compiling once keeps the diagram compiler out of message playback and makes the published artifact portable. Shared appearance tokens make charts legible across themes while preserving author control.

Enforced by: [compiler budgets and output](../../packages/core/test/genui-diagram.test.ts), [Tool contract](../../packages/core/test/genui-diagram-tool.test.ts), [default appearance](../../packages/core/test/genui-appearance.test.ts).
