---
Status: Accepted
Date: 2026-10-13
Issues: [#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038), [#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220), [#1535](https://github.com/BotHarness/DeepSeekBot/issues/1535)
---

# PersonaBots use a product preset with timed questions

While an Orchestrator waits on its own `ask_user_question` call, DSH's agent loop stays inside that tool step and the Bot answers nothing else (#1220). DSH 0.2.0-rc.2 offers a timed mode for the question tool: after a foreground wait the call returns a pending result, the turn goes on, and the original card stays answerable. The application side of that path was qualified in #1227 and extended to Group cards in #1545. The mode was never on, because it is configuration of the `tool-ask-user` plugin inside an agent preset, and the product set none.

## Decision

The product bundle declares its own agent preset, `deepseekbot`, and makes it the default for PersonaBots.

- The preset is the DSH `standard` preset with one difference: `tool-ask-user` runs in `mode: timed` with a 45 second foreground wait.
- It is generated, not hand-written. `scripts/sync-bot-preset.mjs` copies the installed `@deepseek-ai/dsh-web-app` standard preset into a marked region of `packages/deepseekbot/cordis.patch.yml` and changes only the row id, the preset id, the order and the question tool's config. It fails if the standard preset no longer has the shape it expects.
- `pnpm lint` runs the script with `--check`, so a DSH upgrade that changes the standard preset fails CI until the preset is regenerated and reviewed.
- The bundle sets the core plugin's `agentPreset` to `deepseekbot`. A Bot with an explicit preset keeps it, and a Profile without the product bundle still falls back to `standard`.

The native `standard` preset is not modified, so ordinary DSH sessions in the same Profile keep their own question behaviour.

## Not covered

- Tool approvals still hold the turn. DSH has no pending outcome for an approval, and #1220 rules out a second executor, replay, or cancel-and-restart as substitutes. This stays deferred until upstream supports it.
- ~~A pending timed question does not survive a Host restart; the process-local correlation from #1227 is unchanged.~~ Superseded by the amendment below.
- The Group privacy acceptance in #1038 is not claimed by this decision.

## Rejected

- Patching `tool-ask-user` inside the native `standard` preset from the product bundle. It would change question behaviour for every DSH session in the Profile.
- A switch that writes the timed configuration into the user's Profile patch. The default would stay blocking.
- Waiting for an upstream per-plugin override.

## Amendment: a timed question card survives its Agent and the Host (#1038)

DSH keeps a timed question in the Session log: the `userQuestions` projection shows it `continued` once the call returned pending or the process that owned it ended, and an answer may be steered into the resumed root Agent. The card in the Channel was still tied to the asking Agent in Host memory, so a restart or an Agent disposal made it expire although DSH would still accept the answer.

- The card is addressed by Session and call id. Reading and answering the native question resolve the Session's live root Agent, or the stored Session, at that moment.
- Agent disposal no longer cancels a timed card. Host shutdown no longer writes a cancellation on it; a blocking card is still cancelled in both cases.
- On start the Host re-opens unresolved timed cards whose Session the same Bot's Orchestrator still owns, whose native question is still there, and whose Channel the Bot still holds. A card DSH settled while the Host was down is recorded as answered.
- A late answer to a recovered card runs through the Bot's turn queue like a live one, resumes the Orchestrator Session, and is delivered only if the native question is `continued` after the resume. The card's own Source Event anchors that turn, because the turn that asked is gone. An archived Session, revoked content or a lost Channel membership refuses it.
- A turn that the Human stops drops the native question; the card is then cancelled.
