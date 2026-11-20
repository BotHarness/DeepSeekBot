# T3 Code visual replies: contract, public source, and installed-build evidence

Retrieved: **2026-11-07, Asia/Tokyo (UTC+09:00)**. Research for the ongoing grill-with-docs interview; not an ADR, implementation proposal, or new product decision.

## Findings in brief

- **Contract-confirmed:** This session exposes `mcp__t3_code.html_preview` and `mcp__t3_code.html_render`. The agent supplies an HTML document; preview provides visual diagnostics, while render publishes an inline thread visual. These are not a bounded declarative component protocol. [C1]
- **Public-source-confirmed:** The first-party repository discovered is **`pingdotgg/t3code`**, not an assumed `t3-oss/t3code` implementation. Its version-pinned source contains the same tool names, parameter shapes, descriptions, HTML attachment pipeline, and web/mobile renderer family. [S1–S5]
- **Installed-artifact-confirmed, with limits:** `/Applications/T3 Code (Beta).app` identifies itself as `com.t3tools.t3code`, version/build `0.1.5`. Its packaged metadata claims commit `6d450a428485`, which resolves publicly to **`6d450a4284852af137b2f3407fddd89eb76e7644`**. Packaged server code also contains the relevant tool and security-policy markers. This establishes a concrete public-source attribution lead, not proof that this thread's active server/client runs that exact artifact. [L1–L3, S1]
- **Important mismatch:** At that full commit, the repository's desktop and server package manifests say `0.1.7`, whereas the installed application's metadata says `0.1.5`. The reason was not established. Do not silently equate source package version, packaged app version, active environment version, or current public `main`. [L1–L2, S2]
- **Security distinction:** The inspected source isolates published HTML with an opaque-origin sandbox, but does **not** make it network-inert. Preview's public-network-only proxy is a separate boundary and must not be generalized to the published page. [S8–S10]
- **Interview implication:** Borrow the preview/publish separation, thread-owned references, responsive/theme integration, and explicit diagnostics. Do not replace the Human-accepted **bounded declarative JSON default** with arbitrary HTML/JavaScript merely because T3 supports visual replies. That default is supplied by the task brief, not inferred from T3. [C2; interpretation of S3–S13]

## 1. Evidence and method

### Confidence labels

| Label                            | Meaning here                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract-confirmed**           | Directly supplied tool schema/description or task instruction in this session. Describes the exposed interface, not its hidden implementation. |
| **Public-source-confirmed**      | Read from a fixed public Git commit. Describes code/documentation at that revision, not an interaction observed in this session.               |
| **Installed-artifact-confirmed** | Read-only inspection of attributable application installation metadata or packaged code. No application was executed.                          |
| **Inference**                    | Reasoned interpretation of the cited evidence, explicitly not a tested guarantee.                                                              |
| **Unknown / unverified**         | Evidence did not establish the fact, or runtime verification was intentionally outside scope.                                                  |

Official-source searches were attempted first. The search/fetch tool returned no usable result bodies, so retrieval proceeded directly through GitHub's repository/commit/tree APIs and `raw.githubusercontent.com`. Sources below are the repository owner's docs and source, not third-party explanations. A lookup of `t3-oss/t3code` returned HTTP 404; this is a retrieval result, not a claim that no similarly named fork exists. [S1]

Only the named research file was written. No render/preview tool was invoked, no browser/device session was opened, no application or headless browser was launched, and no build/install/test, issue/PR write, or delegate was performed. Local inspection was limited to `/Applications/T3 Code (Beta).app/Contents/Info.plist` and selected entries of its `Contents/Resources/app.asar`; the archive was parsed in memory, not extracted. No user threads, credentials, tokens, `.env`, databases, telemetry, or private session stores were inspected. These are research-method statements, not product claims.

## 2. Repository and build attribution

