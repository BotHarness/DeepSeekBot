# ADR-0248: Client Help owns contributions and guides; layout owns transient presentation

- Status: Accepted for S1 implementation; Human acceptance pending
- Date: 2026-10-24
- Specification: [#2715](https://github.com/BotHarness/DeepSeekBot/issues/2715)
- Delivery: [S1 #2717](https://github.com/BotHarness/DeepSeekBot/issues/2717)

## Context

Help must locate actual controls without acquiring the authority to change model settings, submit messages, or persist tutorial arrangements. Ordinary Dock changes immediately save both outer and inner layout. Home text requests may send messages and therefore cannot serve a draft-only handoff.

## Decision

The application-defined Client Help Service is one process-local capability provided by the UI Plugin. Built-in and independently installed Plugins register namespaced topics and questions through the public `@botharness/ui/panels` types. A contributing Fiber owns its disposer. The existing Panel Registry remains the definition and instance authority; Help does not install Plugins or create a second Panel registry.

Help owns applicability, one active guide, cancellation, and the current step. A generation-scoped AbortSignal bounds preparation; stale completion releases its resources and cannot present a guide. Driver.js remains the presentation library. Operation steps resolve feature-owned anchors when reached and enable progression only after the original feature reports semantic completion.

The existing ChannelDock owner leases a transient working arrangement, including outer geometry and inner workspace state. Its ordinary save boundary excludes that arrangement. Releasing the lease restores current normal presentation with surviving Panel instances; it never writes an old application snapshot over persisted preferences. A change in another window invalidates the lease and adopts the latest normal layout. Actual models, approvals and drafts keep their original owners and persistence.

Ask Tob validates the original Bot, opens the existing DM, and passes visible text to the existing ComposerDraftStore. An occupied or structured draft is preserved until explicit insertion. No Home send request, hidden management target or additional Tob permission is introduced.

Agents use `deepseekbot help-client` against an explicitly selected local debug Client. It calls the same live Help Service without a model or duplicated diagnostic store. It does not add a Host route, bridge method or Bot tool. The existing model CLI remains the canonical settings readback.

## Alternatives and consequences

Ordinary resize followed by persistent snapshot writeback would pollute preferences during the tour and overwrite newer changes. A separate tutorial settings store would duplicate business authority. Both are rejected.

S1 supplies model help and independent Plugin text help. Human feedback pulled broad text FAQs, panel location hints and Quick Switcher FAQ navigation into S1. Real Plugin tutorials, complete Panel operation lessons, workspace lessons and shared onboarding lessons remain later gated stages. Web, native Desktop and Human acceptance are separate evidence claims.
