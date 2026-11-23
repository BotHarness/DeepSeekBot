---
Status: Accepted
Date: 2026-11-21
---

# ADR-0362: Speech catalog discovery is Host-owned

## Context

When a Human adds a Voice Provider, the options depend on the provider, its capability and the account behind the key. Some providers list model IDs, others call their TTS voices models, and a public voice can require a separate account write before use. A draft can browse these options before it becomes a saved Voice Provider.

## Decision

The Voice Provider owner offers a common paged catalog for speech models, account-available voices and public voices. Adapters own capability filtering, authentication, URLs, cursors and response translation. The Host sends the draft key in an authorization header to the adapter's known endpoint. Results and draft keys are transient. Saving a Voice Provider uses the existing credential store and records the selected model and voice IDs.

Adding a shared voice to an external account is a separate operation with explicit confirmation. The selected ID comes from the account-add result. Web and the local CLI use the same Host owner. The LLM model picker and speech picker share visual components and brand assets.

## Considered options

- Query providers from the Client. This would spread provider authentication and error handling across Clients, and provider CORS policy could block access.
- Reuse the LLM model catalog for speech. Speech synthesis has separate model and voice selections, and importing a voice has an account side effect.
- Discover catalogs at custom endpoints. The Host would need a separate policy for sending draft credentials to arbitrary locations and interpreting unknown model capabilities.

## Consequences

Adding discovery for a supported provider is an adapter change. Providers without a listing endpoint can still offer curated defaults and manual IDs. A public listing remains read-only until the Human confirms an account write.
