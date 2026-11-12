# Durable timed-question recovery

## Sub-features

- A real timed question retains its original Channel card, native Session and call after restart.
- Web and `user-question-answer` use the same native answer owner; invalid and duplicate answers refuse.
- Cold recovery preserves Memory without turning the question's Bot Source Event into a new Memory admission.
- A follow-up question created by a recovered continuation retains that mode and validates its own new card.

## How to get to it (user POV)

Ask a disposable Bot in its DM to use `ask_user_question` once with two offered options and report
the Human's choice. Wait for the native question to become durably `continued`, then restart only
the task-owned Host. Open the original card, select an offered option and submit. The original
call must settle and the Bot must reply in the same DM, without another question or prompt replay.

## Driving it with verify-app

Launch an isolated Host with `verify-app`. Retain the original card/session/call IDs, persisted
native projection and Memory bytes before restart. Use accessible card labels for Web submission;
on an independent pending card run `deepseekbot user-question-answer` with `--answer-stdin`.
Read `user-question-status`, Channel messages and native Session facts afterward. Capture the
card, continuation, console, and `diagnostic-logs`; a success response alone is insufficient.

For the chained case, one Human prompt requests two sequential native questions. Wait for the
first call to be durably `continued` and the turn idle, restart once and answer the first card.
The Bot then asks the second question. Wait for durable continuation and idle again, but do not
restart or send another prompt before answering the second card. Require native Memory write
and readback plus the final reply, with one settlement for each original call.

## Gotchas

- A card rendered while the native call is still `open` is not durable-continuation readiness.
  Preserve interruption-before-persistence separately; never replay a Human prompt to repair it.
- Cold recovery skips passive Memory observation and application branch continuation/switch;
  native Memory file access keeps its existing owner. Check old bytes and any native file write.
- Preserve first failures. `native-question-input-refused` records only coded phase/reason.
- External IM delivery, tool-approval cold recovery and broader Group privacy remain separate gates.
