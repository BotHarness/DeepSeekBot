# Approval decisions

How a Bot's tool call gets approved: who may answer, in what order, what a saved answer covers, and what an Approval Template and its Reviewer may and may not do. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); DSH permission modes and full access are in [Session decisions](sessions.md#adr-0205); secret tools are in [Secret decisions](secrets.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0207, 0238, 0239, 0249 and 0342 and 0346, and each section lists the ADRs it absorbed.

Two rules govern tool approvals:

- **One owner decides, from one pure function.** `ChannelToolApproval` is the only approval owner. Every path it takes (Full Access, a saved rule, the Reviewer, a Human card) comes from `decideToolApproval` in `workspaces/tool-effects.ts`; the Web card, phone card, IM card and online CLI all submit decisions to that owner. There is no second approval queue or permission store.
- **Only a Human loosens policy.** Changing who or what answers approvals (template selection, a template a Bot uses, the Reviewer model, directory write authority) needs a Human decision or a rule the Human saved for exactly that operation. Neither the model Reviewer nor Full Access can answer it.

## 1. A call is answered in a fixed order, and the card is the last resort

_Formerly ADR-0207 (where the Reviewer runs) and the Full Access part of ADR-0239._

Admission comes first: a call DSH runs without asking never reaches the owner, and plugin and Shell tools reach it only when DSH raises an `approval/request` (§4). For a call that does reach it, the owner tries, in order:

1. **Full Access.** An ordinary request in a Session with Full Access is allowed once, and that authority is checked again before execution.
2. **A saved rule** that matches the call's Bot, role, scope and tool.
3. **The Approval Reviewer**, if the Bot's effective template is on and the template can be read (§6).
4. **A Tool approval card** to the Human, in the Channel the task came from.

Top-level Full Access keeps its execution mode and uses DSH's native `ask` policy, and the owner answers those asks automatically; DSH `never` would reject a request before dispatch and could not keep management calls Human-only. Delegated Subagents keep their own `never` policy ([Session decisions](sessions.md#adr-0205)). A call marked each-use skips Full Access and saved rules.

Why: a Bot that hits a card stalls until someone clicks, and the @-wake end-to-end runs timed out for exactly that reason. Cheap deterministic answers go first so the model is called only when nothing the Human already decided covers the call, and the card stays as the answer when nothing else may decide.

Enforced by: `approval-authority.property.test.ts` (for any effects and context, a higher path wins over every lower one and a path is chosen only when its condition holds), `tool-effects.test.ts`, `tool-approval.test.ts`, `full-access-inheritance.property.test.ts`.

## 2. Every card offers Allow once, Always allow and Reject

<a id="adr-0239"></a>
_Formerly ADR-0239 (the three actions) and ADR-0249 (saving rules on every card)._

One click (or the A shortcut) both approves the current call and saves a rule, with no second confirmation; the card explains the scope before the click. Always allow saves a revocable `tool` rule for that tool within the same Bot, root role and current Grant and cwd, whatever the input; it is never an all-tools rule and never a directory Grant. The rule kinds are `exact`, `tool`, `secret-cli` and `all-opaque`; a `secret-cli` rule remembers only the program, account and variable names, and remembering an MCP service keeps its own access checks. Rules live in the Operational Database, are listed with their source and scope, and can be revoked. Each authorized call still returns DSH's native allowed-once outcome. A Shell rule can approve later native escalations beyond cwd, and the card says so; cwd is not a sandbox. Browser, Computer, permission-policy and Tob management cards offer Always allow too (§3).

The same decision, `allowed-always-tool`, comes from the Web card, the phone card and the online CLI. An external IM reviewer may save a rule only when it holds current approve and save-rules authority and its Provider supports confirmed rule cards; otherwise its control opens the authenticated app.

Why: the Human asked for the same three actions on every approval. A rule that remembers the tool, not the input, matches how people think about trust ("this Bot may run tests"); a rule wider than the tool would silently grant things the Human never saw.

Enforced by: `tool-approval-rules.test.ts`, `secret-cli-approval-rule.test.ts`, `lark-approval-standing-rules.test.ts`, `tool-approval-history.test.ts`.

## 3. Management and device calls accept only an explicit Human answer

<a id="adr-0249"></a>
_Formerly ADR-0249 (management and device scope), with the authority rules of ADR-0207 and ADR-0342._

A call is protected when its effects declare `authority: 'management'`, it requires explicit approval, or its input changes approval policy, publishes Bot Memory or deletes a Marketplace Bot (`requiresHumanDecision` in `workspaces/approval-templates.ts`). A protected call is answered only by a Human card or by a rule the Human saved from a card for that tool or exact call. Full Access and the Reviewer never answer it, and an `all-opaque` rule never matches it. Browser and Computer Authorization use the same explicit scope: their rules include the current authorization target, its configuration and a persisted epoch, and Browser rules also include the assigned Browser Profile and the paired Chrome Profile; switching targets rotates the epoch. A saved device rule grants only the native execution token for that call, never a Session-wide device grant, and the Provider checks the current rule again before use. An unreadable target record gets a new epoch, and failing to save it refuses the call.