| Evidence layer                        | Identity observed                                                                                                                                                        | What it does not establish                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository metadata            | GitHub owner `pingdotgg`; repository `pingdotgg/t3code`; default branch `main`. The README points to T3 Code's website, web/mobile apps, and this repository's releases. | Ownership of every similarly named product/fork, or the active environment's binary identity. [S1, S2]                                                  |
| Public discovery snapshot             | `main` resolved to `4c3a9d58184f20bd76833bd599c3544d2c09e3eb`, commit time `2026-11-07T11:53:17Z`.                                                                       | A release designation or a claim that `main` remains unchanged. This was discovery context, not the implementation baseline below. [S1]                 |
| Installed macOS bundle                | Identifier `com.t3tools.t3code`; short version `0.1.5`; bundle version `0.1.5`.                                                                                          | Running process identity, remote server version, signed release provenance, or mobile version. [L1]                                                     |
| Installed archive root `package.json` | Package `t3code`; version/buildVersion `0.1.5`; author `T3 Tools`; homepage `https://t3.codes`; `t3codeCommitHash: 6d450a428485`.                                        | A reproducible-build attestation or proof the package was unmodified. [L2]                                                                              |
| Public resolution of packaged commit  | `6d450a4284852af137b2f3407fddd89eb76e7644`, commit time `2026-10-29T12:09:31Z`.                                                                                          | That every archived byte was built from that commit. Public desktop/server manifests there report `0.1.7`; the discrepancy remains unresolved. [S1, S2] |
| Selected installed server bundle      | Contains `html_preview`, `html_render`, `HtmlRender.publish`, `recordHtmlRender`, `takeHtmlRender`, and the HTML CSP string discussed below.                             | Whole-build equivalence, the active tool service's deployment, or live browser enforcement. [L3]                                                        |

**Implementation baseline for all source findings below:** commit `6d450a4284852af137b2f3407fddd89eb76e7644`, not floating `main`. Repository attribution is materially stronger than name matching because an installed commit claim resolves in that repository and feature-specific packaged markers agree. **Exact active-build correspondence nevertheless remains unknown.** [L2–L3, S1–S5]

Local artifact fingerprint, for repeatability rather than attestation: SHA-256 of `app.asar` was `987e4617649259aa39349f4b993c478e20f099fe963496224fe1f11972129ede`. [L2]

## 3. What is actually exposed to this agent

| Surface         | Direct session contract                                                                                                                                                                                                               | Extra facts from pinned source, not from the schema alone                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `html_preview`  | Required self-contained `html`; optional `width` and `appearance`. Width guidance is 240–1600 CSS px, default 728, about 390 for phone previews. Appearance is light/dark, default dark. Returns PNG, content height, console output. | Success schema names `width`, `contentHeight`, `capturedHeight`, `consoleMessages`, optional `missingImages`, and a PNG `screenshot` object containing data, width, and height. [C1, S3]                     |
| `html_render`   | Required `html`, `title`, `height`; input height guidance 80–2000 CSS px. Publishes an inline thread page above the reply. Description documents fit-to-content up to 20,000 px and mobile scrolling beyond the provided height.      | Returns an `htmlRender` reference with `attachmentId`, `title`, `height`, optional width/height measurements, plus a message. Source requires caller thread scope. [C1, S3, S4]                              |
| Authoring rules | Inline styles/scripts; absolute local images are inlined; remote URLs load as supplied. Transparent root/outer layout, theme variables, fixed chart heights, and no viewport-height/root-100%-height layouts are documented.          | Source supplies a CSS/bootstrap layer and rejects viewport-height units detected in inspected CSS. This is not a complete sanitizer or a formal proof that scripts cannot create a resize loop. [C1, S5, S6] |

Documented theme variables include `--background`, `--foreground`, `--muted`, `--card`, `--popover`, `--secondary`, `--border`, `--ring`, `--primary`, `--accent`, `--destructive`, `--warning`, `--success`, `--info`, `--code-background`, `--chart-1` through `--chart-6`, `--radius`, `--font-sans`, and `--font-mono`, with relevant foreground/surface companions. The contract describes a reply-width frame around 728 px on desktop and about 360 px on phones. These are layout guidance, not measurements of the Human's current viewport. [C1, S6]

The schema does **not** establish sandbox flags, CSP, persistence, replay, outbound network restrictions, callback authority, idempotent business actions, or model continuation. Also, a tool annotation describing read-only access is not evidence of zero side effects: the source marks render read-only in its tool metadata while its handler stores a thread-owned artifact. [S3–S5]

## 4. Source-level data flow

The following is a source reconstruction, **not a captured interaction**. [S3–S7, S12–S14]

