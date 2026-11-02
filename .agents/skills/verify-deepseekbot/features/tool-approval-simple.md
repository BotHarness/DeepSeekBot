# Three-action tool approval and coherent Full Access

## Sub-features

- Behavior ID: `desktop.approval.three-actions`.
- Ordinary Channel, Activity and companion reuse renders Allow once / Always allow / Reject.
- Always allow remembers only the selected tool in the current Bot/role/authority scope; changed inputs match, another tool or revoked rule does not.
- Permission and policy management offers Always allow in a separate explicit scope; old ordinary rules do not gain this authority. Full Access ordinary actions do not ask; sensitive management still asks until the Human opts in.
- Schema generation 104 preserves legacy rules and normalizes old top-level Full Access Assignment approval policy without widening its permissions.
- Browser and Computer tools offer the same saved action; Browser rules survive a new Session for the same Bot/tool/target. Change the target and verify a new card, revoke its rule and verify prompting returns.
- Device rules remain tool-specific inside the same Session: approving browser_open must not approve browser_click, and revoking browser_open must restore its card immediately. Switch targets away and back, restart the Host and verify the old scope does not return. Changing the Browser Profile must also prompt.
- Tob install/restart/delete cards accept saved tool rules but retain command confirmation, revision and deletion-token checks. Phone secret_cli notifications expose Always allow; external reviewers retain approve/save-rules checks.

## How to get to it (user POV)

Bot mode → the synthetic **2080 审批体验** Channel → Messages → a native PowerShell approval card. Read the disclosed current-tool scope, then choose **Always allow**. A later changed-input call of that tool completes without a new card. Revoke the saved rule in the folder/access panel, or through the online CLI, and another request asks again.

Enable Full Access for only that QA Bot through its existing confirmation. Ordinary marker output runs directly. A recognized permission-management command still produces a card; Always allow is enabled. Save it, verify a later matching call reaches execution without a new card, revoke the rule and verify prompting returns. Reject it and verify no authorization was changed.

## Driving it with verify-app

```bash
pnpm build
node scripts/verify-app.mjs launch --name ax2080-simple
node scripts/verify-app.mjs doctor --name ax2080-simple
node scripts/e2e-tool-approval-simple.mjs --name ax2080-simple
```

This Windows native-pwsh journey creates a synthetic Bot, uses real model calls, clicks Web Always allow, then checks changed input, other-tool rejection, CLI revoke/allow-once, Full Access ordinary output and explicitly rememberable management. It retains screenshots, card crops, ARIA, Client diagnostics, native trace, canonical decisions and rules. The model must report actual tool output; a successful decision call is not execution proof.

For a baseline capture, provide `--capture-report <private-json> --expect-legacy`. The private record identifies an existing task-owned instance, Bot and pending request. This mode reads and captures only; it does not decide or create a Bot. Never use a Human's real request as a disposable verification input.

## Gotchas

- DSH native pwsh uses `sandbox_permissions: danger-full-access`, not Codex's `require_escalated`. A harmless output marker explicitly requesting that mode can exercise the real ask without touching a sensitive file.
- DSH `never` rejects before answerers. Top-level Full Access now keeps `ask`; delegated Subagents retain their native policy. Do not bypass never to manufacture a pass.
- The current shell has a Preview Notice and a workspace rail. Dismiss the actual Continue dialog before navigating; do not wait for a Settings button hidden under the account menu.
- Preserve a failed run and observe before retrying. A model that refuses to call the requested tool is a failed model-path attempt, not a successful approval test.
- Native mobile UI, IM new-rule creation, every Shell Provider, and the full recovery matrix are not qualified by this Web slice. Mobile cards and notification actions submit `allowed-always-tool`; native device rendering and delivery acceptance remain tracked in issue #2742.

## Single-click copy acceptance

The ordinary card explains same Bot, same tool and current authorization scope before selection; different inputs are covered. Click Always allow once: it submits the persistent decision directly, without another confirmation dialog or button. The A shortcut does the same. Check Chinese and English copy in Channel, Activity and companion cards; no cross-tool business category is promised. Settings retain rule revocation.

## Submission and recovery

All three card surfaces show Submitting on the selected action and disable decisions while the request is in flight. A failed status read remains unavailable, not expired. Recheck request reads current Host state without replaying a decision; an actual Host expiry stays expired. The component regression suite covers failed initial reads, failed submission followed by failed status reads, and same-tick duplicate clicks. Browser recovery still needs a real interrupted connection; component coverage is not browser proof.

For first-time setup, the homepage instruction names the actual Allow once button. Full Access copy states that turning it off restores workspace permissions for chat and new Assignments, while existing Assignments retain their creation-time permission.

## Companion reading space

With a visible floating companion, scroll to the latest approval and reply and verify their bottom edge is above the passive avatar and toolbar. The running status above the composer must also remain clear of the avatar. Repeat at 375px width, with reduced motion, and after activity fades; removing every companion returns the space, while toggling companions during history reading must not jump to the latest message. This checks the latest content at the bottom, not arbitrary history positions or intentionally opened companion bubbles/menus.
