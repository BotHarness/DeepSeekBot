---
Publish: true
---

# Release, CLI, telemetry and diagnostics decisions

These decisions cover product and Skill publication, command authority, telemetry and diagnostic evidence.

## DSH Dev Docs and the Skill mirror share a source

<a id="adr-0033"></a>

The monorepo owns the stable DSH/Cordis Context, concept maps and Decision Tree in the `dsh-plugin-dev` Skill. The docs site renders that source under `/dsh`, and the generated `BotHarness/dsh-skill` mirror distributes the installable Skill. Its independent Skill version and the verified DSH version, upstream revision and verification date are visible in release provenance. Version-sensitive API research stays in the repository.

Why: Documentation and the installable Skill should agree. Explicit provenance lets a reader identify which DSH revision supports a particular release.

Enforced by: [Skill ledger and provenance checks](../../apps/docs/test/dsh-skill-release-ledger.test.ts), [mirror generation and drift check](../../scripts/sync-skill.mjs).

## PersonaBot activity is a projection with live notifications

<a id="adr-0049"></a>

DSH SessionEvents and application-defined Session Ownership supply execution facts. The Host derives PersonaBot activity from those facts and current liveness. Consumers read the projection first and use revisioned `botharness/personabot/activity` events to follow it. Viewers separate current work from attention, and concurrent work with different effects can collapse to generic activity. Tool updates expose the tool kind and tool-declared public detail. Access to complete tool inputs and results stays with their owner. Committed output has its own notification.

Why: A single projection gives the Client and companions the same activity while preserving native SessionEvents and keeping private Tool data out of public presentation.

Enforced by: [activity snapshot revision](../../packages/core/test/bot-activity-snapshot-revision.test.ts), [live activity](../../packages/core/test/live-activity.test.ts), [assignment and tool activity](../../packages/core/test/orchestrator-activity.test.ts).

## Operational log reads use existing owners and capabilities

<a id="adr-0064"></a>

Developer Mode is a Human visibility preference. The Host exposes bounded operational log queries and an agent with applicable filesystem and Shell access can inspect the local log database using the [read-only guide](../dev/guides/reading-operational-logs.md). The database's owner field is a query dimension. Effective Host, member and filesystem permissions still govern local access. There is no dedicated operational SQL Tool.

Why: Existing queries and authorized read-only access already serve inspection. Keeping Developer Mode separate from permission enforcement makes its actual scope clear.

Enforced by: [log access and bounded query](../../packages/core/test/log-skill.test.ts), [Client diagnostic log handling](../../packages/client/test/diagnostic-log.test.ts).

## The Client package has a distinct Bundle identity

<a id="adr-0066"></a>

The Client is built from `packages/client` as `@botharness/ui`, with Cordis plugin ID `botharness-client`. The manifest, ModuleLoader registration and umbrella patch use that identity. In-document replacement preserves the active Bot or Channel selection as Client state.

Why: DSH interprets a module specifier ending in `/client` as a subpath. A distinct package identity prevents an ambiguous module lookup, while selection handoff keeps the Human in the same conversation after a development reload.

Enforced by: [browser bundle identity](../../packages/client/test/client-bundle.test.ts), [umbrella composition](../../scripts/test/product-artifacts.test.mjs), [Client selection handoff](../../packages/client/test/hmr-view.test.ts).

## DSH admission declares a shared API floor

<a id="adr-0087"></a>

First-party product package manifests declare `engines.dsh` as `>=0.2.0-0`. The native DSH evaluator includes prereleases. Exact build dependencies pin the reproducible build and tests. The Host resolves native DSH modules, so product members do not declare separate npm peers for them. The independent IM Provider has its own support policy. Qualification names the exact artifacts and DSH versions exercised.

Why: An API floor admits another release without a package rebuild solely for its version label. Exact build pins and runtime qualification preserve a separate record of what was actually built and tested.

Enforced by: [engine range and build pins](../../scripts/test/manifest-engines.test.mjs), [native preflight compatibility](../../scripts/test/dsh-compatibility.test.mjs), [fresh Profile install](../../scripts/e2e-fresh-profile-install.mjs).

## Usage telemetry and Campaign Links use first-party services

<a id="adr-0132"></a>

The Host sends bounded product usage events through a first-party PostHog proxy using an independently generated random Install ID. Configuration, the Human's preference and standard environment opt-outs control sending. The event properties exclude conversation and Memory content, credentials and local paths. Mobile statistics have [their own consent and identity](../adr/0214-mobile-statistics-use-explicit-consent-and-an-independent-install-id.md).

A Campaign owns Campaign Links. The dedicated link Worker redirects active links to the fixed product site with Campaign UTMs, counts eligible clicks in D1 and emits a server-side event without a person profile. The Worker shares operations across the admin UI, the documented API and its MCP tools. Admin access and scoped, expiring, revocable tokens authorize these operations. The `bh-links` CLI calls the same API.

Why: Anonymous product usage helps compare versions without tying activity to an account or its contents. Separate services keep Campaign attribution and redirect delivery independent of Host event ingestion.

