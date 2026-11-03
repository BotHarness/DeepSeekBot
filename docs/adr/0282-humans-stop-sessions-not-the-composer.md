# ADR-0282: Humans stop Sessions, not Bots from the composer

- Status: Accepted (design; spec #3416)
- Date: 2026-11-03
- Supersedes: the composer Stop from #1779 and the mobile status-strip Stop from #1756
- Builds on: #3415 (Host hold after a Human stop, failure breaker; issue #3387)

## Context

#1756 and #1779 let a Human stop a working PersonaBot: the mobile status strip and the Web composer turned Send into Stop, and Stop ended the Orchestrator turn. #3387 showed that this did not stop the Bot: delegated Assignments kept running, Inbox events woke it again, and a failing provider kept retrying. A PersonaBot is not one conversation turn. It owns one Orchestrator Session and possibly several Assignment Sessions at once, each with its own Subagents. A Stop in the composer cannot say which of them it means, and in a Group it stopped every working member Bot at once. An IM user also does not expect the message box to control execution.

## Decision

**Stop points at Sessions.** The Human stops one running Session (Session Stop) or every running Session of one PersonaBot (Bot Stop). Orchestrator and Assignment Sessions follow the same stop logic. Subagents are never stopped on their own; they stop with their parent. A Group Channel has no stop for all of its member Bots.

**The composer has no Stop.** Send stays Send. Stop lives where Sessions are shown: the Messages panel header popover and the Sessions subpanel on desktop, and the profile Work tab on mobile. A working-Session count chip appears in the conversation header only, never on message avatars or in the Channel list. On IM surfaces without a header, `/stop` remains as Bot Stop.

**A Stopped Session waits for its own principal.** Nothing wakes it automatically. An Orchestrator Session resumes on a Human message, as with any IM Bot; an Assignment Session resumes on an Assignment Request. Other Bots' Group messages, Inbox digests and Assignment Reports queue without waking it. Stopping an Assignment does not wake its Orchestrator. Stopping is never archiving.

**Stopping is safe at any point.** A half-streamed message is discarded, never committed. The Session's held Group drafts are invalidated. An external send with an unknown outcome stays delivery-unknown and is not retried. An interrupted tool call is recorded as stopped with an unknown result, and the next turn is told to check it before redoing it. Open approval cards close as stopped. An Assignment being created by a stopped turn is cancelled, or stopped at once if its Session already exists. A stop that arrives late or twice succeeds silently. A stop that does not settle within 30 seconds discards the run and marks it stopped.

## Consequences

Humans can cut cost precisely, for example by stopping one runaway Assignment while the Bot keeps answering. The composer becomes plain IM again, and #1779's Stop UI is removed. The Host needs per-Session stop and hold instead of only the per-Bot hold from #3415, plus Human bridge methods and CLI commands (`session-stop`, `bot-stop`). `channel-bot-stop` stays one release as an alias for Bot Stop, then is removed. Headers need a live working-Session count, which the existing activity snapshot already carries.
