---
Status: Accepted
Date: 2026-10-02
---

# External group collection is separate from wake

## Decision

Messaging owns an immutable sequence of group reception policy revisions for each authorized PersonaBot/account fingerprint/exact Chat grant. The built-in revision collects only verified mentions. Human Profile controls and the owning Orchestrator's scoped `bridge_group_policy_list` / `bridge_group_policy_set` tools can select ordinary text collection independently from its wake mode: immediate, count/time digest, same-group mention context, or silent. Editors cannot authorize a new account or group through a policy change.

Enabling ordinary collection requires a real ordinary event delivered by the current verified exclusive Provider Consumer. An excluded probe records only a bounded lifecycle diagnostic and an in-memory verification flag, never its message content or a Source Event. Verification resets with a receive lease or Host restart; the saved policy remains durable. Until verified, the UI explains that platform group-message permission and a non-mention test are required. Existing saved collection is not silently downgraded, and delivery gaps are not represented as success or backfilled.

Each newly admitted event atomically commits its canonical Source Event, optional existing Channel placement and the receiving Bot's own Inbox Admission before acknowledgement. The Admission retains the exact Messaging policy revision and its ordinary count/time thresholds, alongside the existing source-policy revision. Changes affect future admission only. Provider redelivery preserves old source identity, admission and policy; policy edits do not fetch or backfill previously excluded history.

The application-defined Bot Runtime reuses canonical pending Admissions and its existing bounded harvest, count/time scheduler, Agent Scope and Orchestrator lifecycle. Ordinary immediate and digest arrivals queue at a turn boundary and never steer an active model or tool step. A verified mention keeps its existing steer/turn source policy and can include pending digest/mention-context items from that same grant; silent items require an explicit source read. Successful observation settles only included Admissions. Restart rebuilds readiness from retained revisions and pending facts without a second queue or Inbox authority.

Collection, wake, observation and external reply are separate decisions. No message requires an acknowledgement or reply. Any external effect still uses the Bot's own current identity and checked original source route; internal messages are not mirrored to the platform. This slice does not fan out ordinary Admissions to other local Channel members (#638), follow topics (#614), synchronize recalls, or claim support for another provider's delivery behavior.

## Why

A single all-or-mentions wake switch conflates what is retained with when the Bot should reason. Copying external traffic into a Human DM or introducing a second shared Inbox also changes conversation meaning. Recording policy at admission preserves auditability across edits and restarts, while reusing harvest respects current steer/turn boundaries.

## Platform boundary and recovery

These policies and records are BotHarness application contracts, not new DSH Agent Inbox semantics. The pinned qualified dsh-im Provider already transfers ordinary Lark text through its exclusive receive capability; no provider fork change is needed for this tracer. Generally useful account, checked send/reply and receive/history capabilities remain candidates for upstream dsh-im PRs.

Operational schema generation 46 adds an immutable `messaging_group_policy_revisions` table without rewriting existing sources. Older binaries refuse the newer schema. Downgrade requires a pre-upgrade database backup; otherwise use forward recovery. Turning collection back to mentions affects future arrivals and preserves retained history.

References: [#613](https://github.com/BotHarness/BotHarness/issues/613), [#629](https://github.com/BotHarness/BotHarness/issues/629), [ADR-0106](../decisions/im-providers.md#adr-0106), [ADR-0108](../decisions/im-providers.md#adr-0108).