```text
Model generates a complete HTML document
  -> html_preview(html, width?, appearance?)
     -> inject bootstrap/theme; inline supported local images
     -> isolated headless-browser capture through public-address proxy
     -> PNG + contentHeight + capturedHeight + consoleMessages
  -> model may revise document
  -> html_render(html, title, height)
     -> require caller thread scope
     -> validate/prepare document; allocate thread-owned attachment ID
     -> write prepared HTML attachment
     -> optionally measure responsive heights if browser is available
     -> return reference; remember bounded provider-result recovery mapping
  -> provider tool result / normalized dynamic-tool item
  -> orchestration turn-item event and persisted history
  -> thread timeline recognizes HTML-render reference
  -> asset URL -> web iframe or mobile WebView
```

Preview-before-publication is an agent workflow requirement, not an enforced server prerequisite in the inspected code: publication has its own preparation path and can proceed without an installed preview browser. Failed/timed-out automatic measurement falls back to a reference without responsive measurements. The user documentation explicitly says publishing can work without the browser. [S2, S5]

Preparation embeds local image bytes into the page and injects the bootstrap before storage. Source limits include a 512,000-character tool HTML input, 10 MiB per local image, and 25 MiB prepared-page size. These are different units and different stages; none is an observed latency/memory budget for this environment. [S3, S5]

The source returns an attachment reference, not a live React component tree or a continuously streamed declarative patch protocol. An agent can make another render call, but the inspected interface does not expose an explicit replace-existing-attachment or update-by-ID operation. Repeated render calls are annotated non-idempotent. [S3–S6]

## 5. Persistence, replay, and lifecycle

**Public-source-confirmed:** `HtmlRender.publish` writes prepared HTML under the environment's attachment directory, using a thread-owned attachment identifier with an HTML suffix. It returns the reference after optional measurement and records a provider-result recovery mapping. Its error cleanup removes the attachment and consumes that mapping. This is artifact persistence, not merely HTML retained in a mounted browser component. [S5]

`McpProviderSessions` keeps a bounded, in-memory mapping of recent HTML inputs to attachment references. The inspected implementation retains up to 64 entries per thread and matches input characteristics or a reported reference. An ACP adapter can restore a missing structured HTML result when a provider reduces a result to a summary. **This mapping is not the durable archive** and should not be described as crash-proof persistence by itself. [S12]

Structured tool output preserves the `htmlRender` reference; provider ingestion constructs `turn-item.updated` events; the orchestration event store exposes append and ordered/thread-scoped reads. The web timeline has a dedicated HTML-render row that mounts `HtmlRenderFrame`; the frame resolves a `text/html` attachment asset. Together these establish a source-level route for history reconstruction. The user documentation states that deleting a thread deletes its pages. [S2, S7, S13, S14]

**Unknown / not runtime-verified:** Actual survival of the current environment's artifacts across restart, history reload, export/import, rollback, deletion, interrupted writes, backup restore, or cross-device reconnect. This research did not trace every transaction/cleanup edge or test those journeys. Reopening the saved HTML would execute page logic again; persisted HTML is not evidence that transient DOM state, filter selections, external CDN bytes, or arbitrary JavaScript state are snapshotted. [Inference from S5–S7, S13]

## 6. Sandbox, CSP, network, and parent messaging

### Published HTML is isolated, not network-disabled

At the pinned revision, the asset response's HTML CSP consists of:

```text
sandbox allow-scripts allow-forms allow-popups allow-downloads
```

The dedicated web HTML-render iframe is stricter in its element sandbox:

```text
allow-scripts allow-forms
```

It omits `allow-same-origin` and allows fullscreen through a separate iframe permission. The combination is intended to give generated code an opaque origin rather than the application's origin/session. These are source facts; no runtime sandbox escape testing or actual response-header inspection occurred. Do not confuse this dedicated frame with the broader generic document-preview iframe elsewhere in the same file. [S8, S9]

**Critical boundary:** The HTML CSP shown above has no `default-src`/`connect-src` allowlist. Consequently, it is not evidence of an egress prohibition. A sandbox is not a universal network firewall, nor a guarantee that forms cannot cause external effects. The docs describe public resources loading, and the tool contract permits remote URLs. Do not claim that published HTML cannot contact local/private networks merely because preview blocks them; no equivalent published-page public-address proxy was established in the inspected delivery path. This is a security interpretation of the documented configuration, not an observed exploit. [C1, S2, S8–S10]

