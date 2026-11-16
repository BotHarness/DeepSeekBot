# Approval Templates and auto approval

A Bot inherits the optional global default, selects one complete shared template, or disables its Reviewer (ADR-0342). Deterministic authorization runs first; Reviewer outcomes are allow for this call or ask-human.

## Sub-features

- `library`: Bot settings → Auto approval → Global default template (DSH Select), existing template library and Reviewer model. No global default means inherited review is off. Read failures remain errors.
- `editor`: New template requires Blank or one selected source; edit independent Always ask/Always allow rows in the same grouped card list as External identities/connectors (outer top/bottom corners, straight middle joins), plus free text; save alone or apply to a named Bot. Copy a custom or built-in template independently; shared-original editing lists actual users including global inheritors. Read back full content and selection through CLI.
- `cli`: `approval-template list --bot <bot>`, `approval-template-global-set <name|off>`, `approval-template-set <bot> <inherit|name|off>`; library create/edit commands retain existing Markdown contents.
- `select`: Channel settings → Auto approval, or composer Workspace Grants panel → Auto approval, uses the same DSH Select. Inheritance shows its effective global source. Specific selection replaces global; Off retains deterministic rules.
- `mobile`: Bot profile → Settings → Permissions → Workspace grants → Auto approval template, inside the existing iOS sheet / Android `ModalBottomSheet`. Inherit global shows the resolved global template (or Off); selecting Off then Inherit global writes null then @global through the same Host owner. Legacy Hosts without a global-selection field retain their supported choices.
- `reviewer`: a covered call leaves an auto-approved record with template identity/version; an uncovered or failed review posts a Human card with the reason and captured version when available. No new model rejection or rejection pause occurs.
- `delete`: custom template → Delete opens a read-only impact preview. It lists visible direct/global users plus protected private-reference count and the resulting global template/Off/unavailable state. Confirming its revision switches direct users to inherit and clears a deleted global default. Stale references/policy/content require a fresh preview and another confirmation. Failed reads do not delete or change choices.
- `guard`: effective template/global/Bot policy changes bypass Full Access and model review, retaining Human or explicit management-scope authorization and execution fences (ADR-0249).

## How to get to it (user POV)

Bot mode → Bot settings → Auto approval for global default; open a Bot DM → Channel settings → Auto approval for its selection.

## Driving it with verify-app

Use an isolated Host and its own authenticated CLI. Confirm health and Client console/DOM before each journey. Use the actual CLI Host origin and a private token file; never put tokens in screenshots or args.

1. Capture light/dark global and Bot selection before/after at the same viewport and locale.
2. Set global cautious with the CLI, select inherit through the Client, and read back list --bot: selected @global, source global, effective cautious. Change global to get-work-done: inheritance follows. Select cautious specifically, change global or clear it: the Bot remains cautious. Select Off: effective null, source off.
3. New Bot creation reads back @global; a retained legacy missing field remains Off. Restart verifies persistence without schema changes.
4. Trigger an existing approval through the native tool path. A deterministic saved rule makes zero Reviewer calls. An uncovered call uses the effective template and leaves either the versioned auto-approved record or Human card; answer that card through the normal owner.
5. Edit/switch during an injected Reviewer wait at the Channel Tool Approval seam: this Review retains the old identity/version, the next uses the new one. Missing/unreadable template or model timeout/malformed response posts Human with a reason, even if diagnostics fail. Check canonical Channel records and developer logs.
6. Create a custom template and an explicit user, an inherited user, another specific user and an Off control. Preview deletion through CLI and Client without mutation; confirm after checking all effects. With another global default, direct users inherit it. Delete the global default: clear it and leave inheritors inherited with Reviewer off. Change refs/content/global between preview and confirmation: refusal and refreshed impact, no replay. Keep an existing Human review pending across deletion and verify its captured template/version on settlement. Saved rules and Full Access do not change.
7. Exercise a policy-management approval under Full Access; Reviewer calls remain zero and only Human or an explicit management rule can authorize effects. Revoke the rule before execution and verify refusal.

## Native mobile qualification

Use the shared device QA lane and T3 device tools. The same synthetic Bot and isolated QA Host must be used for before/after, with the current PR/source/build identities recorded. In Bot profile → Settings → Permissions → Workspace grants, verify the inherited row is checked and names the global template or Off. Choose Off, return to Inherit global, then choose one specific template; read back each selection using the authenticated CLI. A global switch updates the inherited row after refresh while a specific choice remains specific. Read failures stay visible failures. Capture default/intermediate/maximum system text in light/dark, keep the last choice reachable, and distinguish Android, iOS and Human acceptance. Web screenshots do not qualify this journey.

## Gotchas

- `/tmp` may already be writable; an ordinary file write there need not reach an approval gate.
- Three-part editing, confirmed bulk deletion and the card-rule table have distinct journeys. Verify legacy Markdown conversion, next-Review snapshot behavior and deletion fallback separately.
- Browser screenshots establish Web behavior only. Preserve failed drives and observe before retrying.

## Human result retention (#4211)

After Reviewer asks the Human, verify a compact sent-to-Human row precedes the real request. Open request details, then Allow once, Always allow or Reject: command/tool/folder/input remain, opened details stay open, and the chosen disabled control is identifiable. Reload history and verify the full request remains readable with no resubmission. Mobile uses the existing validated message projection for decided history without one timeline/status RPC per card; malformed/purged content stays unavailable. Historical Reviewer rejection rows remain readable; new ask-human rows cannot be overridden as rejections. Use the public online CLI synthetic missing-secret path on Windows; do not run the native-pwsh journey under the Human no-PowerShell constraint.