Enforced by: [Host telemetry and opt-outs](../../packages/core/test/telemetry.test.ts), [ingest proxy](../../packages/ingest/test/ingest-proxy.test.ts), [Campaign redirects and counting](../../packages/links/test/links-redirect.test.ts), [access tokens](../../packages/links/test/links-tokens.test.ts), [MCP authority](../../packages/links/test/links-mcp.test.ts).

## CLI model validation is tiered

<a id="adr-0157"></a>

Model Preset operations validate route shape before writes. Offline preset operations also check provider names against the installed catalog snapshot. They report a deferred readiness tier where the real Host and provider are needed. A successful reply from the selected model is the end-to-end usability check.

Why: Local validation catches simple mistakes before a Bot or preset is changed. The actual provider and Host credential owner are needed to assess whether a configured model will answer.

Enforced by: [model plan, invalid provider refusal and preset application](../../packages/core/test/bot-create-cli.test.ts).

## The live CLI invokes the authenticated Host owner

<a id="adr-0159"></a>

Live commands use DSH's authenticated HTTP unary carrier, with a matching method and endpoint and an invocation-scoped login cookie. A supported Host origin and token are required. Tokens come from environment or file and stay out of command output. Live adapters use the owning RPC and do not import or open the operational database. Transport, host trust, authentication and owner refusals retain distinct codes.

Why: The running Host holds the exclusive Profile writer lease. Reusing its authenticated interface preserves permissions and keeps command behavior consistent with the Client.

Enforced by: [live adapter import boundary](../../scripts/check-package-boundaries.mjs), [unary carrier and online commands](../../packages/core/test/bot-management-cli.test.ts), [exclusive offline lease](../../packages/core/test/bot-create-cli.test.ts).

## One umbrella Bundle composes the product

<a id="adr-0160"></a>

The `deepseekbot` Bundle composes Core, Client, Browser, Computer with its native seam, and the qualified IM Provider in the product patch. Umbrella members do not declare standalone Bundles. The product ships headless Browser defaults, while Bot access and IM account setup follow their respective permissions. Packaged installs use the verified artifacts and the Profile's build policy. Workers and standalone CLI packages are separate deployables.

Why: Installing the umbrella yields one coherent Profile composition. A single loader entry for each member prevents duplicate registration and preserves product defaults.

Enforced by: [artifact and Patch composition](../../scripts/test/product-artifacts.test.mjs), [fresh Profile installation](../../scripts/e2e-fresh-profile-install.mjs).

## IM authorization attempts belong to the Provider

<a id="adr-0161"></a>

The CLI discovers supported IM setup flows through Messaging and submits qualified requests to the Provider's authenticated `dsh-im/app-setup` endpoint. The Provider owns attempt identity, expiry and account provisioning. The Human completes any required scan or verification. Credentials and verification codes enter via stdin and travel only in the specific Provider request. Attempt results expose validated state and allow the same attempt to be resumed. A successful application authorization leaves selection of a Bot or target grant to their separate owners.

Why: Reusing the actual attempt keeps the CLI and Client on the same provisioning lifecycle and avoids a duplicate credential store.

Enforced by: [Provider flow, attempt and response bounds](../../packages/core/test/bot-im-cli.test.ts).

## The operator selects the Host explicitly

<a id="adr-0162"></a>

An explicit `--host` or `DEEPSEEKBOT_HOST` selects online management through existing owners. Failure at that target returns the owner or transport result. Offline maintenance remains available under its own writer lease. Online import sends caller-local Zip bytes or asks the Host to fetch a Git source. Creation and Model Preset application are separate operations. Known partial success retains its identity, while an uncertain write keeps its receipt or unknown outcome for lookup. Concurrency and idempotency are qualified per owning operation.

Why: Choosing the target directly protects scripts from accidentally applying a change to a different Host or local Profile. Owner receipts let callers recover from a lost response without silently repeating an uncertain effect.

Enforced by: [management, receipts and lost responses](../../packages/core/test/bot-management-cli.test.ts), [CLI import](../../packages/core/test/bot-create-cli.test.ts).

## A Product Release Version identifies immutable artifacts

<a id="adr-0216"></a>

One product SemVer identifies the co-released computer-side Bundle and its product packages. A frozen Release Plan binds it to the source, dependency provenance and artifact inventory. Runtime identity identifies the loaded code separately from an available update. DSH, the qualified Provider, the Skill and mobile keep independent release identities.

Qualification and publication use the reviewed package bytes. A changed artifact set, including a stable build derived from prerelease source, needs its own version and evidence. Publication verifies dependencies before advancing the product package. Uncertain registry readback stops progress so publication can resume with the same reviewed bytes. The [version policy](../agents/version-policy.md) records the intended distribution channels and the current npm tag workflow.

Why: Product version, approval and installed bytes need to agree. A frozen inventory makes a partially completed registry publish recoverable without silently substituting artifacts.

Enforced by: [release plan, integrity and publish order](../../scripts/test/npm-prerelease.test.mjs), [product artifact identity](../../scripts/test/product-artifacts.test.mjs), [release CI](../../scripts/test/release-ci.test.mjs).

