---
Status: Accepted
Date: 2026-10-26
---

# Prompt Presets edit the behavior text of prompts, not their contracts, and apply per Session

The Host's Orchestrator system prompt and its per-turn templates are split into named Prompt Parts. A Prompt Part is behavior text, such as how to report progress or when a Group mention needs a reply, that a Human may rewrite. Everything around the parts stays fixed: tool names, `source_event_id` and `answer_to` rules, the reply transport and the Inbox structure. Those are contracts the Host relies on to deliver replies and route answers.

A Prompt Preset is a named set of part texts stored in the Profile. Each part resolves per Bot in this order: the Bot's own override, then the Bot's chosen preset, then the global preset, then the built-in text. A preset stores only the parts it changes. An edit records a hash of the built-in text it replaced. Parts nobody edited follow built-in updates. An edited part keeps its text and reports `defaultChanged` so the UI can show the newer default.

A Session uses one frozen set of texts. The first time a Session needs a part, the resolved non-default texts are written to its ownership row (`prompt_snapshot`). They are refreshed only on `compaction/end`, the same point where the Persona snapshot is refreshed. Until then `bot-prompt` reports `pending`.

Assignment and approval-reviewer prompts are out of scope for now.

## Why

Humans asked to see and tune what the Host tells a Bot without forking the Host. Exposing whole sections would let an edit silently break reply delivery or answer routing, so only the behavior layer is editable.

Freezing the text per Session keeps the provider prompt cache stable and makes a turn reproducible from its Session. Applying edits at compaction or a new Session is the same rule users already see for the Persona.

## Consequences

- The CLI gains `prompt-parts`, `prompt-presets`, `prompt-preset-create|update|delete`, `prompt-global-set`, `bot-prompt` and `bot-prompt-set`.
- Presets live as JSON under `<dsh-home>/botharness/prompt-presets/`. A Bot record gains optional `promptPreset` and `promptOverrides`.
- Deleting a preset clears it from the Bots that chose it and from the global setting.
- With no preset or override, prompts are byte-identical to the built-in prompts.