### Preview uses a different network boundary

The headless capture launches Chromium with a SOCKS proxy, disables the usual loopback proxy bypass, constrains WebRTC behavior, and uses temporary browser-profile storage. Its proxy resolves destination names on the environment host, rejects local/reserved/own addresses, and connects to checked addresses to reduce DNS-rebinding exposure. The source also supports explicitly disabling the browser sandbox; the installed environment's actual flag/configuration was not inspected. These are implementation mechanisms, not a comprehensive security audit. [S10]

Thus **preview success does not prove delivery-time network behavior, CSP enforcement, browser-engine behavior, or business-action safety**. A page's external resources can also change after publication. [Inference from S5, S8–S10]

### The bridge is narrow, but not nonexistent

The injected bootstrap uses JSON-RPC-shaped `postMessage` messages for theme updates, content-size notifications, link opening, image opening, and selected keyboard shortcuts. Web host handling checks that incoming messages originate from the mounted frame's `contentWindow`; link/key/image requests are also gated on frame focus and reader activation, with allowed/blocked shortcut matching. Messages use `"*"` as the target origin; the inspected host-side source-window check matters because the page has an opaque origin. A wildcard by itself neither proves an exploit nor establishes authentication. [S6, S9]

Theme data sent into the generated document includes selected CSS variables, not a general application-state object in the inspected bootstrap. This is a theme/data boundary, not proof that all host APIs or all renderer dependencies have been audited. [S6, S9]

## 7. Theme isolation and resizing

**Public-source-confirmed:** The server injects base CSS and a theme bootstrap. The client can provide its theme through a URL fragment and subsequent messages; the bootstrap replaces the theme style with validated variable names and filtered values. The generated document is separate from the surrounding application stylesheet, while the explicit token bridge makes it visually consistent. This is not arbitrary parent-DOM inheritance. [S6, S9]

Source responsive measurement widths are `320, 375, 430, 520, 640, 728, 860, 1000, 1144` CSS px. The HTML reference can carry measured height pairs. Web rendering observes the container width and live content-height notifications, with a 20,000 px fit ceiling. The input/reference height remains bounded to 80–2000 px; these are different stages, not contradictory limits. Mobile uses reference-based frame sizing and an overflow-aware nested-scrolling WebView. [S5–S7, S11]

Viewport-height layouts are rejected to reduce feedback loops. Dynamic scripts, font differences, asynchronous remote content, and nested scrolling still require separate correctness/performance evidence; no frame-pacing, accessibility, or scroll-jump claim was tested here. [S5–S7, S11; inference]

## 8. Interactions and model continuation: do not conflate two products

| Mechanism                           | Established at the pinned revision                                                                                                                                                                                                         | Not established for plain `html_render`                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Script inside a visual reply        | Local DOM interaction is supported; page scripts run in the document. [S2, S6, S9]                                                                                                                                                         | An automatic model turn for a click, canonical business-state mutation, or persisted interaction state.                        |
| Host presentation bridge            | Theme, sizing, selected shortcuts, image/link opening. [S6, S9]                                                                                                                                                                            | A general-purpose callback dispatcher, tool invocation API, or approval/transaction protocol for generated buttons.            |
| **MCP Apps**, separately documented | Apps returned by configured MCP servers have a distinct app bridge: tools on their own server, confirmation rules, messages to a thread, and context notes for a later message. Agent/session availability can limit app interaction. [S2] | Permission to attribute those semantics to arbitrary HTML visual replies because the protocols share some `ui/*` method names. |

No explicit business callback or click-to-resume-model contract appears in the exposed `html_render` input/output. The inspected plain-HTML host message handler also does not establish one. **Unknown** is the correct label for broader current-build behavior without a tied source path or authorized test. Do not invent action identifiers, delivery guarantees, retry semantics, or idempotency from the screenshot/render schemas. [C1, S3, S9]

## 9. Native and headless implications

The first-party README identifies an Electron desktop app and separate mobile clients. The inspected web path mounts an iframe, whereas the React Native mobile implementation uses `react-native-webview`, a signed attachment URL, explicit theme injection, overflow detection, restricted top-frame navigation, external-link handling, and process-termination recovery. These are **HTML in a native WebView**, not conversion into SwiftUI/UIKit/Compose components. [S2, S7, S9, S11]

