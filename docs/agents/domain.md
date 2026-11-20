# Domain Docs

How engineering skills read and record decisions in this repository.

## Before exploring, read these

- Read the root [glossary](../../GLOSSARY.md) and the relevant [topic decisions](../decisions/).
- Check [numbered records](../adr/) for decisions still in flight.

## Record decisions

For BotHarness, record new decisions directly in the matching `docs/decisions/<topic>.md` section with the current decision, a brief why, and an `Enforced by` line. This repository layout takes precedence over the generic `domain-modeling` template. Update the [living architecture](../architecture/botharness-architecture.md) when the decision changes how the system works.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
