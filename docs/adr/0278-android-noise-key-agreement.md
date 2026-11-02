# ADR-0278: Android selects its Noise key-agreement implementation

- Status: Proposed; Android performance measured, review and broader qualification pending
- Date: 2026-11-01
- Issue: #3257

## Context

The existing Noise XK handshake performs synchronous X25519 work on the phone JavaScript thread. Physical Android diagnostics identified this work as a startup long task. A platform-specific implementation reduced that cost without changing the wire profile. The uninstrumented Release comparison measured a bounded visual list-startup stage, not complete app launch or all chat loading.

## Decision

Keep NoiseXk as the sole protocol state machine. It accepts a small internal key-agreement adapter with publicKey and sharedSecret operations. Its default remains the existing noble implementation. Only the Android mobile encrypted carrier selects StableLib X25519 2.0.1 through platform file resolution; non-Android clients retain the default.

Require 32-byte inputs and reject all-zero shared secrets. Keep key generation, fresh ephemeral keys, Host pins, Device Pairing, transcript hashing, HKDF, AEAD, counters, close behavior and shared-secret cleanup in their existing owners. The adapter does not persist keys, negotiate algorithms, introduce fallback decryption or change admission authority.

Independent Noise vectors must match with mixed implementations. Invalid lengths, low-order points, high-bit masking, input preservation and closed-state refusal are covered by tests. Native verification must confirm the selected Android module and communication with the unchanged Host implementation.

## Consequences and alternatives

This adds a cryptographic dependency to Android's bundle and requires cryptographic and Android review. Correct test vectors do not constitute an audit or prove resistance to side channels. Existing JavaScript memory-erasure limitations remain; this decision makes no stronger erasure guarantee.

A global replacement would also change unmeasured Host and iOS behavior, so it is rejected. Removing pin checks, reusing ephemeral keys or bypassing encrypted transport is not an optimization option. Reverting the adapter and its dependency restores the previous calculation without data migration or re-pairing.

Qualification remains tracked in #3257, including foreground recovery, wider device/network coverage and Human QA. The 3x overall goal remains unmet.
