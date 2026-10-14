---
Status: Accepted
Date: 2026-10-13
Issues: [#1572](https://github.com/BotHarness/DeepSeekBot/issues/1572), [#1562](https://github.com/BotHarness/DeepSeekBot/issues/1562)
---

# A Bot runs a command-line tool with Owner secrets, one approved call at a time

ADR-0189 gave an ordinary Profile `ask_secret` and `secret_http`. Many tools a Bot works with are command-line programs that read their credential only from an environment variable. Without a consumer for them the Human exports the value in a terminal, where it reaches every later command. The owner asked for command-line use to be supported alongside the HTTP consumer.

## Decision

An Orchestrator in an ordinary Profile has `secret_cli`. It names a bare program, its arguments, and environment variables whose values hold `{{field}}` placeholders. The Host fills the placeholders from the Bot's own grants and starts the program itself.

- **No shell.** The program is started directly with the arguments as written. A path, a shell, an interpreter or a launcher as the program is refused, and so is a placeholder in an argument, where other processes could read it. Variable names that change how a program finds or loads code are refused.
- **Same file sandbox as Shell.** The command line goes through DSH's sandbox with the Bot's working folder as the writable root, so the credential store read denial from ADR-0189 applies to it too. When the sandbox is unavailable the command is not started.
- **Clean environment.** The program gets the search path, the home directory, locale and the named variables. Nothing else from the Host's environment.
- **One approval per call.** The approval card shows the program, every argument and the placeholders. It offers allow once and reject only; a saved approval rule never covers the call, and it cannot be decided from an external IM. An invalid call is refused before any card. A Session with full access skips this card ([ADR-0193](0193-full-access-also-unconfines-the-orchestrator.md), amended for [#1622](https://github.com/BotHarness/DeepSeekBot/issues/1622)).
- **Bounded result.** At most two minutes; the exit code and up to 32 KB each of stdout and stderr return to the Bot with the secret masked in raw, base64, hex and URL-encoded form.

`secret_cli` is not offered in the opt-in protected Profile, whose Shell runs in a container that a Host-started program would bypass. (That Profile was removed by [ADR-0192](0192-the-docker-protected-profile-is-removed.md).)

## What this does not promise

The program receives the secret. A tool with a subcommand that prints its credential, or one that can be made to send it elsewhere, will do so if a call asks for it and the Human approves that call. The refusal of shells and interpreters removes the trivial route and is a list, not a boundary. Masking guards against accidental echo. The real control is the Human reading the program and arguments on each card; that is why the approval cannot be saved.

Binding an account to the programs allowed to use it, chosen by the Owner on the input card, would move part of that control from each approval to the grant. It is not in this decision.

## Consequences

`secret_http` stays the first choice for a plain HTTP API because its destination is fixed by the Owner. `secret_cli` covers the tools HTTP cannot. The approval broker gains an `each-use` mode next to `operation` and `web-only`.
