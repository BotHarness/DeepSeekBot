# Orchestrator reply delivery qualification

An assistant final message in the native Session is not a Channel reply. A passing
reply requires both a native `channel_send` call and exactly one committed Bot
message in the intended Channel. Intentional silence must produce neither.

## Run against an isolated Host

Use `scripts/dev-instance.mjs` and the machine-local model setup described in
`docs/agents/ax-model.md`. Never run this matrix against a production Profile: it
creates synthetic PersonaBots, model presets, DMs and Groups. It does not delete
them, modify the global model default or approve actual Tool permissions.

```bash
BH_E2E_ORIGIN=http://127.0.0.1:3220 \
BH_E2E_HOME=/absolute/path/to/isolated-profile \
BH_E2E_EVIDENCE=/absolute/path/to/private-evidence \
BH_E2E_MODELS=opencode-go:deepseek-v4.1-flash:off,opencode-go:glm-5.1:low \
BH_E2E_ROUNDS=2 \
node scripts/e2e-orchestrator-reply-delivery.mjs
```

The launcher must have verified `/api` and created its private cookie file first.
Model and effort IDs must exist in the running Host's native model catalog; catalog
presence alone is not a usability qualification. Credentials stay machine-local.

For a vision-capable route, additionally set `BH_E2E_IMAGE` to an authorized local
screenshot and `BH_E2E_IMAGE_LABELS` to at least two comma-separated labels visible
in that image. A passing image case requires `channel_read_image`, matching labels
and a committed reply. Text-only model image capability is not qualified by this
test. Do not publish an image containing unrelated/private conversations.

## Assertions and evidence limits

- `BH_E2E_ROUNDS` creates that many fresh Bots per route (default two) to exercise
  Chinese/English "no tools" acknowledgments,
  ordinary followups, short and capability questions, native question/answer cards,
  optional image followups, explicit silence, replying after silence and Group
  mention reply/FYI cases. Use `BH_E2E_SCENARIOS` to select exact scenario names.
- The script answers only synthetic Canary/Stable question cards using their actual
  option labels. It never grants Shell or other real Tool permissions; an approval
  stops that round and is not silently counted as success.
- Every case checks actual native provider/model, completed turn, a complete Session
  snapshot, the reply-delivery system section, per-turn reminder, Channel content,
  send count and absence of accidental Group-to-DM mirroring.
- `reply-delivery.json` is written after each observed case, containing verdicts,
  routes and Tool names, but not credentials, raw replies or private Session text.
  A failed case or transport exception yields a nonzero exit. Interrupted runs are
  partial evidence, not a completed matrix; inspect recorded counts and failures.
  An unsettled case marks remaining cases in that round as skipped, failed entries.
- Distinguish missing delivery from image-content errors, provider/protocol errors,
  permission waits and test-harness failures. Do not include question/approval cards
  in the count of actual answers.
- This is real-model Channel/API and native Session E2E, not browser-rendering,
  external IM receiver, physical-device or production proof. Finite repetitions
  measure regressions but cannot guarantee models will never omit a send.

The bounded fix strengthens the initial Orchestrator contract, final bilingual
system reminder, every Orchestrator input and `channel_send` description. Assignment
inputs and authorization remain unchanged. Assistant text is not auto-forwarded;
successful or uncertain sends are not retried blindly.
