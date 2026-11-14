# ADR-0338: Connect DNS recovery stays inside the request

Status: Proposed for [#4189](https://github.com/BotHarness/DeepSeekBot/issues/4189). Runtime acceptance and deployment are separate gates.

## Decision

Node Host/CLI connections to an official Connect or Quick Tunnel hostname first use the system lookup. Only ENOTFOUND may trigger one fresh IPv4 query using Node's configured DNS servers. The existing Quick Tunnel lookup owns this policy, extracted into a shared adapter. Other hostnames, successful answers and IPv6-only lookups retain their original behavior. Queries have a1500ms timeout and one try per configured server, inside the existing connection deadline. No background polling or persistent address cache is added.

Recovery changes address resolution, never trust. HTTPS keeps the original hostname, certificate validation and trust roots; encrypted channels keep the existing Host key pin and account/device admission. HTTP identity recovery applies only to a credential-free GET of the exact official HTTPS public channel. Other HTTP methods, headers, origins and paths retain normal fetch. The existing identity reader caps the body at4KiB and respects cancellation; redirects are not followed.

The public self-check reports `dnsRecovery: fresh-query` only after TLS and the pinned Noise handshake succeed. The Web/Desktop card and CLI report that observation. It does not mean the OS cache was repaired, other apps recovered, or every phone network can reach the Host. Failed direct queries preserve the original DNS failure. We never run sudo, flush global caches, change DNS servers, toggle VPN settings, weaken TLS or replace paired keys from product code.

## Mobile scope

Native iOS/Android DNS and socket implementations are unchanged. An unpaired account computer is shown as available to try, not online/offline based on the service observation; tunnel-allocation waiting remains distinct. A paired computer keeps its actual HostClient status. Workspace foreground refresh follows the existing account owner, coalesces bursts and discards responses after disposal/account changes. A failed same-owner refresh retains cached entries alongside a bounded diagnostic and retry; uncertain credential ownership clears entries. No second account/directory persistence is introduced.

Network errors retain recognized safe causes from the outer error or its immediate cause. Codes distinguish DNS/TLS/timeout/refusal without copying hostnames, tokens or raw messages. Directory, identity/offer, encrypted pairing and Feed remain separate acceptance steps; a directory listing is not evidence of an admitted Feed.

## Trade-offs and verification

Node Resolver does not implement every platform's scoped-resolution rule. Recovery is limited to official public tunnel names and never selects a hardcoded public DNS service or tries to resolve arbitrary internal names. IPv6-only negative lookups and native mobile cache repair remain outside this slice. The fallback can improve application requests while the OS still returns a negative answer; that distinction is visible in diagnostics.

Tests guard normal-path zero extra queries, hostname scope, failed fresh queries, cancellation/TLS limits, successful recovery receipts, opaque error causes, account isolation and bounded foreground refresh. Runtime verification must show an actual public pinned channel/Feed, with fault-injection or negative-cache provenance stated explicitly. A controlled recovery does not establish the original reporters' root cause. Changes to source imports/closures add no periodic work; the only added network work is the bounded DNS query on a miss and foreground directory refresh.
