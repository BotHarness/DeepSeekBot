# ADR-0338: Relationship enrollment keeps issuance and cancellation durable

Status: Accepted implementation decision for Environment E6 (#4115); runtime acceptance remains a separate gate.

An approved Host Relationship can enroll independent Clients, but a successful device redemption can commit before its reply reaches the Client. Cancellation cannot depend on receiving a device ID: dropping a late response or revoking only a known credential leaves an unknown grant active. We keep enrollment intent and cancellation in the existing application-defined relationship owner, alongside Device Pairing's canonical device grants, instead of disconnecting the relationship or introducing a second credential store.

## Issuance and persistence

Operational Database generation 142 records each relationship, Client public key and direction. The source Host writes an unconfirmed intent before asking the peer for an offer. Its fixed deadline is the existing ten-minute pairing-offer lifetime. The target records that same intent; redemption atomically checks its state and deadline, commits the existing `paired_devices` and `relationship_device_grants` facts, and consumes the intent once. Private keys and device credentials remain in the Client's existing private storage or CLI file.

After private persistence, the Client confirms the same public key. Source confirmation is idempotent: a lost confirmation reply is resolved by reading and retrying that key, never by minting another key. A committed intent remains committed across its original deadline. An unconfirmed intent cannot be committed after expiry; it becomes pending cleanup. A Web Client retains an explicitly marked private record while confirmation is unknown, retries that same intent after refresh, and removes the private record when cancellation or expiry is established. The Environment row reports that the connection is finishing.

## Cancellation and recovery

Cancellation addresses the exact relationship and Client public key. The target writes a cancellation tombstone and revokes matching derived devices in one database transaction; it then closes their streams and removes matching live offers. Redemption checks that tombstone in its own grant transaction. A late offer request checks the same intent and fixed deadline, so cancellation before offer creation, cancellation before redemption, and cancellation after grant commit all converge without retiring other Clients or independent phone grants.

The source durably retains pending cleanup and uses pinned Host-to-Host Noise control to retry that attenuation after sign-out or restart. It retries at most eight times with bounded backoff; exhaustion remains inspectable and can be retried explicitly through CLI. An unconfirmed intent whose Client disappears also enters cleanup at its deadline. Pending unconfirmed or cleanup work prevents automatic enrollment from accumulating fresh keys. Only confirmed cleanup or cancellation records past their fixed deadline plus sixty seconds can be reclaimed. Committed records and unresolved cleanup are retained; the 1,024-record limit refuses new intents rather than evicting authority or live tombstones.

## Same-account trust and Client scope

Same-account discovery uses the existing authenticated relay list and offer endpoints. Each participant verifies its own exact registration, Host ID and Noise key. The receiver independently fetches the source registration through its own account session; caller-supplied directory rows or HTTP results do not prove membership. Its own relay HMAC, account, registration, freshness and verifier hash must match a fixed-role transcript containing both registrations and pinned Host identities, the relationship ID, deadline and nonce. Stable registration ordering chooses one initiator. Account generation and explicit-disconnect suppression are rechecked after asynchronous work and before approval, activation and automatic enrollment.

Server-verified account provenance is written atomically with the relationship. Only those relationships are eligible for automatic Client enrollment; manual relationships retain **Use on this client**. Sign-out invalidates new automatic work immediately and leaves existing independent grants and routes intact. Cleanup is an attenuation and remains available while signed out. Bot collaboration membership is separate; this decision deploys no relay change.

The automatic consumer is the supported in-harness desktop/Web Client. Native mobile keeps explicit per-Host enrollment and does not inherit another Host. A phone browser running the complete owner Web Client is a Web Client; physical-device classification is not inferred from User-Agent or a caller flag.

## Client storage coordination

All browser credential-array writers use the same short native IndexedDB readwrite transaction as a coordination boundary around synchronous fresh-read, exact credential-generation comparison and local-storage update. IndexedDB stores no credentials, lease or authority. It preserves unrelated Hosts and refuses stale removal or updates to a replaced device. The database closes after the transaction and acquisition is bounded to fifteen seconds. This keeps existing HTTP LAN manual pairing and route persistence available without unsafe local-storage locking.

Automatic enrollment additionally holds a per-Host Web Lock across intent and persistence. Inside that lock it first reloads the existing saved Host and verifies its pin, so same-origin tabs reuse one Client grant. Different Hosts keep independent work. Web Locks require a supported secure context; automatic enrollment refuses before minting a key when that capability is absent. Existing HTTP LAN manual enrollment is retained through the short IndexedDB coordination path. Neither lock acquires the separate Client execution lock; execution may acquire the short credential lock after its own guard.
