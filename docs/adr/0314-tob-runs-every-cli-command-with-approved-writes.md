# ADR-0314: Tob runs every CLI command, and every write waits for approval

- Status: Accepted
- Date: 2026-11-10
- Supersedes: [ADR-0224](0224-tob-management-uses-scoped-native-shell-cli.md) (the allowlist; its authority, broker and lifecycle rules stay)
- Related: [ADR-0223](0223-tob-is-a-protected-local-personabot.md), [ADR-0225](0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md), [ADR-0226](0226-group-management-receipts-preserve-channel-authority.md), [#3870](https://github.com/BotHarness/DeepSeekBot/pull/3870)

## Context

ADR-0224 gave Tob the `deepseekbot` CLI through a per-Shell broker, but only for an explicit allowlist that grew one operation at a time. Every new Human command needed a second Tob parser and a Host operation before Tob could use it, so Tob kept refusing things the Human could do from the same Host. #3870 added `doctor` and `diagnostic-logs` as a stopgap while a bug report waited on exactly that gap. The Human decided Tob should have the whole CLI, with every write gated by the existing approval card.

## Decision

Tob can run every `deepseekbot` command the Human has.

- The typed operations ADR-0224, ADR-0225 and ADR-0226 added keep their own parsers, reviewed proposals (target, previous value, revision, operation key) and approval policy.
- Any other command goes to the broker as `cli` with its exact argv, stdin and current folder. The Host runs the Human CLI for it in a child process with the Host's own loopback origin and launch token, the same authority the Human CLI uses. The token stays in that Host-owned process; it never reaches Tob's Shell, and it is redacted from the output.
- A command is a read only when the Host's read list names it and it has no `--out`. Everything else, including a command the list does not know yet, is a write.
- A read runs at once. A write shows the Human an approval card with the exact argv, the folder, and the size and SHA-256 of any stdin (never its contents) before the command starts. Full access and Approval Templates do not replace this card; only an "always allow" rule the Human chose on such a card can. A rejected or cancelled card never runs the command.
- The Human CLI's own refusal code and message come back to Tob unchanged, so Tob can correct the command. A write that fails to report its result is `operation-outcome-uncertain`; Tob reads before retrying.
- `--host`, `--token-file` and `--home` are refused: the Host chooses its own target and authority, and offline maintenance against the running Profile is not available. `ssh-tunnel` and `voice-local-kit` stay local to the Human's own CLI.

Authority does not change from ADR-0224: only the protected Tob singleton's root Orchestrator, for the exact accepted Human private-DM Source Events of the current Shell execution, holds a broker. Group, external IM, Bot-originated and Assignment requests get none, and the broker is revoked when the Shell call ends.

## Consequences

Tob no longer needs a new parser before it can use a new Human command, and the CLI parity rule now gives Tob each new feature as well. The cost is that a generic write is reviewed as a command line rather than as a typed previous value and revision, so the Human sees more approval cards and must read them; commands with typed operations keep their richer review.

The read list errs toward approval: a read the list misses only costs the Human a card. Adding a command to the list must keep it free of Host state changes and of local file input or output.

The child process reads files the command names from Tob's folder with the Host's permissions. Reads with file inputs are therefore not on the read list, so any such command needs approval.
