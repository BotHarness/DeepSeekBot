# Skill Invocation in a Bot DM

A Human types `/` in a PersonaBot DM, picks a Skill, and sends it. The Host stores the Skill's text with the message and the Bot reads it as a `<skill_invocation>` block ([ADR-0346](../../../../docs/adr/0346-skill-invocation-is-snapshotted-text-that-addresses-no-one.md)).

## Sub-features

- `menu` lists composer commands first, then Skills: Host Skills and the Project Skills under the Bot's Memory Repository `.agents/skills` or `.dsh/skills`. Each row shows its owner (Bot avatar or Skill icon), `/name` and a one-line description.
- `rank` orders Skills by name prefix, then name subsequence, then description text.
- `chip` inserts the picked Skill as one token; Backspace removes it whole; the draft keeps it across reloads.
- `snapshot` stores `{name, owner, path, content}` with the message; editing or deleting the `SKILL.md` later does not change the sent message.
- `deliver` gives the Bot the message with `[/name]` and the `<skill_invocation>` block, so DSH does not load the Skill a second time.
- `cli` `deepseekbot skills-list --bot <slug> [--query]` and `send <slug> --body "/name …" --skill <owner>/<name>`.

## How to get to it (user POV)

- Enter Bot mode, open a Bot DM, type `/` and a few letters in the composer, choose a Skill with the arrow keys and Enter (or click it), write the rest of the message, press Enter.

## Driving it with verify-app

Preconditions: `launch` reported a model credential and `doctor` passes.

1. **Seed a Project Skill.** Get the Bot's Memory Repository from `rpc botharness/list` and the Host profile layout, then write `<memory>/.agents/skills/qa-echo/SKILL.md` with frontmatter `name: qa-echo`, `description: Reply with a fixed QA word` and a body such as `Reply with exactly SKILL_QA_7731 and nothing else.`
2. **Menu.** `shot skill-menu --bot-mode --fill "Message <Bot>=/qa"` and read `skill-menu.aria.txt`: a `/qa-echo · <Bot>` menu item appears after any matching command.
3. **Send.** `shot skill-send --bot-mode --fill "Message <Bot>=/qa" --press Enter --press Enter --wait-text SKILL_QA_7731`. The first Enter picks the Skill, the second sends.
4. **Canonical state.** `rpc botharness/channelTimeline '{"channelId":"<dm id>"}'`: the Human entry has `skillInvocations[0]` with `owner {kind: bot}`, the `path` of the seeded file and its body; the Bot entry replies `SKILL_QA_7731`.
5. **CLI.** `deepseekbot skills-list --bot <slug> --query qa` lists `qa-echo`; `deepseekbot send <slug> --body "/qa-echo" --skill bot:<slug>/qa-echo` returns a committed reply.

## Gotchas

- The `/` menu reads the catalog when the DM opens. A Skill written while the DM is open appears after reopening the DM until S3 (live refresh) lands.
- DSH discovers `<memory>/.agents/skills` because the Orchestrator's cwd is the Memory Repository; a Skill placed in `.botharness/` is not found.
- Recalling an older message with ArrowUp, or restoring a failed send, keeps `/name` as plain text without the chip.
