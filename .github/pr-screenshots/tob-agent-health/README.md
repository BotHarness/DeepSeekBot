# T3 fixed health check — native UAT evidence

- Runtime: `8586130e5303d100e47f9f29d91e3e8cf1556012`; batch later fast-forwarded to `81b98eafc` for three inherited evidence JSON formatting changes only (no runtime changes).
- Installed SDK58 native binary: `494a20f1eb4f0666a2c90bc3c758af4e7ff5f46b`; no native inputs changed, no rebuild.
- TOB service: `23db30d9e34b8c51c72909b0a118e23d7dccf70e`, UAT version `eb945fb5-c38b-44de-8f28-dc90f17112af`, D1/Org/Channel schemas5/4/4.
- One assigned iOS Simulator; synthetic B is an ordinary organization member. Authentication fixture uses a real independent WorkOS UAT session; this is not new Hosted AuthKit/browser qualification.

## Observed path

1. Owner CLI provisioned a dedicated Agent in the shared workspace's health-mobile channel. Its local operator explicitly allowed B.
2. B tapped **Request health check**. A separate Node reference process read the public UAT channel, obtained current authorization, persisted its execution/result state, and returned platform/architecture/runtime with executionCount1. A fresh process replay reported executionCount0; server history contained one result for that request.
3. The local allow-list was cleared. B tapped the same action at maximum Dynamic Type; the next request produced LOCAL_POLICY_DENIED and executionCount0. Owner CLI independently read exactly two requests/two correlated results, with actual B and Agent authors.
4. Six default/intermediate/maximum × light/dark states exposed a reachable request action; owner creation controls were absent for B. No new text input was added. Large text scrolls long IDs and result text; screenshots05/06 show consecutive portions.
5. Cold restart, actual UI refresh and reload retained the same session/workspace and result history. Phone own logout was independently verified revoked, its latest refresh token rejected, local session cleared; A/B CLI sessions remained usable.

## Files and limits

- 01/02: member Agent and request acknowledgement; 03 is the initial history viewport (result body below the fold), 04 shows completed result.
- action-*: six request-control states;05/06 show maximum-text denial;07 shows denial after restart;08 signed out.
- Short videos01/03 show requests,02 the initial history load,04 scrolls to the retained result after restart. None records login credentials or token values.
- JSON files contain only bounded assertions; source49workerd/37Node/2wizard and mobile629passed/8skipped are separate evidence categories.

First failures retained in task history: initial CLI fixture selected an organization B had not joined and was correctly denied; first deploy smoke timed out/failure without detailed classification, subsequent read-only smoke passed; mobile suite sandbox loopback EPERM resolved by permitted local listening; coldstart selector fired before UI ready; checkpoint during active history request returned SESSION_BUSY and later passed; inherited three evidence JSON files failed CI formatting, corrected without runtime change. Do not reinterpret those first attempts as successful.

Own test Agent revoked and verified-revoked phone fixture removed. Light/large restored, own app/driver/Metro stopped, Batch18 released; shared resources preserved. UAT only, no Prod/merge.

Not qualified: Android, physical phone, Human QA, new Hosted AuthKit, WebSocket, DSH adapter, model work, two isolated Hosts or arbitrary side effects. T3 and overall goal remain open.
