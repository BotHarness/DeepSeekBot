---
Status: Accepted
Date: 2026-11-21
---

# ADR-0358: Apply Count counts PersonaBots, without anti-abuse

## Context

A Marketplace Avatar shows how many PersonaBots it has been applied to, and its Hot and Rising Marketplace Rankings use that count. The Install Receipt for Bots counts once per Host. Creating a PersonaBot is cheap, so one Host can make the Apply Count of an Avatar much larger.

## Decision

The Apply Count counts distinct PersonaBots, not Hosts. The Marketplace removes duplicates using a SHA-256 of the existing random Marketplace Host ID together with the PersonaBot ID. Like an Install Receipt, the Host reports once, asynchronously, after the Avatar write succeeds. Failures are not retried, and there is no Worker-issued receipt credential, separate HMAC secret or persistent retry queue. We accept that one Host can make the count larger, and that a lost report means a missed count.

## Considered Options

- **Once per Host, as Install Receipt does.** This is harder to inflate, but it does not show how many Bots use an Avatar, and that number is what we want people to see.
- **An HMAC key per Host, Worker-signed receipts, a transactional retry queue.** This counts accurately after crashes and backups. It added a lot of Host and Worker machinery to protect a number that we decided does not need protecting.

## Consequences

- A PersonaBot re-created on another Host, or imported on its own, counts again. Restoring from a backup keeps its ID and is not counted again.
- Before rankings or the count are used for rewards or anything else at stake, this decision must be revisited. Changing the deduplication key later cannot recover what the old counts mean.
