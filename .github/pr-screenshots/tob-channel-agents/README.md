# Channel Agent native UAT evidence

Batch17, 2026-10-18. Product/runtime `dc3ee2f09064de7e96169199c93a5cc68da400ea`, integrated batch same SHA. Initial `f25f5988a` differed only by one source-policy-prohibited comment; it was removed before captures and the app was cold-started. Signed native binary `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; no native changes/build/erase. Service runtime `31e3a4a2880c05b670c2194d6b5a994dacfa297e`, UAT schema D1/Org/Channel5/4/3. Prod untouched; all PRs remain Draft/unmerged.

## Observed behavior

- `01-agent-entry`: owner channel Agent entry, before creating the test actor.
- `form-*`: six actual light/dark × default/intermediate/maximum text cases. Draft `Mobile echo` and keyboard focus retained. At maximum, input y217..274 and Create bottom365 are clear of keyboard top529. See `form-appearance-checks.json`.
- `02-created-maximum-dark`: phone created the channel Agent; after creation, the form scrolls to its top confirmation.
- `03-credential-handoff-safe`: safe management UI after explicit copy. Recording was stopped before copy; the copied credential went straight to an owner-only local file, was parsed/target-checked, and the simulator clipboard was cleared. No credential is in these artifacts.
- `04-phone-agent-reply`: phone sent `echo: Hello from the UAT phone`; independent reference Agent process read through public UAT HTTP and wrote its own author identity. Formal CLI read exactly the Human request and one Agent reply. A fresh second process produced zero new replies. See `mobile-readback.json`.
- `05-restart-retained-handoff`: cold-start and actual Refresh session retained the same private handoff. A second explicit copy was privately compared byte-for-byte as parsed data, then clipboard cleared again. The latest refresh token changed, with the same session identity.
- `06-revoke-maximum` / `07-revoked-maximum`: owner reached and used Revoke agent at maximum text size. Old credential read and send both returned `AGENT_ACCESS_DENIED`; see `mobile-revocation.json`.
- `08-signed-out`: local phone tokens removed, own remote session absent, latest refresh rejected, all pre-existing independent sessions preserved.

Recordings: `create-agent.mp4`, `phone-agent-reply.mp4`, `restart-and-revoke.mp4` (restart/refresh portion only; recording stopped before copy), `revoke-agent.mp4`. Originals remain local; committed copies are 402px/12fps without audio.

## Limits and first failures

This is an unattended synthetic UAT session driven through the production UI/API; not a new Hosted AuthKit or Human QA result. It proves HTTP text identity/replay/revocation, not model work, shell execution, WebSocket, organization-wide Agent admission, two DSH Hosts, Android or physical iPhone.

Initial driver attempts used wrong workspace label, tried an unavailable native Back control, and a hot refresh reset verified-session state. Navigation was corrected from actual snapshots and the final bundle cold-started before captures. Initial CI rejected a code comment; corrected exact-runtime CI39085993395 passed all applicable jobs. A redundant fixture cleanup request returned transport CHECK_FAILED after remote logout had already been independently verified; only the verified-revoked local phone fixture was removed. No cleanup success was inferred from that failed request.

Batch17 released: light/large restored; own app/driver/Metro stopped. Original three QA untracked docs, installed app/Keychain, native Products/rollback, phone Metro and all Hosts preserved. The revoked Agent credential remains only in a private local test file. No secret was logged or published.
