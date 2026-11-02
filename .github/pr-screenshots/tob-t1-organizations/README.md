# Mobile → CLI organization acceptance (UAT)

2026-10-18 JST · DeepSeekBot #2120 / Draft #2121 · TOB T1 #2 / Draft #17.

## Exact source and scope

- Create/owner-save runtime: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`.
- Final permission/reselection/restart/logout runtime: `1b39324c5034eea2741abed62d579cd1044f2f86`.
- Signed native build source: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; SDK58, iOS26 Simulator. Final change is JS only. Normal local Simulator ad-hoc signing; no phone or Prod build.
- Real UAT Worker: `e5bc56298c2f63aa457ba39a1ce9ad45e2270824`; deployed version `d492f524-3489-4f97-b300-ec1e8671752e`. Service review head `fe5a8cb` adds two passing tests only.
- English / light / default text, 402 × 874 screenshots. API-prepared independent UAT session; **not a new Hosted AuthKit browser proof**. The preceding real email/PKCE run is documented separately in `../tob-t1-uat/hosted-email/`.

## Observed path

1. Phone reads the retained deployer-verified configuration, loads the independent test session from SecureStore and verifies the initialized administrator through the real UAT service.
2. On the actual **Cloud workspaces** screen, create **TOB Mobile UAT**. WorkOS organization + explicit owner membership, D1 mapping/creation receipt and Org DO settings are exercised through the public API. App selects the returned organization using WorkOS token refresh.
3. Phone saves `Created on mobile, read by the CLI.`. Independent formal CLI `org list`, `org use`, `org show` return the **same exact organization ID**, description, version **2** and owner role. Tokens remain private and separate.
4. Control plane changes only this new organization's membership owner → member. An already-issued owner credential receives HTTP **403 ORGANIZATION_OWNER_REQUIRED** on PATCH. CLI reads member with unchanged description/version. The actual phone's stale owner UI also receives the refusal; cached UI does not grant permission.
5. Initial native inspection found stale unsaved text and an old list role after reselecting. Fixed at `1b39324c5`: readonly content uses the verified server description, draft binding includes role, and selecting clears the draft and reloads the list. The repeated native scenario shows Member in both locations, unchanged original content and no save action.
6. Restore the test membership to active owner. Control-plane readback, CLI selection/read and phone reselection all agree. The one test organization remains for review; no second organization was created.
7. Cold restart retains credentials and selected organization but first shows **Saved session · Check to verify**. Check session restores the same organization and owner. No cached permission is presented as verified before that check.
8. Phone logout clears the session and retains public configuration. Independent WorkOS readback confirms only that test session revoked; its latest refresh token returns `invalid_grant`. Existing CLI session remains active and `org show` still returns the same owner organization/version. Revoked mobile credentials and stale test token were removed locally.
9. `allowSignUp=false`, `isMagicAuthEnabled=false` read back. Simulator driver and this task's Metro stopped; no global language preference, Host, physical phone, Prod or merge changed.

## Media

- `00-before-cloud-entry.png`: real prior login-only entry at runtime `216963322`, same Simulator/size/theme/locale; no workspace action. This is historical baseline evidence, not a rerun of main.
- `01`–`04`: new entry, actual create, owner save, old-owner write refusal at `494a20f1e`.
- `05-member-readonly.png`: **first failure**, unsaved local draft and stale list role; intentionally labeled as before-fix evidence, not a pass.
- `06`–`09`: final-code cold restart owner, corrected member readonly, restored owner, signed out.
- `organization-create.mp4`: 72-second real create/save path on `494a20f1e`.
- `organization-permissions-fixed.mp4`: 50-second stale-owner rejection → reload → corrected member view on `1b39324c5`.
- Contact sheets: inspected 19/17 cells from 48 sampled frames each. Recordings exclude credentials and operator control-plane pages. Both videos and all published screenshots were inspected.

## Failed attempts and limits

The initial unsigned Simulator build produced a Keychain entitlement error; rebuilt with normal local ad-hoc signing and reinstalled without erasing data. SecureStore load/write and logout then passed. One text replacement opened the floating development menu; that failed input was not counted as a product or authorization pass. The repeated recording uses a focused text append and verifies the actual entered draft.

Automatic approval review rejected two optional extensions: creating a second persistent organization and deactivating the test membership. Neither action executed, and neither was retried through another route. Real UAT switching here proves unscoped → the same phone-created organization and reselection; switching between two organizations and inactive-member live rejection remain unverified. Local workerd covers scope mismatch, member/inactive/unknown/multiple-role refusals, provider outage, concurrent creation, response loss and reconciliation; those tests do not substitute for real cloud fault injection.

Physical phone/camera, Android, VoiceOver/theme/text matrix, signed identity events/reconciliation, immediate access-JWT revocation, deployment interruption recovery and final Human acceptance remain separate T1 gates. No T2/Prod release and no merge.
