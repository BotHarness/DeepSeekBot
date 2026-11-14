# ADR-0327: Connect account ownership authorizes enrollment

Status: Accepted — Human confirmed the account-system and relay trust tradeoff on 2026-11-12. Implementation and native acceptance are separate gates.

## Context

A phone signed into the same Tobs Connect account as a Host should connect without an operator at the computer. This applies to all accounts, including a prepared store-review account, with no review-only policy or credentials in product code.

## Decision

For authenticated account-list enrollment, the application-defined Connect account owner verifies its signed-in state, relay signature, exact account and Host registration, offer freshness, and verifier hash before authorizing automatic approval. The encrypted gateway validates the phone verifier, approves only the exact Noise peer key and receipt through the existing pairing owner, and redeems that grant. Client input cannot assert automatic approval. Unsigned offers and LAN/private pairing retain their existing device-approval rules.

The mobile account-list path trusts the Host public key obtained from its authenticated HTTPS relay request and pins that key for the Noise connection. It does not ask the user to compare a fingerprint. Pasted links, image links and private connections cannot select account trust by adding a payload flag; camera QR pairing retains its existing optical Host-key trust and Host-side phone approval. Existing pinned-key mismatch and encrypted-channel checks remain in force.

No review-specific environment configuration, expiration, API route, model tool, or parallel authority store is introduced. Existing CLI device inspection and revocation apply to both automatic and manual grants. The bounded `account-device-approved` diagnostic records automatic approval without credentials. Signing out stops new account enrollment; it does not revoke existing paired devices. Revocation removes a device grant, but someone who still controls the account can enroll a fresh device, so account compromise also requires securing account access.

## Accepted desktop/Web amendment — 2026-11-13

The Human confirmed automatic discovery and enrollment of same-account computer environments for desktop/Web Clients, followed by actual Host Feed reads with no connect-all click or manual fingerprint comparison. This extends the trusted account-list path above, not ordinary pasted links or images. The reciprocal relationship and each Client's independent grant follow [ADR-0334](0334-host-relationships-authorize-independent-client-enrollment.md); phones still add/enroll each Host individually and do not inherit another Host through a relationship.

Explicit relationship disconnection suppresses automatic account reenrollment until explicit reconnect, including while remote revocation is pending. Ordinary device-grant revocation alone retains the original distinction: account control can authorize a fresh device. Account sign-out stops discovery, new account enrollment and the official service but does not itself revoke existing device grants or independently reachable routes. Existing pin mismatch, signature, account/Host, freshness and verifier checks are unchanged. This amendment is accepted target behavior; it does not declare the desktop path implemented or accepted on a device.

## Security consequences

This decision supersedes ADR-0244's independent first-key trust and new-device authorization requirements **for authenticated same-account Connect enrollment only**. Account authentication and the Connect relay are trusted enrollment authorities. A compromised account can authorize new devices, and a compromised relay can forge an enrollment or substitute a first-contact Host key. Noise transport encryption does not remove that trust. We therefore do not claim that a compromised relay cannot enroll a new device through this path.

Existing pinned sessions retain their cryptographic checks; an account enrollment cannot silently replace an existing pin. Ordinary unsigned/QR/private pairing retains independent device authorization. The Human explicitly accepted this narrower security guarantee in exchange for unattended account connection.

## Verification and rollback

Cover correct account/Host, wrong account/Host, expired/forged offers, signed-out state, wrong verifier, client-forged approval flags, and LAN/private boundaries. Exercise first account connection without either approval, real conversation, reconnect and explicit revocation. Track iOS, Android, installed builds and Human acceptance separately.

Reverting code restores manual enrollment for future devices but does not delete already-issued grants. Revoke unwanted devices through the existing owner. No database migration is required. The added approval is bounded to initial enrollment, not message transport; tests guard the one-time signature-verification call and refusal paths. No end-to-end performance improvement is claimed.

## Accepted client reachability amendment — 2026-11-14

Server connector observations are advisory, not enrollment admission. A signed-in phone may select a registered Host even when the Relay reports it offline. In the opt-in `identitySource: client` offer mode, the Relay checks the existing account/Host ownership and verifier hash and returns its signed enrollment, expiry and canonical official HTTPS hostname without probing that Host. The phone retrieves the public Device channel identity on that exact HTTPS route, refuses redirects or invalid identity responses, and pins the returned key before the existing Noise enrollment. Account tokens and enrollment proofs are never sent in that public identity request. A bounded failed phone request remains a connection failure, not evidence of global Host offline status.

This moves first-contact key retrieval from the Relay's TLS connection to the authenticated-directory-scoped phone TLS connection. The account and Relay remain trusted enrollment authorities; official hostname TLS and existing pinned-key checks remain required. Arbitrary pasted/image/private links cannot select this trust mode. Existing signature, exact account/Host registration, freshness, verifier and exact Noise peer-key approval remain unchanged. No new authority store or schema migration is introduced. Old clients retain the default Relay-fetched offer response; new clients also understand that response during rollout. Missing tunnel provisioning still returns a route-unavailable refusal; connector online observations never gate an existing route.

The phone adds each Host explicitly; desktop Environment automatic enrollment and bilateral relationships remain outside this slice. Initial enrollment uses one client identity request instead of a Relay identity request; saved-device reconnection retains its existing pinned encrypted transport and adds no background ping. Automated guards assert that the opt-in Relay path makes zero Host probes, that the phone sends no account secrets to the public endpoint, and that stalled identity retrieval ends after eight seconds. Runtime and physical acceptance are recorded separately from this decision.
