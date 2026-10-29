---
Status: Accepted
Date: 2026-10-19
Issues: [#2080](https://github.com/BotHarness/DeepSeekBot/issues/2080)
---

# Workspace request approval commits write authority with the Channel decision

A Human approved a folder request but the PersonaBot still could not write: the Client created a read-only Workspace Grant and separately sent an authorization reply. A newer folder dialog had its own write toggle, so different entry points promised different authority. The Human chose a simple experience: authorize a directory once for persistent read/write, then let the original task continue.

The application-defined Workspace request approval command is the shared Host entrance for the Web request card and online CLI. The Grant owner prepares the selected current directory without writing authority; its checked commit joins the Channel owner's existing Operational Database transaction. The writable Grant, canonical Grant-linked Human resolution and resulting Inbox Admission commit or roll back together. The Client does not create a Grant, flip a flag and send a success message as independent operations. The command reads back authority before continuing through the existing runtime; it creates no second execution queue or permission store.

The Human confirms the exact directory for this PersonaBot, including an existing read-only Grant upgrade. A repeated decision reads its existing resolution and current Grant; it cannot resurrect a revoked Grant or schedule another continuation. The endpoint checks the authenticated Owner. Agent-originated CLI permission changes enter the existing Human-only approval-policy gate, which neither saved execution rules nor Approval Reviewer may answer. A tool's allowed-once decision is not a persistent directory Grant.

This amends ADR-0067/0105's asymmetric native-file writing rule: an Assignment cannot bypass the current Grant's disabled write permission. It still uses its original Grant and one cwd. Existing read-only Grants are not silently upgraded. A Human-confirmed request enables current native file writes for both roles; Memory remains the Orchestrator's fixed cwd. ADR-0205's native Shell/plugin execution policy and explicit Full Access remain independent.

The first delivered slice is Web/CLI request approval, real native-file execution and original-task continuation. Mobile controls, all folder-management entry points, the full restart recovery matrix and same-Orchestrator non-blocking wait qualification remain subsequent work. Revocation blocks later calls, not effects already dispatched; no action with unknown execution is replayed as a recovery shortcut. The operational schema is unchanged, but reverting code does not revoke permissions a Human already granted; revoke through the owner when restoring the previous policy.
