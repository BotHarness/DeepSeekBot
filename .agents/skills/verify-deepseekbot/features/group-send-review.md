# Group send review after a Human correction

An opt-in local Group holds a Bot reply when formal conversation content changed after its
observed basis. The Human sees only committed replies in canonical history.

## Sub-features

- Observe: full inbound content or bounded `channel_read` supplies a Host-issued basis.
- Hold: changed content returns `held`, clears the preview and creates no formal message.
  A bounded `review.content` delta supplies full newly observed messages and an explicit
  `review.observationId`; `review.complete` indicates whether an extra read is needed.
- Recheck: explicit `draft_id` and `observation_id` allow one revision or unchanged recheck.
- Drop: `drop: true` abandons the draft independently of Inbox resolution.
- Refuse: revoked membership, purged source, expired draft or restarted Host cannot auto-send.
- Review: the pilot retains complete paired histories and separate runtime/judge usage.
- Human preference: two full-history cards accept one Left/Right choice, save it and advance;
  dimensions and reasons are not required. “两边差不多” and “不好判断” are explicit outcomes; the last-choice button reveals per-arm tokens and known cost only after a choice. Skip leaves the pair unreviewed; undo and changes
  preserve previous choices. Legacy rubric scores retain their original review mode.

## How to get to it (user POV)

Create a local Group with two Bots and mentions-only wake settings. Enable it with
`deepseekbot group-send-review <channel> --accept`. Mention one Bot with a request; correct
the request while its preview is visible. The final reply should account for the correction.
Use `--off` to stop the opt-in. Existing wake defaults remain unchanged.

## Driving it with verify-app

Launch and doctor two isolated instances: frozen baseline #2053 B0 and the candidate.
`node scripts/e2e-group-send-review.mjs --baseline-instance <json> --candidate-instance <json>
--report <json>` runs a diagnostic pair using `DEEPSEEK_API_KEY` and the fixed direct model.
`--formal` runs exactly four families of ten pairs; it must use committed candidate bytes.
Do not count diagnostics or missed race windows as valid pilot successes.

Append `--conversation` for the separately versioned `2053-ingest-v1` supplement: two real
Human/Bot exchanges establish facts before the target request. During its draft, correction
arrives as two separate messages (time and room). Full histories and whole-episode usage stay
in the report; the prelude boundary only excludes already-completed replies from target-stage
cancellation/obsolete-output counts. Post-prelude usage is reported separately, with unknown
buckets preserved. This cohort does not replace the original pilot or erase its latency failures.

Open the resulting Group in the Web Client and capture the original request, correction and
final answer with `verify-app shot`; inspect console output. Compare `channelMessages` with
the draft frames and `botToolTrace`: a held draft must have no canonical placement.
Use `bot-tool <bot> channel_read --args-stdin`, then `channel_send` with the returned
`observationIds[channel]`; append a Human correction between those CLI calls to deterministically
exercise the same production guard without the model. Recheck directly with `review.observationId` after reading a complete held delta.
Verify a second intervening correction still stops it; omitted/oversized content must be
read explicitly, and neither another Bot nor an old concurrent send inherits the handle.

Render the saved pilot with `scripts/group-send-review-report.mjs render` and open the HTML.
Choose one card: progress advances by one, the choice survives reload, and judge/cost evidence
stays hidden. Return to the chosen pair before revealing; a post-reveal change must remain
marked in the exported JSON. Check undo, skipped pairs, full message bodies and narrow layouts.

## Gotchas

- A successful tool call returning `held` is not delivery. Missing usage remains unknown.
- Draft previews are public temporary content; they are retained separately in reports.
- Tool handles cannot cross owners or Groups. Source purge removes derived draft bodies.
- After one failed recheck, automatic retries stop. This slice does not implement #2054–2056.
- Human acceptance requires independent review of full histories; no test or LLM signs it.

## Explicit completion and revoked-source regression

Pass `resolve_inbox_ids` on direct `channel_send` and inspect `inboxResolution` separately
from `status: committed`. A held/refused send must leave the specified work open. A successful
drop resolves only explicitly selected observed IDs. A failure after delivery is repaired
through `inbox_resolve`, without resending. In a real Group turn, remove the sending Bot:
neither the Group nor a DM may receive continuation of that task. A subsequent independent
DM still works. The fixed pilot retains `legacyGroupGoal` but uses the versioned whole-history
oracle; cancellation/revocation succeeds only with no public Bot output in any Channel.

A send without explicit completion IDs returns `inboxResolution.outcome: not-requested`.
Verify the Bot handles completion in the current turn, rather than creating a second cleanup
turn. Drop may omit channel_id only when an inbound Channel exists; the draft owner/channel
checks remain unchanged.
