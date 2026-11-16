---
Status: Accepted
Date: 2026-11-15
Issues: [#4203](https://github.com/BotHarness/DeepSeekBot/issues/4203), [#4211](https://github.com/BotHarness/DeepSeekBot/issues/4211)
---

# ADR-0342: Bot approval selects one template and keeps deterministic authorization separate

Accepted by the Human after a design interview and explicit confirmation on 2026-11-15. This is a target design, not an implementation or permission change. The full contract and specification differences are in [Bot approval policy](https://github.com/BotHarness/BotHarness/blob/main/docs/architecture/bot-approval-policy.md) ([中文](https://github.com/BotHarness/BotHarness/blob/main/docs/architecture/bot-approval-policy.zh.md)). Storage and SQLite migration remain separate work.

## Context and decision

ADR-0207 introduced a Human-written Markdown template selected by each Bot and a model Reviewer with allow, reject and ask-Human outcomes. Issue #4203 and E3 #4211 propose natural-language Always ask, Always allow and free text, but combine a shared template with Bot-local extra rows. That layered policy makes it harder to know which policy is effective and what a shared edit changes.

A Bot instead has one of three choices: dynamically inherit the optional global selection, select a specific shared template, or disable the Reviewer. A specific selection replaces the global template completely. New Bots inherit; existing Bots retain their specific selection or disabled state. Shared templates remain reusable; creation explicitly chooses a blank template or a copy, and saving explicitly distinguishes saving alone from saving and applying to the current Bot.

The three template sections are natural-language Reviewer instructions. Always ask takes precedence over Always allow; free text supplements them without cancelling their requirements. The Reviewer returns only allow for the current request or ask-human. Conflicts, insufficient coverage, uncertainty and failures go to the Human. It neither rejects autonomously nor creates reusable Tool Approval Rules. This trades autonomous rejection for Human control over requests the model will not approve; rejection-based Reviewer circuit breaking no longer applies.

Deterministic authorization is resolved before calling the model. Human-saved card rules stay Bot-scoped, show their source and scope, remain revocable, and are neither template rows interpreted by the model nor copied with templates. Full Access is not blanket exemption from the irreversible external-effect approval proposed by E2 #4210. Actual tool-effect admission belongs to that work; this decision does not implement it. Natural-language instructions are fallible and are not deterministic security boundaries.

Each Review uses the template version captured at its start. Edits and selection changes affect later Reviews, accepting that an already-started Review can finish with the previous policy. Approval records retain the template identity and version used. This does not waive current ownership, Grant, scope or authorization-revocation checks.

Deleting a referenced template requires one explicit second confirmation listing affected Bots and their resulting choices. Specific references fall back to inherit-global. If the template is also the global default, deletion clears that default; affected inherited Bots consequently have no Reviewer. This deliberate, disclosed change differs from a missing/corrupt template or Reviewer failure, which goes to the Human without silently rewriting choices. Users need not remove references one by one.

## Authority and alternatives

The existing application-defined approval owner remains responsible for decisions. Bot-level selection and policy are application concepts, not DSH-native modes. Effective policy management cannot be authorized by the model Reviewer or Full Access; a Human decision or an explicitly saved rule covering that management operation is required, preserving ADR-0249's separate management scope and current execution fences.

This amends ADR-0207's template selection, Markdown-only policy shape, three Reviewer outcomes and rejection circuit breaker as target design, not retroactive runtime fact. ADR-0249 continues to govern explicit management authorization. The existing issue bodies are not rewritten by this record.

Rejected alternatives were global-plus-Bot layering (ambiguous effective policy), applying new defaults to old disabled Bots (implicit opt-in), autonomous model rejection (removes the Human's decision on unapproved requests), hidden copies/application (unclear scope), and refusing deletion until every reference is removed (unnecessary repeated work). The selected design makes defaults dynamic and deletion easier, at the cost of a carefully disclosed bulk change and immutable policy snapshots for already-started Reviews.

## File compatibility for #4244

Three-part editing keeps the existing template-file owner and 32 KiB bounded reader. A saved structured template uses the exact marker `<!-- botharness:approval-guidance:v1 -->`, a newline, then JSON containing `alwaysAsk` and `alwaysAllow` string arrays and `freeText`. This is a versioned content representation inside the existing file, not a SQLite migration. Legacy Markdown without that marker maps in full to free text with empty row arrays; headings are not parsed into rules or rewritten. Invalid marked content is unavailable, so a Review falls back to the Human. The Review content hash covers the complete saved representation; decoding for Reviewer assembly uses only that captured text. Copies contain content only. Global defaults and built-ins are unchanged.
