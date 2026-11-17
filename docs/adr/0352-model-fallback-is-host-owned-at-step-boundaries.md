---
Status: Proposed
Date: 2026-11-18
Issues: (spec issue, linked on creation)
---

# ADR-0352: Model Fallback is Host-owned and moves a Session at a step boundary

## Context

Bots run on several providers and keys whose quotas run out: an OpenCode Go key answered a real request with `429` and `Retry-After: 452761` (its weekly window, 5 days), while a DeepSeek key on the same model family still had balance. Today the Host treats that as an ordinary rate limit, waits on the same route, auto-continues twice and then holds the Bot. External gateways such as Magpie solve this with routing groups in front of the agent, and DSH could own it below the agent. DSH's `agent/request-error` hook can only retry the failed step with its captured model selection; `agent.model.select()` changes only future steps.

## Decision

The Host owns Model Fallback. A Session's Model Choice may be a Routing Group: an ordered, Host-wide set of routes and nested groups. When a request fails with `QUOTA`/`ACCOUNT_QUOTA`, a missing or invalid credential, or a `429` whose provider delay exceeds the short-wait bound (or a rate limit that outlasts the existing wait), the Host lets the failed step close, marks a quota-exhausted route as a Resting Route until the provider's named reset (else a default rest), selects the next usable member with `agent.model.select()`, writes a Model Switch Notice, and continues the Turn. Each candidate is checked against the PersonaBot owner's role model allowance and credential readiness at selection time. A Session returns to its preferred member at its next Turn after the rest ends, so a Turn stays on one route where possible and keeps its prompt cache.

Reading remaining quota (vendor balance or plan-window endpoints) belongs to DSH provider adapters, so keys never leave DSH; fallback itself needs only failure signals. External gateways remain usable as ordinary custom providers.

## Consequences

- One step's request is lost on fallback, never a partial reply; a step that already streamed output is not replayed on another route.
- Ordering modes beyond `order` (soonest reset, pace, least used) wait for DSH quota reading.
- Several keys for one model are several custom providers placed in one Routing Group; there is no key pool inside one provider.
