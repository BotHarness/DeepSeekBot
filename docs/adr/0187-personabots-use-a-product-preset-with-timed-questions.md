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

## Amendment: qualified recovered answers do not admit a new Memory observation (#4066)

The native Agent Registry resolves a live Agent with `get(sessionId)`. A recovered answer uses
that Agent and the original native call, without replaying the Human input or creating another
question. The application rechecks the exact card's Bot author, Session, call and Channel before
resuming and before native delivery.

The card's own Source Event remains the recovered turn's effect and purge anchor. It is not a
fresh Inbox Admission and does not grant ordinary Bot messages Memory observation authority.
Only this validated recovered-answer path skips passive Memory preparation and reconciliation,
including the application branch-continuation and branch-switch capabilities that depend on
them. Native Memory file access retains its existing owner and restrictions; existing Memory
is preserved. A later admitted Human turn can observe eligible file changes normally. Warm late
answers retain their admitted turn's existing Memory behavior. The Memory owner's general source
allowlist is unchanged.

A follow-up question created during a recovered continuation retains that execution mode.
Its binding captures the new card and call identities before commit, then resolves the new
card's own Source Event through the same qualified recovery path at delivery. It does not reuse
the previous card's validator or infer authority from an arbitrary Bot message. This applies even
when the follow-up is answered without another Host restart.

Recovery refusals record a stable phase and coded reason through the existing developer log
surface, without exception messages, prompts, answers or filesystem paths. These process facts
do not become a second question or Memory authority.

## Amendment: Tobs is the default, not the only mode

Users install other DSH modes (agent presets), for example `dsh-ntr`'s ACP mode, and expected a Bot to run in them. The core plugin's `agentPreset` (`deepseekbot`, shown as Tobs) stays the product default, but it is no longer the only choice:

- A Profile-wide default mode lives in `$DSH_HOME/botharness/bot-modes.json`. Without it, Bots use the product default.
- A Bot's existing `preset` field is its own mode. Without it, the Bot follows the Profile-wide default.
- Both are set from Settings, the Bot's settings and `deepseekbot bot-mode-default-set` / `bot-mode-set`, and only to a mode in the native roster that loaded.
- The mode is resolved when an Orchestrator or Assignment Session is created. DSH refuses `agent-preset/locked` once a Session has started, so a change applies from the next new Session and never switches a running one.

Outside Tobs a pending question card holds the Bot again unless that mode configures timed questions itself, and the Settings note says so. The Bot's own tools (`create_assignment`, `bot_send_message`, the Orchestrator Subagent guard) are installed by the application on every mode. A mode whose model gets no harness tools, such as `dsh-ntr`'s ACP mode, cannot reply in a Channel or report an Assignment; that is the mode's contract, not a refusal by the application.

Mode templates and Assignment modes follow the same rules:

- A mode template (`templates` in `bot-modes.json`) names the modes a Bot may use, and `botTemplates` maps a Bot to one. A Bot without a template may use every installed mode. The template bounds the Bot's own mode and the modes its Orchestrator may give an Assignment. It also bounds a Bot that follows the default: the mode is resolved, not refused, so when the default is outside the template the Bot uses the template's first installed mode. Changing the default therefore never needs a check across every Bot, and the reported effective mode is the one Sessions use. A template edit or assignment is checked only against Bots with their own mode: it is refused with `mode-not-allowed` when it would leave out such a Bot's mode, so that Bot's mode is changed, or set back to follow the default, first. If none of a template's modes is installed, the Bot stays inside the template and cannot start a new Session until a template mode is installed again or the template names an installed mode.
- `create_assignment` takes an optional `mode` from that set. The chosen mode is stored with the Assignment (`assignments.agent_preset`) so a restart before the Session exists still starts it in that mode; without a choice the Assignment uses the Bot's mode.
- When an existing Session is set up again, the application mounts the mode the Session log records (the DSH `agentPreset` projection), not the Bot's current mode, so a later mode change never mounts a different composition into a Session that started under another one.
- In Team mode a member's Bot follows these same rules (ADR-0336, amended 2026-11-18). The Owner-only `danger-full-access` Assignment preset is a separate check and is unchanged.

## Amendment: scenario modes for Assignments, chosen by the Orchestrator

An A/B on `deepseek-v4.1-flash` (5 tasks, 30 runs per arm) showed that the Orchestrator keeps an Assignment in the default mode unless it sees the alternatives when it starts the Assignment. With the allowed modes only in `list_assignment_models`, which it never called, it chose another mode for 4 of 42 Assignments. A lighter default (`minimal`) for every Assignment cost more on web research than it saved on scripts.

- The product bundle ships three scenario modes beside Tobs: `tobs-research`, `tobs-code` and `tobs-script`. Each copies the generated Tobs preset and keeps a fixed list of its plugins, so timed questions and the disabled native Subagent tools carry over. `scripts/sync-bot-preset.mjs` generates them in the same region and its `--check` fails when a kept plugin disappears from the standard preset.
- Each mode's description says what work it suits and what it cannot do.
- When a Bot may use more than one mode, `create_assignment`'s `mode` parameter lists the allowed ids as an enum with each description. They are read when the Orchestrator Session is prepared; the tool's run-time check still refuses a mode the template no longer allows.
- The default Assignment mode stays the Bot's mode (Tobs by default).

With the list in the parameter, the Orchestrator chose a scenario mode for 31 of 38 Assignments (scripts for data work, research for web comparisons) and the arm cost 7% less than Tobs everywhere with a judge score of 4.93 against 4.83.