## Message Feedback sends ratings and keeps diagnostic archives local

<a id="adr-0254"></a>
<a id="adr-0256"></a>

Human-initiated message feedback submits a random feedback ID, rating, fixed tags, a bounded redacted comment and app version to the first-party ingest path. The feedback ID is the retry event UUID. Deliberate submission works independently of automatic telemetry. The Host can prepare a frozen, permission-checked diagnostic preview for download. Download saves the archive to the requesting device for separate sharing. A separate explicit choice can include bounded, redacted evidence from one eligible failed turn in a feedback event. The diagnostic archive itself stays local.

Why: Most ratings need very little data, and the Human can review and choose whether to share supporting evidence. Keeping full archives local avoids a separate hosted archive lifecycle.

Enforced by: [feedback privacy, retry and eligible failed-turn selection](../../packages/core/test/message-feedback.test.ts), [ingestion acknowledgement and payload](../../packages/core/test/feedback-upload.test.ts), [CLI feedback](../../packages/core/test/cli-feedback.test.ts).

## Telemetry uses one typed tracking plan

<a id="adr-0270"></a>

Event names use `category:object_action`, registered properties and a consistent source vocabulary. The Web Client submits through `telemetryEvent(event, properties)`. Host and mobile registries generate the tracking plan. The Host rejects unregistered events and invalid properties. The first qualifying interaction per Host-local day emits `app:active_day_start`. The usage report is the Host-online signal. Ingest and mobile queue compatibility translate older event names where needed.

Why: Shared event names and validation make product usage comparable across surfaces. The Active Day event measures Human interaction separately from a Host being online.

Enforced by: [generated tracking plan](../../packages/core/test/telemetry-plan.test.ts), [Host event registry](../../packages/core/test/telemetry-events.test.ts), [Client event forwarding](../../packages/core/test/client-telemetry-events.test.ts), [ingest compatibility](../../packages/ingest/test/ingest-proxy.test.ts).

## In-app updates share one Host-owned run

<a id="adr-0311"></a>

The Release Service and plugin updater share one active update run and the native DSH Plugin Manager. The run collects bounded command output and phases for its request ID. Duplicate requests for the same release can join the run. A different target is refused while the run is active. The Host owns cancellation and reports when it is unsupported or too late. The Web Client and CLI read and cancel the same run. Recent runs stay process-local. Durable install output remains with the native Plugin Manager.

Why: A shared run makes an install started from any surface observable and cancellable through the same owner.

Enforced by: [update run lifecycle and cancellation](../../packages/core/test/update-runs.test.ts), [plugin install integration](../../packages/core/test/release-plugins.test.ts).

## Restart correlation records an observation

<a id="adr-0330"></a>

The release-update diagnostic owner records bounded phase metadata and maintains one private, versioned marker per Profile. Duplicate phases avoid extra disk work. Logs and the marker omit command output, argv, environment and raw errors. The marker read is capped at 4 KiB, expires after seven days and is consumed by a different-PID operational database startup. A same-PID observation retains the marker. A startup observation links to the database mount and leaves previous exit, readiness and unobserved install outcomes unknown. Diagnostic failure cannot control update or restart.

Why: Correlation helps investigate an interrupted update while keeping process observations separate from a successful install or a ready database.

Enforced by: [restart correlation, caps and failure isolation](../../packages/core/test/update-lifecycle.test.ts).

## Diagnostic health has a bounded independent record

<a id="adr-0331"></a>

The diagnostic owner records enumerated failures and bounded loss and recovery metadata in an atomic `diagnostic-health.json` sidecar. Queue overflow and final write loss are distinct from an observed failure that recovered on retry. Live and offline exports carry completeness and availability metadata, including partial or unavailable primary evidence. Offline readers open SQLite read-only and preserve the evidence files. Retained loss counters are lower bounds and overall coverage remains unknown.

Why: The log store can fail while it is the source under investigation. Independent health metadata lets an operator tell an empty result from a partial or unavailable one.

Enforced by: [log failure, recovery, bounds and offline exports](../../packages/core/test/diagnostic-log-health.test.ts), [CLI diagnostic exports](../../packages/core/test/cli-diagnostic-logs.test.ts).

## The Desktop shell owns native report capture

<a id="adr-0332"></a>

A compatible Desktop shell exposes a no-argument `captureWindow()` capability through its preload. The shell authorizes the current top-frame owner and captures only its visible viewport. The Client validates the bounded PNG response and fences late results after timeout or disposal. A selected native path reports refusal instead of falling back. Older shells and browser Clients use their existing capture providers. Pixels stay transient until the Human adds the screenshot to a report.

Why: The shell can capture the visible application window directly while keeping authority and lifecycle outside the Host. The report still owns screenshot selection, markup and attachment.

Enforced by: [Client capture selection, bounds and disposal](../../packages/client/test/bug-report-capture.test.ts), [Desktop source patch and composed Windows evidence](../research/2026-11-13-native-report-capture.md).
