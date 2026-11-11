# ADR-0327: Review Host enrollment is explicit and expiring

Status: proposed for #2734.

## Context

A store reviewer signs in with a prepared demonstration account and connects to a dedicated Host. Ordinary Connect enrollment requires an operator to approve the new phone key. That prevents an unattended review journey.

## Decision

The application-defined Connect account owner may mark a verified enrollment for automatic approval only when its authenticated account and Connect Host registration exactly match an explicit process configuration and its expiration is still in the future. All three environment values must be present. Nothing is enabled by default; no email suffix, device name, production account identifier or machine address is hardcoded.

The encrypted gateway consumes this server-generated decision only during initial signed enrollment on the Connect route. It first validates the phone's verifier through the existing pairing owner, then approves that exact Noise public key and receipt and redeems through the existing owner. Plain offers, LAN and private pairing keep manual approval. Host-key verification on the phone remains mandatory. No new session store, API route or model tool is introduced. Paired-device persistence and revocation remain with the existing operational database.

The configuration is operator-owned process configuration, not a mobile flag. `connect-status` exposes its scope and expiration for inspection. A stable developer-log phase records automatic approvals without account credentials or pairing secrets. Removing configuration or reaching expiry prevents new automatic approvals; existing paired devices must be revoked separately.

## Consequences

A holder of the dedicated account credentials can enroll a fresh device without a second operator approval on that one demonstration Host during the configured window. The relay is therefore trusted to attest account possession for this exceptional Host, unlike ordinary pairing where independent approval is retained. Use only an isolated demonstration Host with test data and bounded model credentials; never enable this policy on a personal or shared development Host. The feature is not a hidden review mode and does not change Bot behavior or store functionality.

Each review window needs an explicit expiration and operator ownership. Renewal requires an intentional configuration change and Host restart. The final store candidate still requires an independent native review journey.
