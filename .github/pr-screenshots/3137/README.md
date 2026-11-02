# Empty tool series recovery (#3137)

Evidence uses an isolated DSH 0.2.1-rc.3 Host, a synthetic Bot conversation, and
the real `deepseek-official/deepseek-flash` route. No exported customer messages
or credentials are included.

1. Establish a working Bot reply, then seed a valid persisted request series
   with an empty tool baseline followed by restored tools, matching the reported
   session's transition. The original cause of the customer's empty baseline is
   not established by this reproduction.
2. Disable only the new helper in the local built bundle as the control. Resume
   the conversation: DeepSeek rejects all 77 projected tools as deferred with
   HTTP 400. `before.png` is a crop of that persisted error card, captured after
   recovery; its request ID is `23a2d2a5-a543-4cec-ac47-4b888d6b3c8e`.
3. Restore the fixed bundle and restart the same isolated Host. Send the recovery
   message to the same Session. The native request header records
   `startsSeries: true` with 77 tools, the turn completes, and the Bot replies
   `56`. `after.png` shows this reply with prior errors retained. Its uppermost
   error is an earlier invalid test-fixture attempt, not evidence of this bug.

The regression tests exercise native Session history and LLM tool projection,
including restored Sessions, refusal preservation, and normal deferred additions.
The fix neither rewrites historical events nor changes tool permissions.
