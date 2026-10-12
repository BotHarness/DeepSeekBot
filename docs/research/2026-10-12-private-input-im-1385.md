# IM private input: Lark QA2 qualification for #1385

Issue: [#1385](https://github.com/BotHarness/DeepSeekBot/issues/1385), under [#1378](https://github.com/BotHarness/DeepSeekBot/issues/1378). This report records actual local acceptance separately from subsequent source-fence regression checks. It does not qualify a production deployment or every IM platform.

## Observed behavior

The Human authorized an independent QA2 Lark App, isolated Host and designated private conversation. QA1 remained owned by another session. The browser had two signed-in Human accounts in one organization; the Human switched to the account containing QA2 before the agent sent the uniquely marked `QA2-1385-A` request. See the [AX account-selection procedure](../agents/ax-browser.md#im-qa-with-two-human-accounts-in-one-organization).

The actual PersonaBot requested `endpoint`, `api_key` and `api_secret` for a synthetic account. A static IM notice opened the existing Owner Web DM at its private-input card. The Owner component accepted all three synthetic fields and cleared them after submission. Existing execution approval displayed opaque references and was allowed once. The real `protected_cli` consumer `http-status-v1` authenticated against the local controlled service and returned HTTP 200. `bridge_reply` delivered only HTTP status and success to the original Lark private conversation. The Human accepted the interaction.

The runtime used pinned DSH `0.2.0-rc.1`, model `opencode-go/deepseek-v4-flash` and the qualified `dsh-im` Provider revision `1bf6baa8ad09b337f80f119961d10c4783ea702e`. The observed run occurred on the implementation candidate before the later rebase and review fixes. Those fixes add refusal behavior; this observation is not an exact-final-head runtime rerun.

## Native Session and independent evidence

The native Session Persistence record contained 64 events. The public-safe exporter retained nine allowlisted events, excluding message text, reasoning, commands, HTTP headers/bodies, approval reasons, paths and raw values. The decisive facts were:

| Native sequence | Fact                                                                    |
| --------------- | ----------------------------------------------------------------------- |
| 45              | `ask_secret` declares three required field IDs                          |
| 46              | Result is `configured`, with one opaque reference per field             |
| 50              | `protected_cli` consumes those references using `http-status-v1`        |
| 51–52           | Existing approval is requested, then decided `allowed-once`             |
| 53              | Consumer result is `httpStatus: 200`, `successful: true`, no tool error |

The complete native tool sequence included `channel_send`, `bridge_read`, `bridge_sender_permissions`, `ask_secret`, `protected_cli` and `bridge_reply`. Canonical persistence independently recorded one bridge Source Event, a handled Admission and two provider-accepted Outbox intents with receipts: the card notice and final result, both associated with the same Source Event. Neither Outbox text contained credential references. The controlled service separately recorded one request, one authenticated completion and no disconnected request.

Actual model request bodies were inspected by the task-local wire probe, rather than inferred only from the Session projection: nine bodies were available, totaling 845,303 bytes. The three synthetic canaries and locally retained QA App-secret canaries had zero matches. The native Session, nine persisted Chat messages, developer log tables (one schema row and nine entry rows) and two additional retained Session/Spill files also had zero matches. Raw request bodies, credentials, full Session content, private Profile data and unrelated chats remain machine-local.

These are bounded exact-canary snapshot checks. They do not establish coverage of every encoding, future request, retained file or arbitrary CLI/MCP consumer. The protected consumer boundary remains the one qualified in the [CLI guide](../dev/guides/private-input-cli.md).

## Refusal coverage and deployment limits

Focused regressions cover changed Source/Session authority, pending-card cancellation, active-consumer cancellation, account revocation and result-delivery guards. Review identified two additional races: selecting the same account from several accepted IM sources could overwrite a source association, and a pending notice could become stale while waiting for routing. The implementation now retains same-turn source associations and refuses ambiguous consumption; notices carry a current pending-request authority through the native `beforeSend` fence.

The real-provider qualification covers this Lark QA2 DM. Discord, group routing and Linux server/proxy operation are not real-provider qualified by this run. The existing four native bridge tool definitions are permitted in the protected Profile; same-name replacement definitions are rejected. No email-specific interface, IM private-value submission, pairing-policy redesign or second production receiver was introduced.

The Web base origin is explicit Profile configuration. A card's fragment changes per request; the deployment origin does not automatically follow an IM sender or listener port. For Tailscale, configure an existing Owner-reachable HTTPS origin, preserve native Host authentication and qualify the actual proxy path. See the [IM runnable guide](../dev/guides/private-input-im.md#a-server-accessed-through-tailscale). Final Linux qualification belongs to #1386 and requires its own server-change authorization.
