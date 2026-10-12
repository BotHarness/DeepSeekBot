# Request private input from IM and complete it in Web Chat

An opt-in protected Profile can accept an authorized IM request, ask its Owner for confidential fields in the existing PersonaBot Web DM, consume their references under existing execution approval and reply to the original IM conversation with a nonsecret result. The first real-provider qualification is a Lark QA2 DM. This does not add native IM secret forms or qualify arbitrary CLI/MCP consumers.

Follow the [CLI qualification guide](private-input-cli.md) for the isolated Linux execution boundary and native credential storage. Configure an independent [test App](../../agents/im-test-apps.md) and bind it to a real PersonaBot using the existing qualified Provider. Do not start another receiver for an App already used by another Host. Keep QA1 and production Profiles separate.

In that isolated Profile's existing `botharness-core` patch, set:

```yaml
- id: botharness-core
  config:
    privateInputExecution: true
    privateInputWebUrl: http://127.0.0.1:31393
    telemetry: false
```

Use a Web origin the Owner can actually reach. Do not include a login token, userinfo, query or path. Build and restart only the task-owned Host with the pinned development launcher and qualified IM Provider.

### A server accessed through Tailscale

The card fragment is generated for each request; the base origin is explicit Profile configuration, not inferred from an IM sender, browser request or local listener port. For a Tailscale deployment, set `privateInputWebUrl` to the existing Owner-reachable HTTPS origin, for example `https://<machine>.<tailnet>.ts.net` with actual values kept in the machine-local Profile. Keep the DSH Host loopback-bound behind the existing reverse proxy. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) exposes a local service within the tailnet and applies its access control rules; the Owner's device must have the required tailnet access.

Verify that DSH trusts that exact proxy hostname using its existing configuration, that the native authenticated `/api` works and that an actual Owner can open and submit a card through that origin. A reachable tailnet address and a card locator are not Host Owner authentication. If the machine name, tailnet domain or proxy port changes, update the Profile's base origin before creating new notices; previously sent links retain their old origin. No Tailscale, proxy or production-server configuration is changed by setting up this local acceptance run. Final Linux/proxy qualification is tracked by #1386.

### Run the controlled service

```powershell
node scripts/ask-secret-lifecycle-fixture.mjs 31394
```

Send in the designated test DM:

```text
[IM-PRIVATE-A] Call ask_secret for account im-demo with required fields
endpoint (Private URL), api_key (API key), api_secret (API secret).
Wait for Owner submission in Web Chat, then call protected_cli using
http-status-v1 and the returned references. Use bridge_reply to report
only HTTP status and success in this conversation. Do not collect or
send private values, references or configuration details in IM.
```

The Host should reply with a Web card locator. It must contain no login token, secret or credential reference. Open it in an already authenticated Owner Web Client: Bot mode should select the existing Chat and show the actual request card. A new tab exercises initial locator navigation; changing only an already-loaded page's fragment is not currently a navigation subscription.

Fill only that private component:

| Field       | Synthetic value                                             |
| ----------- | ----------------------------------------------------------- |
| Private URL | `http://127.0.0.1:31394/status?marker=SYNTHETIC-1380-url-A` |
| API key     | `SYNTHETIC-1380-key-A`                                      |
| API secret  | `SYNTHETIC-1380-secret-A`                                   |

Submit privately. Inputs clear and ordinary Chat records only configured state. The existing execution approval must show `http-status-v1`, the account and opaque field references. Allow once, confirm the original IM reply reports HTTP 200 and success, and check `GET /evidence` on the controlled service independently records authenticated completion. The Owner CLI may instead submit JSON through `ask-secret-submit --values-stdin`; the locator does not grant authority to the IM sender.

Repeat with the configured account: references may be reused without another private card. A turn with several accepted IM sources must explicitly select the actual source in `ask_secret.source_event_id`. Unknown or historical sources fail. If distinct sources select the same account in that turn, consumption refuses the ambiguity. No ordinary message or attachment is a private submission fallback.

For regression, change or revoke the receiving Binding while a card is pending; the old card must expire and authenticated late submission must fail. Stop the Bot or change Session authority with the same result. During a delayed consumer call, revoke account access or Source authority; the Host attempts to stop the consumer and refuses stale result delivery. If the Provider already began sending, effects may be uncertain. A notice delivery failure expires the live request without automatic retry. Existing Owner rotation/revocation and Schedule reuse remain governed by their current authorities.

Inspect the native Session through [the public-safe exporter](../../../scripts/export-private-input-evidence.mjs), which retains the declared field IDs, configured references, approval decision and bounded CLI status. Full Session text and raw request bodies remain local. Capture actual model request bodies with `ask-secret-wire-probe.mjs` using synthetic canaries and report capture availability, count and byte coverage. Scan retained Sessions, Chat/approval facts, developer logs and Spill; a zero-match result proves only the named canaries and stated snapshot surfaces. Correlate the actual visible IM reply with its canonical Source Event, handled Admission and both notice/final Outbox receipts. See [ADR-0172](../../adr/0172-im-private-input-keeps-owner-web-authority-and-source-reply-fences.md).
