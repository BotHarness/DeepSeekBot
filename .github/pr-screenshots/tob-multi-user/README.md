# Ordinary-user multi-workspace UAT — 2026-10-18 JST

Native runtime `9f71dd3d9` (product source `00d9bcc6c`), compatible signed native build `494a20f1e`. Test driver checkpoints used `079832999`; only the test driver/declaration changed after the runtime freeze. Service runtime `c4c8aa44fd86dcd53650440a8350442c20420938`, Worker version `cc848bdb-d7cb-44cf-bbea-be1df39d11dc`, D1 schema 4.

Sole BotHarness e2e iPhone 17 Pro / iOS 26 Simulator, English/light, screenshots 402×874. No native rebuild, phone action, Prod or merge. The existing trusted UAT configuration was retained.

## Passed path

1. Dedicated verified ordinary-user session injected through the development-only driver, then cold restart. Check session verified the full signed identity and replayed the server-owned default workspace. Status is Signed in, without an administrator label.
2. Workspaces listed the same default and second workspace as independent CLI A. The actual mobile UI created TOB Mobile collaboration, switched to My workspace and back. Formal CLI A listed and selected that exact organization; A had three organizations, B only its own one.
3. Cold restart retained the selected organization and saved session. Actual Refresh session rotated credentials and revalidated user role. The same selected organization was restored.
4. Actual Sign out revoked only the phone session. Server session status became inactive, latest phone refresh was rejected, app persisted/in-memory credentials were absent and trusted configuration remained. Independent A and B CLI sessions still worked.

## Evidence limits and retained failures

These recordings use API-prepared synthetic authentication; they do not prove a new Hosted AuthKit/PKCE or email-delivery flow. Previous real Hosted AuthKit acceptance belongs to #2103. Owner/member downgrade coverage belongs to #2121; this run adds ordinary-user/default/multiple-workspace coverage. Channels, invitations, Agents and cross-Host transport are not implemented by this slice.

The initial service/CLI run had a network interruption at one denial assertion; a bounded repeat with the same identities/keys passed. Initial phone fixture preparation required handling WorkOS organization selection for a multi-org user; the test-only helper now selects an actual returned membership, and other challenges fail. Two CI failures (release-fragment metadata and the driver type declaration) were fixed and are preserved in run history. A driver log previously hard-coded verifiedAdmin:true; it now reports the actual verified role and false for this user.

`workspaces.mp4` is 277.625 seconds; `session-recovery.mp4` is 106.323 seconds. Both are original continuous recordings with idle/tool pauses. Contact sheets are sampled previews, not additional executions. No credentials were recorded. Synthetic users and four workspaces remain for subsequent goal slices; the phone is signed out. No Human visual acceptance or physical-device qualification is claimed.