The mobile file includes Android-specific nested-scroll behavior and opens a full-screen attachment route. A mobile source implementation is not evidence of this machine's installed iOS/Android version, platform CSP equivalence, accessibility quality, keyboard/selection behavior, offline replay, or smooth scrolling. All remain unverified here. [S11]

**Headless parity is partial evidence, not an acceptance result.** Preview is implemented server-side using headless Chromium and returns machine-readable diagnostics; render can save an attachment without the web UI or model. The CLI registers internal ACP MCP bridge/call commands, while their definitions mark them unlisted and describe them as ACP-agent plumbing. No dedicated, supported user-facing HTML-render CLI command was established from the inspected registration. No such command or hidden endpoint was invoked. [S3–S5, S10, S15]

Do not infer the BotHarness standard—direct model-free command, same authority checks, coded failures, and a real live-Host run—from this alone. MCP availability and screenshot generation do not prove a terminal renderer, installed-native parity, or complete headless lifecycle/interaction parity. [C2; interpretation of S3, S15]

## 10. What BotHarness should borrow, and what not to copy

These are interview inputs, **not newly accepted design decisions**. The task brief already fixes bounded declarative JSON as the default. [C2]

**Borrow as patterns:**

- Keep generation, preview diagnostics, publication, and durable thread association distinct. A screenshot can diagnose layout without pretending to validate an action. [S3–S5]
- Store an immutable, thread-owned visual reference with clear provenance and a recoverable history path rather than depending only on live widget memory. Do not mistake T3's in-memory provider recovery map for that durable authority. [S5, S12–S14]
- Make theme tokens, width/height limits, mobile overflow, failure states, and machine-readable diagnostics explicit parts of the delivery contract. Evaluate the bounds for BotHarness rather than inheriting T3's numbers unquestioned. [S3, S6, S7, S11]
- Preserve the distinction between presentation events and canonical application actions. Require separately specified authority and continuation semantics before calling a visual an operational workflow. [S3, S9; interpretation]

**Do not copy as an assumed default:**

- Arbitrary generated HTML/JavaScript, CDN execution, or local-file embedding as an automatic expansion of the accepted declarative JSON surface. These add trust and portability questions beyond the accepted default. [C2, S3, S5, S8–S10]
- T3 iframe flags/CSP as a complete security design, or preview's network restrictions as evidence of published-page egress restrictions. [S8–S10]
- MCP Apps callbacks, approval UX, or context-to-model behavior as though they belong to plain `html_render`. [S2, S3, S9]
- Web screenshots as native acceptance, persisted HTML as persisted interaction state, a read-only annotation as zero side effects, or matching tool names as exact deployed-build provenance. [S3, S5, S11–S13; inference]

Documentation-only performance assessment: no production/runtime code or dependency changes. No runtime performance claim is made; builds, timing benchmarks, and browser/device gates were intentionally not run.

## 11. Unresolved facts for the interview

1. **Active identity:** Which exact client and environment-server commits currently serve this Human's thread? Installed `0.1.5` metadata plus public commit attribution cannot answer that without additional authorized runtime evidence. [L1–L3]
2. **Version discrepancy:** Why do packaged `0.1.5` metadata and source `0.1.7` manifests coexist at the claimed commit? Packaging override, stale metadata, or another cause remains unknown. [L2, S2]
3. **Delivery-time network policy:** Is there any additional current-deployment network restriction beyond the inspected HTML CSP/iframe sandbox? None was established here. [S8–S10]
4. **Replay and lifecycle:** What actually survives restart, rollback, thread deletion, mobile remount, export, and external-resource loss in the active build? Source mechanisms are not a completed acceptance test. [S2, S5, S11–S14]
5. **Action boundary:** Does the desired BotHarness slice only visualize accepted declarative data, collect a bounded local selection, or invoke a canonical action? T3's plain HTML tool does not answer this product question, and research must not decide it. [C2, S3, S9]
6. **Continuation:** If interaction must reach the model, which explicit authority, approval, input schema, replay policy, and idempotency contract applies? Plain `html_render` provides no established answer. [S3, S9]
7. **Native/headless proof:** Which installed-native and direct CLI journeys must be demonstrated separately? No native, terminal, or cross-device runtime acceptance occurred in this research. [S11, S15]

## Sources

