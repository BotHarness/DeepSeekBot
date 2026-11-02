---
Status: Accepted
Date: 2026-10-20
Issues: [#2080](https://github.com/BotHarness/DeepSeekBot/issues/2080)
---

# Three-action tool approval and Full Access use native ask

The Human chose one ordinary card: **Allow once / Always allow / Reject**. Always allow remembers the selected tool within the existing PersonaBot, root-role and current Grant/cwd authority scope, including different inputs; it does not become an all-tools rule or a directory grant. The card explains this scope before selection. One click (or the A shortcut) both approves the current call and saves the rule, without a second confirmation. This slice does not infer a business category across different tools. The Host records the decision and activates a revocable `tool` rule in the existing Operational Database. Existing exact, broad and secret rules retain their meanings and remain visible and revocable. Generation 104 adds the tool kind without converting old rules.

This amends the ordinary-card presentation from ADR-0067 and the Full Access approval-policy composition in ADR-0193/0205. DSH `never` rejects an approval before dispatch; it cannot express ordinary automatic approval plus Human-only permission management. Top-level Full Access therefore keeps its selected execution mode/scope and uses native `ask`. The existing Channel Tool Approval responder automatically allows ordinary Full Access requests, rechecking that authority before execution; recognized permission/policy management skips remembered rules, Reviewer and that automatic answer. Human decisions still pass through native request/audit semantics. Native delegated Subagents retain their separately owned `never` policy.

Generation 104 updates existing Full Access Assignment approval snapshots from never to ask without changing their mode, Grant or preset revision; Orchestrator step synchronization aligns its existing Session. Turning Full Access off does not silently downgrade existing Assignment modes. Directory changes still require the shared authenticated Owner command and explicit read/write confirmation.

The Web card and online CLI share `allowed-always-tool`. Secret CLI remembers only its program/account/variable-name kind, and remembering an MCP service keeps its existing constrained behavior. Device grants and Human-only operations cannot acquire an unrestricted generic rule; the middle action stays disabled with a reason when unavailable. New tool rules cannot be created by a legacy IM actor without a matching verified authority contract. Mobile can read the new history while its native UI rollout remains a later qualified slice.

A Shell tool allowance can approve later native escalations beyond cwd; the card discloses that reach. Cwd is not a sandbox. Full Access and permission/policy text checks are application-defined user controls, not protection against arbitrary malicious processes running as the same OS user. Reverting code cannot remove schema generation 104 or revoke permissions already granted: revoke rules through the owner and use forward recovery.
