---
Status: Accepted
Date: 2026-10-14
Issues: [#1821](https://github.com/BotHarness/DeepSeekBot/issues/1821), [#1823](https://github.com/BotHarness/DeepSeekBot/issues/1823)
---

# An Approval Template lets a reviewer Session answer a Bot's tool approvals

A PersonaBot that hits a Tool approval card stops until a Human answers it. Nobody answers when the Human is away or the work runs for hours, and the Bot stalls. The @-wake end-to-end runs saw this whenever a model called `todo_write` or `send_message` and nobody clicked: the run timed out with no fault in the wake path. Saved Tool Approval Rules help only for calls the Human has already seen, and full access removes every check at once. The owner asked for a middle ground in their own terms: a written rulebook per Bot that a separate, clean model Session applies on the Human's behalf. Claude Code's auto mode and OpenAI Codex's auto-review are the same shape: a second model answers the approval, and the human keeps the final word through rules and fallbacks.

## Decision

**An Approval Template is a written approval policy. A PersonaBot can select one. While it is selected, an Approval Reviewer answers that Bot's approval requests before any card is posted.**

### Where it runs

`ChannelToolApproval.request()` keeps its order, and the reviewer goes in just before the card:

1. A call DSH runs without asking never reaches it. Under [ADR-0205](0205-bot-sessions-follow-dsh-permission-mode-for-shell-and-plugin-tools.md), plugin and Shell tools reach it only when DSH itself raises an `approval/request`, for example for a sandbox escalation.
2. A saved Tool Approval Rule that matches is applied as before.
3. **New:** if the Bot has an Approval Template and auto approval isn't paused for the Session, the Approval Reviewer decides.
4. Otherwise the Tool approval card is posted, as before.

Every approval that reaches step 3 is eligible: DSH asks such as Shell `sandbox_permissions`, plugin tools, editing an original attachment, `secret_cli` and `secret_mcp_connect` calls, and Computer and Browser Authorization. A Session with full access never reaches the gate, as before.

### Approval Template

- A template is one Markdown file, `approval-templates/<name>.md`, in the Profile. Its text says what may be approved, what must be refused and what must go to the Human, in the Human's own words. The Host never parses rules out of it; the text is the reviewer's instructions.
- BotHarness ships built-in templates that are read-only and can be copied. One starter set is enough: a cautious one and a get-the-work-done one.
- Templates are a Profile-wide library. Each PersonaBot selects one template or none. None is the default, so nothing changes until the Human opts in.
- The Human can write a template in the settings page or with `deepseekbot approval-template create|edit`. Because the CLI can write templates, the Human can also ask a Bot or a Session to draft one from a description of their situation.

### Approval Reviewer

- The reviewer is a fresh DSH Session with no tools and no Memory. It is created for one decision and then closed. It does not inherit the Bot's Session.
- **Approval Review Session.** Each review is a real DSH Session whose id starts with `approval-review-`, titled `Approval review · <bot> · <tool>`, in the folder `botharness/approval-reviews` under the DSH home. It mounts no Agent Preset: its only system prompt section is the reviewer prompt, runtime context is suppressed and the tool list is empty. Closing it keeps its log, so the Human can open it in DeepSeek Harness to see how a call was judged. The session list hides these Sessions unless the Human turns on "Show Approval Review Sessions", which is off by default and separate from the Bot Sessions switch. A step that BotHarness is not driving is refused, so typing into an old review cannot turn it into a working Session.
- **Model.** The reviewer uses the Bot's own model by default. A Profile-wide setting can name a single reviewer model for every Bot instead.
- **Context.** The reviewer gets the template text, the pending call (tool name, full input, working directory, Session role, Channel) and a bounded excerpt of the Session: the Human's messages and the Bot's earlier tool calls. Tool results, web pages, file contents and the Bot's own prose are left out. This keeps text the Bot read from steering the reviewer, as in Claude Code's auto mode. Boundaries the Human stated in the conversation ("don't send anything yet") reach the reviewer and count as reasons to refuse.
- **Outcome.** The reviewer answers with one of three outcomes and a short reason:
  - **allow:** the call runs, as if allowed once. No rule is saved.
  - **reject:** the call is refused, and the reason goes back to the Bot as the tool result so it can try another way.
  - **ask Human:** the ordinary card is posted. Use this when the template doesn't cover the call or the reviewer is unsure.
- **Failure.** A timeout, an error, or an answer that doesn't parse is treated as ask Human. The reviewer failing never approves anything and never silently drops a call.

### What the Human sees

- An allowed call leaves a folded record in the Channel where the card would have gone (`Auto-approved by <template>: <reason>`). It sends no notification.
- A rejected call also becomes a Human Inbox item with the reason. From there the Human can **allow this once anyway**. The override covers that exact call only. The Bot is told and may retry it, and later calls are still judged by the template.
- **Circuit breaker.** After 3 rejections in a row, or 20 in one Session, auto approval pauses for that Session and every request goes back to a card. The next approval the Human gives resumes it. The thresholds are fixed.
- **Restart.** The breaker and unused overrides live in Host memory. A Host restart resumes auto approval with fresh counts and drops an override the Bot has not used yet ([#1826](https://github.com/BotHarness/DeepSeekBot/issues/1826)).

### What the reviewer can never approve

A Bot can run the CLI from Shell, so without a guard it could loosen its own policy. These changes always need a Human approval card, and neither the reviewer nor a saved rule can answer them:

- selecting or clearing a Bot's Approval Template;
- editing or deleting a template that some Bot currently uses;
- changing the Profile-wide reviewer model.

Writing a new template, or editing one that no Bot uses, needs no card. A Bot can therefore draft a template, and the Human confirms it once when it is selected.

### CLI

Following CLI parity:

- `deepseekbot approval-template list|show|create|edit|delete`;
- `deepseekbot bot approval-template set <bot> <template|off>`;
- `deepseekbot approval-reviewer model set <model|bot>`.

## Considered options

- **A reviewer per Channel or per Workspace Grant.** Rejected for now. The Bot is the unit the Human thinks of as having standards, and one selection per Bot is simpler to read and audit.
- **Two outcomes (allow or reject).** Rejected. Without ask Human, an unsure reviewer has to guess, and both kinds of wrong guess are worse than a card.
- **Giving the reviewer tool results.** Rejected because of prompt injection. Content the Bot fetched is exactly what an attacker controls.
- **Keeping secret tools and device Authorization out of the reviewer.** The owner chose to include them. A Human who doesn't want that keeps those lines in the template ("always ask the Human for secret_cli").

## Consequences

- A Bot with a template can work for hours with no one watching, within limits the Human wrote down. The Human gives up reading each call, and gets the folded records, Inbox items and the circuit breaker in return.
- Each reviewed call costs one extra model call. Calls that DSH runs without asking, and calls that saved rules cover, cost nothing, so those remain the first choice for routine, side-effect-free tools.
- The reviewer can be wrong, as Codex's documentation warns for its own auto-review. It is a convenience layer, not a security boundary. The Workspace Grant checks, the sandbox and secret masking still apply to every call it allows.
- `ChannelToolApproval` gains a decider before the card, a per-Session breaker, and a record message type. The Human Inbox gains an auto-rejected item with an override action.
