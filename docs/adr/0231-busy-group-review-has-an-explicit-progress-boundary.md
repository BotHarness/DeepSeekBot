# ADR-0231: Busy Group review has an explicit progress boundary

- Status: Proposed; implementation and verification under #2055
- Date: 2026-10-18
- Issue: [#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)
- Extends: [ADR-0227](0227-group-send-review-shares-the-channel-commit.md)

Continuous Group traffic can invalidate every read before a reply commits. The
application-defined Channel owner therefore allows an initial hold followed by at most
two automatic freshness rechecks. A failed second recheck returns `requires-review`,
the consumed budget, current draft version and explicit progress choices. Another ordinary
send cannot replenish the budget, even when it follows a different source message in the
same owner/Group. Existing wake policy remains unchanged.

Dropping an exhausted draft also fences another send to that Group within the same
Orchestrator turn. It cannot create a replacement draft to replenish the budget. This
turn-local guard ends with the turn; a later independent request or resumed responsibility
can read fresh context and proceed. Each model-free direct Tool invocation is its own
operation, not a continuing native Orchestrator turn. The guard does not add persistence or
claim recovery across a Host restart.

At that boundary the PersonaBot chooses one of three actions. It may drop a redundant or
cancelled draft. It may drop the draft while leaving responsibility open, then use the existing
Bot Inbox `inbox_snooze` operation with a bounded time and note; resumption must read fresh
context and verify the condition before answering. Or it may explicitly send with
`freshness_override`, a current draft version, observation handle and short reason why its
answer is still necessary. Dropping a draft never implicitly completes Inbox responsibility.
The draft owner does not schedule a wake or interpret natural-language conditions.

The existing Inbox timer must retain that responsibility when ordinary Group context arrives
without waking the Bot. A later Admission ends snooze early only after the Bot has observed
it. Merely persisting an unobserved, mentions-only Group message cannot cancel the deadline
wake. The first cohort exposed this pre-existing failure in both the accepted baseline and
candidate: an unmentioned material confirmation silently suppressed the scheduled return.
The fix stays in the shared Inbox attention predicate, with the existing timer and no new
wake policy or scheduler.

The override is one action for the original owner, Group and expected draft version. Its
observation must cover all content required at the exhausted review boundary. Reading a
later revision of the same message counts; an older merged observation does not. The final
transaction still compares that observation with current canonical content. If any unread
change has arrived, it refuses the explicit attempt with `override-context-changed-defer`,
returns the changed context, and leaves only drop/defer as choices. The consumed attempt
cannot be repeated. This overrides the automatic retry budget, not the obligation to read
current messages. Semantic interpretation of corrections, cancellation and requests to wait
remains the model's responsibility; the Host does not classify message text with keywords.

The first frozen #2055 cohort demonstrated why this check is necessary: a correction arrived
after the exhausted snapshot but before the override, and the candidate sent obsolete facts.
Earlier green tests allowed unseen trailing chatter and missed this race. The regression now
inserts a correction at that exact boundary and requires refusal without any public append.

A subsequent diagnostic safely dropped the obsolete draft but chose an arbitrary five-minute
snooze, missing the 240-second completion window. Exhausted outcomes now supply a Host-time
`suggestedSnoozeUntil` 30 seconds ahead for freshness-only contention. This is guidance to the
existing Inbox Tool, not automatic scheduling or permission to shorten a Human deadline or
ignore an unmet condition. Observed completed FYI work can be resolved in the drop call while
the original request remains open; successful resolution does not need repeated verification.

The second frozen cohort exposed completion IDs being carried from an unsuccessful send into
an exhausted drop: the model dropped its draft and accidentally resolved the original request
with unrelated FYI items. An exhausted drop without observed peer-yield evidence now returns
`keepOpenInboxIds` for its original Source Event and that Group's Message ID. The reply Consumer
excludes those IDs from the composed completion selection, reports them as `keptOpen`, and
still resolves selected completed background work. This guards the send-to-drop transition;
it does not classify natural language or forbid a later explicit `inbox_resolve` for work the
model judges cancelled or complete. Observed peer yield preserves the normal explicit
completion path. No new Inbox state or scheduler is introduced.
The continuation instruction also accompanies a drop with no completion IDs or only FYI IDs:
the model must not mistake successful background cleanup for a delivered original answer.
It names the later committed Message ID as delivery evidence, while preserving cancellation
and independently completed work. This guidance does not turn semantic completion into a
Host-enforced classifier.

The owner records actor, reason, observation, version, count and committed message identity
in its existing draft JSON in the same transaction as the formal Channel append. A successful
override retains that terminal audit record. No additional database generation, content store,
Session manager or scheduler is introduced. Permission, membership, active-Bot, stopped-turn,
Session ownership, source purge and expiry checks still precede the commit. Override does not
implicitly cross a Host restart. With [ADR-0232](0232-group-recovery-retains-authorized-commit-receipts.md),
explicit recovery requires a fresh observation and retains the same exhausted budget, version
and spent-override marker. An exhausted draft needs both recovery and its one explicit
override; neither action replenishes the other.

The existing direct `bot-tool ... channel_send --args-stdin` command invokes this same Consumer.
Tool traces distinguish exhausted review, explicit override, peer yield and snoozed work;
none creates a public system acknowledgment. Complete evaluation histories retain these
diagnostics separately from committed messages. Reverting this slice restores the earlier
review bound; retained terminal audit data confers no send permission on the old code.
