---
Status: Accepted
Date: 2026-10-10
Issues: [#1315](https://github.com/BotHarness/DeepSeekBot/issues/1315)
---

# Live CLI verbs ride the DSH HTTP unary carrier, never the database

Offline CLI verbs stop at the profile writer lease: while the Host runs, every direct store access fails coded (`lease-unavailable`, proven live). Live verbs (send, approvals, IM authorization) therefore need a way to talk to the running Host. We decided that **live verbs use the DSH HTTP unary carrier — `POST /api/<endpoint>` with the bridge method name — with a token-to-cookie login per invocation, and never touch the operational database directly.**

## Decision

- **Carrier: plain HTTPS fetch against `/api/<endpoint>`.** The envelope observed live and documented upstream is `{type: 'client-request', rpcId, method: 'botharness/<verb>', payload: {args}}`; the endpoint must equal the method. No new local socket, no DSH client library vendored: Node fetch plus JSON is the whole client.
- **Use the owning endpoint.** P2 invokes existing BotHarness Bridge methods. P3 IM application authorization invokes the existing Provider-owned `dsh-im/app-setup` endpoint on the same carrier, with its native `{method, payload}` envelope. Messaging target grants are a separate application-defined capability. [ADR-0161](0161-cli-im-authorization-keeps-provider-attempt-authority.md) qualifies that seam.
- **Auth per invocation, token never in argv.** Each Host process mints a random launch token (logs/journal only, rotates on restart); `GET /?token=` exchanges it for an authority-bound signed cookie, and the HTTP carrier accepts no other credential form. The CLI takes the base URL from `--host` and the token from an environment variable or `--token-file`, logs in fresh on every call, and treats 401 as coded `host-unauthorized` (operator refreshes the token). The token is never logged, echoed, or persisted by the CLI.
- **Trust boundary unchanged.** Loopback or tailnet TLS only; the CLI sends no `Origin` and adds none. A tailnet name must be one of the Host's `--trusted-host` authorities, because DSH's `/api` Host fence applies after login; the CLI reports that refusal as `host-untrusted`, not as an expired token. Provider endpoints retain their own stricter locality policy. Ordinary payloads carry no credentials; ADR-0161 permits stdin-only IM credentials and verification codes solely in the Provider's authenticated, purpose-bound submission payload. Neither argv nor stdout carries those secrets.
- **Concurrency by statelessness.** The writer lease stays Host-held; the CLI keeps no session, so concurrent callers are independent invocations. The gateway does not globally serialize async RPCs: owner-specific revision/HEAD guards, receipts and idempotency govern concurrent mutations, as clarified in [ADR-0162](0162-online-cli-management-keeps-explicit-host-authority.md). Transport failures (refused/timeout) surface as coded `host-unreachable`, distinct from bridge and `gateway/*` codes, which pass through with their prefixes intact.

## Considered Options

- **New local socket for CLI↔Host:** rejected. A second listener is a second attack surface duplicating a documented, E2E-proven carrier.
- **Direct database side-channel while the Host runs:** rejected. Proven to fail (`lease-unavailable`); bypassing the lease would corrupt the Host's writer guarantees.
- **Vendoring the DSH gateway client:** rejected. The unary envelope is stable JSON over fetch; a library buys nothing until streaming verbs are needed.
- **Persisting the cookie/token in a CLI config file:** rejected. Tokens rotate per process and live in logs already; a cache adds stale-credential failure modes for zero gain since login is one cheap request.

## Consequences

- P2/P3 verbs are thin RPC wrappers plus the existing machine contract; their tests run against a live isolated Host like the E2E probes that proved this path.
- If DSH ever ships a stable token file or CLI credential helper, only token acquisition changes; envelopes, codes, and the secret rules survive.
- Streaming verbs (live reply tails, event follows) stay out until needed; when they arrive they ride the gateway mux, still not a new socket.
