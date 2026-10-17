# TOB mobile UAT verification

Scope: [#2101](https://github.com/BotHarness/DeepSeekBot/issues/2101), [TOB T1](https://github.com/BotHarness/tob/issues/2). This is a separate no-Host path. Do not start T2 or change Prod.

## Before the phone run

1. Follow [shared device QA](device-qa.md), obtain the assigned native build/phone window and recheck free disk. New native modules and URL scheme require an SDK58 development binary. Preserve the old app/Keychain/Host state; no erase is required.
2. Deploy the TOB mobile-discovery companion to UAT, read back the exact callback and fixed instance fields, then export public JSON and render its QR using [TOB's operator tools](https://github.com/BotHarness/tob/blob/main/docs/t1-mobile-session.md). Configuration changes require reimport on the CLI too.
3. Record app build/source SHA and UAT service SHA separately. Human authentication occurs only in WorkOS; never capture password, OTP, authorization code or tokens in evidence. Keep a separate CLI session for the isolation check.

## Observable path

- From an unpaired launch, open **Cloud services** on the pairing screen. A paired user reaches the same screen from the Host drawer. Host pairing/active Host stays unchanged.
- Scan the trusted operator QR, or use **Paste configuration** with the same complete public JSON. On Simulator, pasted import validates the real UI and session path; it does not qualify physical camera scanning. Check server/instance/UAT and confirm import. An ordinary URL, wrong callback or malformed QR is refused without credential exchange. Deny camera permission and verify the retry/settings path.
- Tap **Sign in**. Human completes WorkOS login in the system browser. Return to the app; only the initialized admin is admitted. Screenshot the resulting status with unrelated/private data cropped.
- Tap **Refresh session** and **Check session**. Verify the same admitted identity. Cold restart restores a saved session but requires verification before showing the signed-in status.
- Tap **Sign out**. Confirm local removal and reported remote result; independently read back the WorkOS session, confirm the separate CLI session still works. Do not claim already-issued access JWTs are immediately invalidated.
- Repeat cancellation, expired/interrupted browser flow and offline logout. A cold OAuth callback must not create a login or leak query parameters into navigation. Offline logout reports local-only cleanup; a remote session may remain until revoked/expired.
- With operator-produced replacement config, show critical differences and require explicit confirmation; changed discovery refuses credential-bearing requests. Do not point credentials at arbitrary test servers.
- Capture default/intermediate/maximum system text × light/dark. Scroll to all actions and verify VoiceOver labels/reading order. Camera stops when leaving the screen. Android is a separate qualification lane.

Source tests simulate storage failures, state mismatches, rotation errors and concurrency. Native failure injection is additional evidence when feasible, not an automatic pass. This slice does not expose organizations/groups yet. T1 remains open for shared phone/CLI organization creation/list/switch, owner/member/create retry, signed identity events/reconciliation, revocation and complete Human QA.
