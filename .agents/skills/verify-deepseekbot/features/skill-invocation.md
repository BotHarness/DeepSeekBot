# Skill Invocation in a Bot DM or Group Channel

A Human types `/` in a PersonaBot DM or Group Channel, picks a Skill, and sends it. The Host stores the Skill's text with the message and the Bot reads it as a `<skill_invocation>` block ([ADR-0345](../../../../docs/adr/0345-skill-invocation-is-snapshotted-text-that-addresses-no-one.md)).

## Sub-features

- `menu` lists composer commands first, then Skills: Host Skills and the Project Skills under each conversation member Bot's Memory Repository `.agents/skills` or `.dsh/skills`. Each row shows its owner (Bot avatar or Skill icon), `/name` and a one-line description.
- `rank` orders Skills by name prefix, then name subsequence, then owning Bot display name or slug substring, then description substring; order within each tier stays stable. Typing `alice` lists all of Alice's Skills.
- `chip` inserts the picked Skill as one token; Backspace removes it whole; the draft keeps it across reloads.
- `snapshot` stores `{name, owner, path, content}` with the message; editing or deleting the `SKILL.md` later does not change the sent message.
- `deliver` gives the Bot the message with `[/name]` and the `<skill_invocation>` block, so DSH does not load the Skill a second time.
- `group-routing` invokes Alice's Skill while mentioning Bob: only Bob wakes under a mentions-only wake policy, and his Bot Inbox text contains Alice's snapshot, owner `bot:alice` and path. Without a mention, existing per-Bot Group wake policies decide delivery; the Skill owner is never implicitly addressed.
- `im-mirror` falls back to plain `/name` on Discord/Lark, without `[/name]`, XML or snapshot content.
- `command-collision` keeps commands first and reserves a bare command name while its same-named Skill row remains selectable. External IM DM command intake recognizes supported bare commands before ordinary intake; Channel/CLI sends require explicit Skill tokens or `--skill`.
- `cli` `deepseekbot skills-list --bot <slug> [--query]` (or `--channel <id>`) and `send <slug> --body "/name …" --skill <owner>/<name>`.

## How to get to it (user POV)

- Enter Bot mode, open a Bot DM, type `/` and a few letters in the composer, choose a Skill with the arrow keys and Enter (or click it), write the rest of the message, press Enter.

- Open a Group Channel with Alice and Bob, type `/`, inspect both owners and the single Host Skill entry, then pick Alice's Skill and explicitly mention Bob.

## Driving it with verify-app

Preconditions: `launch` reported a model credential and `doctor` passes.

1. **Seed a Project Skill.** Get the Bot's Memory Repository from `rpc botharness/list` and the Host profile layout, then write `<memory>/.agents/skills/qa-echo/SKILL.md` with frontmatter `name: qa-echo`, `description: Reply with a fixed QA word` and a body such as `Reply with exactly SKILL_QA_7731 and nothing else.`
2. **Menu.** `shot skill-menu --bot-mode --fill "Message <Bot>=/qa"` and read `skill-menu.aria.txt`: a `/qa-echo · <Bot>` menu item appears after any matching command.
3. **Send.** `shot skill-send --bot-mode --fill "Message <Bot>=/qa" --press Enter --press Enter --wait-text SKILL_QA_7731`. The first Enter picks the Skill, the second sends.
4. **Canonical state.** `rpc botharness/channelTimeline '{"channelId":"<dm id>"}'`: the Human entry has `skillInvocations[0]` with `owner {kind: bot}`, the `path` of the seeded file and its body; the Bot entry replies `SKILL_QA_7731`.
5. **CLI.** `deepseekbot skills-list --bot <slug> --query qa` lists `qa-echo`; `deepseekbot send <slug> --body "/qa-echo" --skill bot:<slug>/qa-echo` returns a committed reply.

### Group Channel path

1. Seed `qa-echo` in Alice's Memory Repository and a distinct Skill in Bob's. Create or open a Group containing Alice and Bob. Set both Group wake policies to mentions-only so an ordinary digest wake cannot obscure the recipient check.
2. Type `/` in the Group composer: both Project Skills appear with their owning Bot avatars; each Host Skill appears once. Type Alice's display name or slug: all her Skills remain, below name matches and above description-only matches.
3. Pick Alice's `qa-echo` row, explicitly mention Bob using the mention picker, and send. Bob alone replies `SKILL_QA_7731`. Read `rpc botharness/channelTimeline '{"channelId":"<group id>"}'`: the Human message stores owner `{kind: bot, botSlug: alice}`, path and original content; canonical Bot Inbox/Admission state identifies Bob as the recipient, not Alice.
4. Repeat without a mention: with both policies mentions-only neither Bot wakes. Change Bob's policy to all messages and repeat: Bob wakes through ordinary routing with Alice's identical snapshot. Editing/deleting the Skill after send leaves the stored snapshot unchanged.
5. `deepseekbot skills-list --channel <group id> --query alice` lists Alice's Skills by display name and slug. Send with `verify-app rpc botharness/channelSend '{"channelId":"<group id>","body":"/qa-echo","skillInvocations":[{"name":"qa-echo","owner":{"kind":"bot","botSlug":"alice"},"start":0,"end":8}]}'` to exercise the same snapshot and ordinary routing without the UI.
6. For a same-named command/Skill, inspect commands-first ordering, exercise the bare command, then explicitly select the Skill row and inspect the snapshot.
7. Through the designated Discord/Lark test destination and the IM browser QA procedure, inspect a mirrored Human message: it shows plain `/qa-echo`, with no brackets, XML or snapshot content. Correlate it with Source Event/Outbox facts. The automated provider-carrier tests alone do not verify browser rendering; do not infer that a Group bridge automatically forwards Human messages.

## Gotchas

- The `/` menu reads the catalog when the conversation opens. A Skill written while the conversation is open appears after reopening it until S3 (live refresh) lands.
- DSH discovers `<memory>/.agents/skills` because the Orchestrator's cwd is the Memory Repository; a Skill placed in `.botharness/` is not found.
- Recalling an older message with ArrowUp, or restoring a failed send, keeps `/name` as plain text without the chip.

- S2 non-UI automation covers catalog membership, ranking, routing, snapshot delivery and plain-text provider sends. Group menu avatars, command selection and Discord/Lark browser rendering still require the UI/IM journey above.