Rules saved before this scope existed acquire no management or device authority. Tob's broker also requires a committed Human decision or a matched saved rule for sensitive operations; a native allowed-once alone never authorizes a brokered write, and command-specific confirmations, revision checks and deletion tokens stay in force.

Why: a Bot can run the CLI from Shell, so without this a Bot could loosen its own policy through a Reviewer it can influence or through Full Access. Letting the Human save a rule keeps that choice theirs: they may decide that later destructive management calls need no card, and they can revoke it.

Enforced by: `approval-authority.property.test.ts` (for any effects and context, a protected call never takes Full Access or the Reviewer, and a protected or device call takes a saved rule only when it is explicit), `auto-approval-breaker.test.ts` (a global-policy edit stays behind a Human despite Full Access and a broad rule), `device-approval.test.ts`, `tob-cli-approval.test.ts`.

## 4. Admission follows each tool's declaration, not its effect labels

_Formerly the admission amendment of ADR-0342 (confirmed 2026-11-18, restoring the behavior of #4337)._

Each first-party tool declares its effects and an admission class in `FIRST_PARTY_TOOL_EFFECTS`: `native` (DSH decides), `existing` (an existing check decides), `always` (always ask) or `attachment` (ask when writing an original attachment). A request reaches the owner when its class requires it, its effects declare management, or it is protected. Outside `attachment`, effect labels describe the call and appear on its card but never decide admission, so an irreversible external effect alone does not add a card or override Full Access. `attachment` is the one class that reads an effect: opening an original attachment to read (`changes: 'none'`) runs natively unless the call is protected (§3), and any write asks. Secret, Bot-creation, attachment-write and protected-management checks keep their own boundaries, and Browser and Computer keep per-Session authorization instead of a card per action.

Why: a blanket card for every irreversible external effect put a card in front of ordinary messaging, delegation and already-authorized device actions. The Human chose fewer cards and no claim of a universal guarantee for every external effect.

Enforced by: `approval-authority.property.test.ts` (for every class but `attachment`, changing a call's changes and reach never changes whether it is admitted; for `attachment`, exactly the writes and the protected calls are admitted), `tool-effects.test.ts`.

## 5. A Bot uses one Approval Template: the global one, a specific one, or none

<a id="adr-0342"></a>
_Formerly ADR-0207 (the template library) and ADR-0342 (selection, format and deletion)._

An Approval Template is a Profile-wide file, `approval-templates/<name>.md`, of at most 32 KiB. Two built-ins, `cautious` and `get-work-done`, are read-only and can be copied. A Bot inherits the optional global selection (`@global`), selects one specific template, or turns the Reviewer off. A specific template replaces the global one completely; there are no Bot-local extra rows. New Bots inherit; existing Bots keep their specific selection or off.

A template has three natural-language parts: Always ask, Always allow and free text. Always ask wins over Always allow, and free text adds to them without cancelling either. Saved structured content starts with the marker `<!-- botharness:approval-guidance:v1 -->`, a newline and JSON with `alwaysAsk`, `alwaysAllow` and `freeText`. Legacy Markdown without the marker is read whole as free text; its headings are never parsed into rules. Content with the marker that does not decode is unavailable, and a Review then goes to the Human. Creating a template chooses blank or a copy; saving chooses between saving alone and saving and applying to the current Bot.

Deleting a template that Bots use needs one second confirmation that lists those Bots and what each will use next. Bots that selected it fall back to the global selection; if it was also the global default, the default is cleared and inheriting Bots have no Reviewer. A missing or corrupt template is not a deletion: it sends the call to the Human without rewriting any selection.

Writing a new template or editing one no Bot uses needs no card, so a Bot can draft a template that the Human confirms once by selecting it. Selecting, changing the global selection, editing or deleting a template in use, and changing the Reviewer model are management (§3). The CLI is `tobs approval-template list|show|create|edit|delete`, `tobs approval-template-set <bot> <template|inherit|off>`, `tobs approval-template-global-set <template|off>` and `tobs approval-reviewer-model-set <provider/model|bot>`.

Why: one effective template per Bot makes it obvious which policy applies and what a shared edit changes; the earlier global-plus-Bot layering made both unclear. Applying a new default to Bots the Human had turned off would be an implicit opt-in.

Enforced by: `approval-template-library.test.ts`, `approval-template-deletion-persistence.test.ts`, `tool-effects.test.ts` (the inherited global selection stays management).

## 6. The Reviewer allows a call or sends it to the Human, and never rejects

<a id="adr-0207"></a>
_Formerly ADR-0207 (the Approval Review Session and context, and its request-scoped amendment) and ADR-0342 (two outcomes and policy snapshots)._

Each Review is a fresh DSH Session with no tools, no Memory and no Agent Preset, created for one decision and closed after it. Its id starts with `approval-review-`, its title is `Approval review · <bot> · <tool>`, and it lives in `botharness/approval-reviews` under the DSH home, so the Human can read how a call was judged; the session list hides it unless "Show Approval Review Sessions" is on, and a step BotHarness is not driving is refused. It uses the Bot's model unless a Profile-wide Reviewer model is set.

The Reviewer sees the template text, the pending call (tool, input with secret values replaced by placeholder names, cwd, role, Channel) and, for an ordinary model turn, a bounded Session excerpt: up to 8 Human messages and 12 earlier tool calls, never tool results, file contents, web pages or the Bot's prose. An authenticated direct call that borrows a live Orchestrator gets no excerpt, only the template and the call. The Review uses the template version captured when it starts, and the record keeps that template's name and content hash.

It answers **allow** (this call only, no rule saved) or **ask-human** (the card is posted with the reason). A timeout (60 seconds), an error, a missing model or an answer that does not parse goes to the Human. An allowed call leaves a folded `Auto-approved by <template>: <reason>` record in the Channel and sends no notification. The Reviewer is a convenience, not a security boundary: Workspace Grants, the sandbox and secret masking still apply to every call it allows.

Why: a rejecting Reviewer would take a decision away from the Human for exactly the calls the model would not approve, so an unsure or refusing Reviewer asks instead; with no rejections, the old rejection circuit breaker had nothing to count and is gone. Tool results and fetched content are left out because that is the text an attacker controls. A direct caller must not see, or be steered by, an earlier Human conversation in a Session it only borrows.

Enforced by: `approval-authority.property.test.ts` (any Reviewer answer reads back only as allow or ask-human), `approval-reviewer.test.ts`, `approval-reviewer-model.test.ts`, `auto-approval-breaker.test.ts` (Human rejections never pause later Reviews), `adr-0186-direct-private-tool-approval.property.test.ts`.

## 7. Approving a folder request grants write access in the same commit as the Channel decision

<a id="adr-0238"></a>
_Formerly ADR-0238, which amends the Assignment write rule of ADR-0067._

The Workspace request approval command is the one Host entrance for the Web request card and the online CLI. The Human confirms the exact directory for this Bot, including upgrading an existing read-only Grant. The Grant owner prepares the directory without writing; its commit joins the Channel owner's Operational Database transaction, so the writable Grant, the Grant-linked Human resolution and the resulting Inbox Admission commit or roll back together. The command reads authority back and continues the original task through the existing runtime. A repeated decision reads the existing resolution and Grant; it cannot revive a revoked Grant or schedule a second continuation. An Agent asking through the CLI goes through the Human-only policy gate (§3). A tool's allowed-once is never a persistent directory Grant, and existing read-only Grants are never upgraded silently.

An Assignment cannot bypass its Grant's disabled write permission, and it keeps its own Grant and single cwd; Memory stays the Orchestrator's fixed cwd. Revocation blocks later calls, not effects already dispatched, and a call whose execution is unknown is never replayed as recovery. Reverting code does not revoke what a Human granted; revoke through the owner.

Why: a Human approved a folder and the Bot still could not write, because the Client created a read-only Grant and sent a separate success reply. One transaction makes "approved" and "can write" the same fact.

Enforced by: `grant-request-approval.test.ts`.

## 8. Skill Invocation snapshots text and leaves routing explicit

<a id="adr-0346"></a>

The conversation's `/` menu offers commands before Skills. It lists Host Skills and Project Skills from each eligible PersonaBot's Memory Repository and active Workspace Grants, with one PersonaBot in a DM. Workspace ownership is keyed by the stable Workspace ID. A same-named command keeps the bare name. Automatic model discovery follows the Bot's own catalog and does not pick up the other conversation participants' Skills.

On send, the Host resolves each selected Skill and stores its name, owner, path and text in a typed Channel Message part. Each Bot Inbox recipient gets the same `<skill_invocation>` snapshot. Ordinary Channel routing and explicit mentions still choose recipients. Recipients' present [file access rules](workspaces.md#adr-0067) govern access to the referenced files, and external IM mirrors use the plain `/name`.

Why: An explicit selection fixes the text at send time even if the Skill changes later. Independent routing lets a Human send one Bot the text of another Bot's Skill while keeping file access with its existing owner.

Enforced by: [Host Skill catalog](../../packages/core/test/skill-invocation-catalog.test.ts), [Human DM routing and snapshots](../../packages/core/test/skill-invocation-human-dm.test.ts), [Group Channel Skill Invocation](../../packages/core/test/skill-invocation-group-channel.test.ts), [Workspace Skill lookup and revocation](../../packages/core/test/workspace-skills.test.ts), and [Channel file access](../../packages/core/test/grant-execution.test.ts).