All public sources retrieved on **2026-11-07 Asia/Tokyo**. Unless marked discovery-only, source links are fixed to the installed metadata's publicly resolved commit. Line ranges are omitted in URLs so the full source context remains accessible.

### Direct session evidence

- **[C1]** This session's supplied `mcp__t3_code.html_preview` and `mcp__t3_code.html_render` schemas/descriptions. No external URL; no calls made. They are primary evidence for the exposed contract only.
- **[C2]** Human's task brief and supplied BotHarness `AGENTS.md`: bounded declarative JSON default already accepted; research-only scope; CLI/native acceptance and source/runtime separation requirements. No external URL.

### Local installation evidence

- **[L1]** `/Applications/T3 Code (Beta).app/Contents/Info.plist`: read only `CFBundleIdentifier`, `CFBundleShortVersionString`, and `CFBundleVersion`.
- **[L2]** `/Applications/T3 Code (Beta).app/Contents/Resources/app.asar`: root `package.json`, archive index, and whole-archive SHA-256. Non-secret installed application code/metadata only; no user-data path.
- **[L3]** Same archive: selected server bundle `apps/server/dist/binCli-1k0PQRR7.mjs` and client bundle `apps/server/dist/client/assets/htmlRender-BmWuQmlD.js`. Server marker checks and bounded publication/provider-recovery excerpts were inspected; the client chunk's presence/size was checked, not used as proof of its full behavior. No source-map or reproducible-build comparison was performed.

### Repository identity and fixed source

- **[S1]** Owner/repository and commit resolution: <https://api.github.com/repos/pingdotgg/t3code>; <https://api.github.com/repos/pingdotgg/t3code/commits/6d450a428485>; discovery-only main snapshot <https://github.com/pingdotgg/t3code/commit/4c3a9d58184f20bd76833bd599c3544d2c09e3eb>. Negative lookup: <https://api.github.com/repos/t3-oss/t3code> returned 404.
- **[S2]** Product and visual-reply docs; package versions: [README](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/README.md), [visual replies and separate MCP Apps section](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/docs/user/html-renders.md), [desktop manifest](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/desktop/package.json), [server manifest](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/package.json).
- **[S3]** [HTML tool schemas, descriptions, annotations, response fields](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/mcp/toolkits/html/tools.ts).
- **[S4]** [HTML tool handlers and caller-thread binding](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/mcp/toolkits/html/handlers.ts).
- **[S5]** [Preparation, local-image embedding, limits, measurement, publication and cleanup](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/htmlRender/HtmlRender.ts).
- **[S6]** [References, sizing, theme tokens, CSS and message bootstrap](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/packages/shared/src/htmlRender.ts).
- **[S7]** [Web HTML frame and asset resolution](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/HtmlRenderFrame.tsx); [dedicated timeline row](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/chat/TimelineAssistantRows.tsx).
- **[S8]** [Asset response headers and HTML CSP](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/http.ts).
- **[S9]** [Dedicated `HtmlRenderDocument` iframe and host message handling](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/web/src/components/files/BrowserDocumentFrame.tsx).
- **[S10]** [Headless capture, browser flags and temporary profiles](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/htmlRender/headlessChrome.ts); [public-address proxy and DNS/IP checks](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/htmlRender/publicProxy.ts).
- **[S11]** [Mobile HTML WebView, overflow, navigation and recovery](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/mobile/src/features/threads/HtmlRenderWebView.tsx).
- **[S12]** [Provider recovery mapping](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/packages/provider-core/src/server/McpProviderSessions.ts); [ACP tool-result recovery](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/packages/provider-acp/src/server/adapter.ts).
- **[S13]** [Structured tool-output extraction](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/packages/shared/src/toolOutput.ts); [provider-event ingestion](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/orchestration-v2/ProviderEventIngestor.ts); [event-store append/read interface](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/orchestration-v2/EventStore.ts).
- **[S14]** [Thread-owned attachment references](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/attachmentStore.ts); [architecture and independently versioned client/server boundary](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/docs/internals/overview.md).
- **[S15]** [CLI registration](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/binCli.ts); [unlisted ACP MCP bridge/call command definitions](https://github.com/pingdotgg/t3code/blob/6d450a4284852af137b2f3407fddd89eb76e7644/apps/server/src/cli/acpMcpBridge.ts).
