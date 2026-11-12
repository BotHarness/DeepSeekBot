# ADR-0318: Steering delivers input first and scans Memory off the Host thread

- Status: Accepted
- Date: 2026-11-10
- Issue: #3895 (amends ADR-0092)

## Context

ADR-0092 scans a Bot's Memory repository before local DM or Group-mention input steers an active turn, and delivers any new Memory change with that input. The scan ran Git synchronously on the Host's main thread. On Windows each Git start blocks the calling thread for 0.4–1.7 s, and the scan starts several. In a real call, where every sentence the Human says while the Bot works is a steer, these scans froze the Host for about 19.5 s over 3.7 minutes, long enough for the call to stall.

## Decision

Steering no longer waits for the Memory scan.

1. The input is steered at once, together with Memory changes already admitted and still unobserved.
2. The scan then runs through the asynchronous Git runner. It still runs when the steer is refused, so an edit made while the Bot works is not attributed to the Bot's turn.
3. When the scan admits a new change while the same turn is active, the Host steers it as its own message at the next safe step. Admission, observation and settlement rules of ADR-0092 are unchanged: only a delivered steer marks the change observed, and a refused one leaves it pending for the next turn.
4. Steers that arrive during a scan coalesce into one more scan after it. Before the turn reconciles or aborts Memory, it waits for the scan to finish.
5. A failed scan no longer fails the steered input. The turn keeps its observation baseline, and the next pre-turn scan picks the change up.

## Consequences

- A Memory edit made during a turn reaches the Bot one steer later than the input that triggered the scan, usually within a second or two.
- While a steer scan runs, other Memory operations on that Bot report `memory-conflict` ("Memory observation is in progress"), as they already do during pre-turn and post-turn work. This includes the Bot's own branch tools.
- Startup reconciliation still scans synchronously; it runs before calls exist.
