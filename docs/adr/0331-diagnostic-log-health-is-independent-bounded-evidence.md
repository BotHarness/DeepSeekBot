---
Status: Accepted
Date: 2026-11-13
Issues: [#4055](https://github.com/BotHarness/DeepSeekBot/issues/4055)
---

# Diagnostic log health is independent bounded evidence

The application-defined diagnostic log owner cannot record its own storage failure solely in `logs.db`. An empty export also cannot prove that the runtime was healthy. Existing log-store recovery can retry a write or rebuild an unreadable log, so observing only final write failure misses an evidence gap.

The diagnostic Plugin/Fiber owns a metadata-only `diagnostic-health.json` beside `logs.db`, independently of SQLite. It records enumerated open/write causes, known lost-event lower bounds, observation start, last successful write and at most 32 failure/loss/recovery transitions. Adjacent identical phases coalesce; evicted transitions have a counter. Raw errors, payloads, credentials and paths never enter this sink. The file is atomically replaced from one bounded temporary file, accepts at most 16 KiB on read, and is not business data or Session Persistence. Existing log retention and reset policy remain unchanged.

The log database reports failures before its existing retries/rebuilds through an optional nonthrowing observer. Reset attempts have a distinct phase and counter; failure observations and reset-attempt counters survive transition eviction. A successful retry is a failure observation, not a proven dropped batch. The diagnostic writer counts the actual queued events only on final failure, counts queue overflow separately and records recovery after a successful batch. Existing Client dropped/rejected/rate facts and overflow rows remain the evidence for their own loss; exports reference those facts rather than manufacturing replacement events. Direct module and Host-warning rate losses use bounded health counters. The diagnostic owner opts into strict primary reads, so a live query failure becomes an explicit unavailable result instead of an empty log; other log consumers keep their existing read behavior.

The live writer retries a failed initial open only when flushing an ordinary batch. No recovery timer or replay queue is added. Health updates flush with the existing writer or an export; their errors never log recursively and cannot fail application work. When the sidecar also fails, live exports label its snapshot `memory-only`; offline readers label absent, unreadable or oversized health `unavailable`. All coverage remains `unknown`: retained counters are lower bounds, and no sidecar can prove what happened before observation, after a crash, or while both sinks were unavailable.

Existing log lists, log ZIPs and bug-report ZIPs carry explicit completeness metadata. Unreadable/missing primary logs produce a marked partial package with available health evidence, never fabricated rows. Offline readers open SQLite read-only, do not retry/reset it or write health, and preserve original files. Human UI downloads and CLI use the same builders. `hours: 0` records deliberate Human omission. There is no upload or new permission boundary.

This is reversible by reverting the observer and export additions; existing diagnostic files may remain as inert local metadata. The hot path adds constant-size counter updates, and disk writes remain bounded by ordinary flush/export frequency rather than event volume.
