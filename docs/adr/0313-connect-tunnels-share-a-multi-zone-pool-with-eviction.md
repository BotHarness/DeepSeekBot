---
Status: Proposed
Date: 2026-11-09
Issues: [#3848](https://github.com/BotHarness/DeepSeekBot/pull/3848)
---

# Connect tunnels share a multi-zone pool with eviction

Amends [ADR-0241](0241-hosted-connect-reaches-the-host-through-a-managed-tunnel.md) decisions 5 and 6.

## Context

On 2026-11-09 the production relay had 205 tunnels and `deepseekbot.dev` held 200 of 200 DNS records. Only 50 tunnels were online.

- **The real ceiling was DNS, not tunnels.** Cloudflare allows 1,000 tunnels per account ([account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/)), but a free zone created on or after 2024-09-01 holds only 200 DNS records ([DNS FAQ](https://developers.cloudflare.com/dns/faq/)). `deepseekbot.dev` was created on 2026-10-09.
- **Reclamation released the tunnel but kept the CNAME.** 90 of the 197 tunnel CNAMEs pointed at deleted tunnels. Every Host that had ever linked kept one record, so the zone filled with Hosts that were not online.
- **Online Hosts had no hostname.** 22 healthy tunnels had no DNS record at all, so no phone could reach them.
- **Tunnels outlived the cleanup.** 121 tunnels had been `down` for more than ten minutes, most for more than a day, although reclamation deletes after five. Meanwhile 13 Hosts were recreated about 100 times a day each.
- **Status reads did not scale.** Every `GET /v1/hosts` called the Cloudflare API once per Host. Each Host lists its account every minute, so 1,000 Hosts would need about 5,000 calls per minute. Cloudflare allows 1,200 per five minutes.

## Decision

### 1. A record lives exactly as long as its tunnel

The CNAME is created with the tunnel and deleted with it, whether the tunnel is reclaimed, evicted, unlinked or found missing. The hostname `<host-id>.<zone>` stays deterministic, so the next provisioning recreates the same name. Phones keep a working saved route because the record returns as soon as the Host is back.

Records used now equal tunnels live now, so each zone holds about 195 live Hosts, not 195 Hosts ever linked.

### 2. Lifecycle states and the reconciler

The relay's D1 row is the authority. A once-a-minute reconciler compares it with one tunnel listing (`per_page=1000`) and one CNAME listing per zone, and repairs any difference. Each action is idempotent, so a missed cron run, a relay restart or a half-finished request is fixed by the next run.

| State                    | Row                           | Tunnel                | Record                    | Reconciler action                                               |
| ------------------------ | ----------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------- |
| Linked, idle             | no tunnel                     | none                  | none                      | none                                                            |
| Online                   | tunnel T, record D            | T healthy or degraded | D → T                     | none                                                            |
| Offline, recent          | T, D                          | T down < window       | D → T                     | none                                                            |
| Offline, due             | T, D                          | T down ≥ window       | D → T                     | delete T and D, clear row                                       |
| Never connected          | T                             | T inactive ≥ window   | D or none                 | delete T and D, clear row                                       |
| Tunnel vanished          | T                             | absent from full list | D or none                 | delete D, clear row                                             |
| Online without record    | T, no D or a deleted D        | T online              | none                      | recreate D                                                      |
| Record points elsewhere  | T, D                          | T                     | D → other                 | repoint D to T                                                  |
| Orphan record            | no row, or row without tunnel | any                   | `<host-id>.<zone>` CNAME  | delete D once it is older than the window                       |
| Duplicate record         | T, D                          | T                     | a second CNAME, same name | delete the one the row does not hold                            |
| Orphan tunnel            | no row references it          | `dsb-*`               | any                       | delete T once it is older than the window                       |
| Unlinked, revoked        | row deleted                   | deleted first         | deleted first             | a failed step leaves the row; the request or reconciler retries |
| Account deleted          | rows deleted                  | as unlink             | as unlink                 | as unlink                                                       |
| Provisioning, DNS failed | T just created                | T                     | none                      | the request deletes T and clears the row before it answers      |

Only names of the form `h<12 base32>.<connect zone>` and tunnels named `dsb-*` are touched. Other records and tunnels in the account are left alone.

The window is `RECLAIM_AFTER_MINUTES` (default 5). It also protects a provisioning request that has created a tunnel or record but not yet written the row.

Each run spends a bounded budget of Cloudflare calls (`RECLAIM_BUDGET`, default 30), within the Workers Free limit of 50 subrequests. It works in this order: forget vanished tunnels, repair online Hosts' records, reclaim offline tunnels, delete orphan records, delete orphan tunnels. A step that fails stamps `cleanup_at` on its row. The next run takes rows by `cleanup_at`, oldest first, so a permanently failing row cannot block the queue.

The same run caches each tunnel's status in the row (`tunnel_status`, `tunnel_inactive_since`), writing only on change. `GET /v1/hosts` and eviction read that cache instead of calling Cloudflare.

### 3. Zones form one pool

`CONNECT_ZONES` lists every Connect zone as `name=zone-id`, comma-separated, default zone first. Each zone holds at most `ZONE_RECORDS` tunnel records (default 195, leaving room for the apex and verification records). `MAX_TUNNELS` (default 900) caps the whole account. `MAX_HOSTS` (default 3, was 5) caps the computers one account can register, so each computer holds one tunnel and one account holds at most three; a fourth answers `409 host-limit` until one is removed. Phones never hold a tunnel: they reach a paired computer through that computer's tunnel. Accounts already above three keep their Hosts; the cap applies to new registrations.

A Host's zone is fixed the first time it gets a record and is kept in `hosts.zone`. Legacy rows read as the default zone, so no existing hostname changes. A new Host gets the zone with the most free records.

A Host lists the zones it accepts (`{ "zones": [...] }` on `POST /v1/hosts/{id}/tunnel`), and the relay places it only in one of those or the default zone. Older Hosts, and phones older than the release that recognises the extra zones, accept only `*.deepseekbot.dev`. So the extra zones are switched on in configuration after that phone and desktop release ships. Every Connect zone is dedicated to Connect, like `deepseekbot.dev` (ADR-0241 decision 6), because clients treat every name under it as a Connect route.

### 4. Eviction when the pool is full

When provisioning finds no free tunnel under `MAX_TUNNELS`, or no free record in the Host's zone, the relay scores the live tunnels that would free the needed slot (any zone for the tunnel cap, the same zone for the record cap) and evicts the first one:

1. **Gone.** The cache says the tunnel no longer exists.
2. **Offline.** Down or never connected for more than `EVICT_OFFLINE_GRACE` (2 minutes), longest offline first. They would be reclaimed soon anyway, so taking them early costs nothing.
3. **Idle online.** Online, past its guaranteed time (below), not used within `EVICT_PROTECT_MINUTES` (30), and used less recently than the requester. Least recently used first. On ties, a Host whose account has more live tunnels goes first, so one account's spare computers make room for another account's only one.

**Guaranteed time.** A tunnel that came online is never evicted for its first `EVICT_FRESH_MINUTES` (30) after it was created, whatever its use. Without this, a Host could connect, sit idle for a minute and lose its tunnel to the next arrival, and Hosts would push each other out in turn. 30 minutes matches the protection window, so the rule a person needs to remember is one number: a computer keeps its tunnel for at least 30 minutes after connecting, and for 30 minutes after its last use. A shorter 10-minute guarantee was considered; it frees slots faster under pressure but lets an idle Host lose its tunnel before the person has finished pairing a phone. Offline tunnels are not covered, because nobody is using them.

Online Hosts inside the guaranteed time or used within the protection window are never evicted. If no candidate qualifies, the request answers `503 relay-full` and the Host joins the waiting queue (section 5).

**Last use.** `hosts.last_used_at` records the last time the Host was used, from three sources:

- the relay sees a phone act for that Host (pairing offer, Live Activity registration);
- the Host links for the first time;
- the Host reports the age of its last Connect gateway request on its once-a-minute account check (`GET /v1/hosts?host=<id>&idle=<seconds>`, 0 while a channel is open).

The relay writes the value only when it moves forward by more than a minute, which bounds D1 writes to Hosts that are actually used.

A brand-new Host's last use is the moment it links. An evicted Host keeps its old last use, so when it retries it cannot evict a Host that was used more recently. That stops two idle Hosts from evicting each other in turn. It returns when a slot frees, or when a phone acting for it makes it the more recently used one.

An eviction deletes the tunnel and record, clears the row, sets `evicted_at` and logs `connect-evicted` with the reason and tier. The Host sees its tunnel fail, retries on its next minute and gets `503 relay-full` until it may return.

### 5. Waiting queue and what the person sees

When every slot is taken and every tunnel is protected, Hosts wait in one first-come queue. A refused Host gets `waiting_since` (kept across retries) and `refused_at` (each retry). A Host that has not retried for 3 minutes has left the queue. When a slot frees, only the Host that has waited longest may take it; the others get `relay-full` with reason `queued` and their position. A Host that needs a slot can still evict an idle tunnel without queueing, because it is the more recently used one.

The relay answers `503 {error: {code: 'relay-full', reason, position, retryAfter: 60, pool}}`, where reason is `pool-full`, `zone-full` or `queued`, and `GET /v1/hosts` returns `pool` with `capacity`, `inUse`, `free`, `waiting`, `guaranteedMinutes` and, when nothing is free, `nextFreeAt`: the earliest moment any live tunnel leaves its guaranteed time and protection window. Each online Host in the list carries `protectedUntil`, the earliest moment its own tunnel could be given away. Both are estimates: a Host used in the meantime pushes its time back.

The Host keeps these in its Connect status (`relay-full` with `recovery: automatic`, `wait` with `since`, `pool`, `protectedUntil`), retries every minute on its own and never asks the person to sign in again. `deepseekbot connect-status` shows the same fields. The Tobs Connect screen answers the four questions a person has:

| Question                     | Shown                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Why can't I connect?         | "All shared tunnels are busy", with the pool counts                                            |
| When will I get in?          | Place in line, waiting since, and the earliest time a tunnel can free up                       |
| Will I be dropped?           | While the pool is full, "keeps its tunnel until at least …", and that phone use extends it     |
| What happens when I connect? | The rule: 30 minutes guaranteed, then offline and least recently used computers give way first |

**Comparison with cloud-gaming queues.** Cloud-gaming services face the same problem: a fixed pool of servers and more players than seats. GeForce NOW's free tier queues players, shows the place in line, gives each session a fixed length (one hour on the free tier) and then sends the player back to the queue; paid tiers skip the queue. Players commonly see an estimated wait while queued, and many services warn an idle player before disconnecting them. We take the place in line, an earliest-free estimate, a guaranteed minimum and a visible "kept until" time, which plays the role of the idle warning. We do not take a hard session cap: a Connect tunnel is a phone's route home, and cutting an active one on a timer breaks the person's work for no gain, because an actively used Host is exactly the one that should stay. We do not add paid priority tiers now; the queue and eviction order leave room for a priority field later.

### 6. Request cost

Every Host reads `GET /v1/hosts` once a minute, so the pool numbers are read far more often than they change. The relay keeps their cost flat:

- **Pool status is cached for 30 seconds** in each Worker isolate and dropped whenever that isolate creates, clears or deletes a tunnel. The two counts and, when the pool is full, the scan for `nextFreeAt` run at most twice a minute per isolate instead of once per request.
- **A full pool is not rescanned on every refusal.** When no tunnel qualifies for eviction, the relay remembers the earliest time one can (the same `nextFreeAt`, capped at one minute) and refuses later requests before then from the queue count alone. That time does not depend on the requester, so no Host is refused that the scan would have served.
- **Queue and reconcile reads use partial indexes** (`hosts_waiting`, `hosts_reconcile`, migration `0007`). Place in line and the waiting count read only waiting rows. The minute reconciler reads only rows that hold a tunnel or a record, not every linked computer.
- **Reads are rate-limited.** `GET` has its own `CONNECT_READ_LIMIT` of 60 per minute per account, beside the 20 per minute on `POST`. Requests without a valid token are refused before any D1 read.
- `last_used_at` is written at most once a minute per Host, and only when the reported use moved.

## Consequences

- Capacity is bounded by live tunnels. With five dedicated zones it reaches about 975 records, so `MAX_TUNNELS` (900) becomes the limit again, as ADR-0241 intended. Pricing is still decided near 800 concurrent Hosts.
- An evicted Host has no remote route until it returns. LAN and Tailscale routes are unaffected.
- Hosts and phones from before this change report no use, so they look idle and are evicted first when the pool is full. This favours updated clients and is accepted.
- Extra zones cost a domain each and must hold nothing else.

## Considered options

- **Keep one zone and buy Pro.** Pro allows 3,500 records per zone but costs about $20–25 a month per zone, and does not fix records left behind by deleted tunnels.
- **Move a Host to another zone when its own zone is full.** This changes the hostname a phone has saved and needs the Host to reach the phone first. Rejected in favour of sticky zones and eviction within the zone.
- **Fixed session length, as in cloud gaming.** Fair under heavy load, but drops Hosts in active use. Rejected; idle Hosts give way instead.
- **Count usage from Cloudflare analytics.** Per-hostname request counts need GraphQL analytics calls per run and are delayed. The Host already sees every gateway request, so it reports the age of its last one instead.
