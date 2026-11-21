# Secret and private input decisions

How a Bot asks the Owner for a secret, where the value lives, and how a Bot uses it without the model ever seeing it. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); approvals and permission modes are in [Session decisions](sessions.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0158, 0164, 0166, 0167, 0169, 0170, 0172, 0189, 0191, 0192, 0195, 0196, 0198 and 0208, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **The value stays in native storage; everything else carries a reference.** Original values live only in DSH's Credentials Service. The model, Channel history, approval cards, logs and replies carry opaque `private:<grant>:<field>` references or `{{field}}` placeholders. There is no second plaintext store in Memory, config or SQLite.
- **The Host uses a secret; the model never substitutes it.** A value is resolved inside a fixed Host consumer at the moment of use, under the Bot's grant and the current account binding. Masking output is a courtesy against accidental echo, not a boundary.

## 1. A Bot asks for a secret with one multi-field card, and only the Owner fills it in

<a id="adr-0164"></a><a id="adr-0189"></a>
_Formerly ADR-0164 (storage and binding; its execution boundary is retired, see §6) and ADR-0189._

An Orchestrator calls `ask_secret` with an account, a purpose and up to eight fields. The Host opens one card in the Bot's Human DM. Only the authenticated Owner peer can submit it; a supplied actor label never establishes Owner authority. One native `CredentialKey` holds one atomic multi-field grant, bound to the requesting Bot's creation identity (slug plus birth time) and the account. The Channel keeps the declaration and terminal status; the model receives references only. A grant belongs to the Bot it was given to; the only exception is a remembered MCP server a Human switches on for another Bot (§9). Secret input works in every Profile, without Docker.

Field ids, references and placeholders share one format, defined once in `credentials/references.ts`: a field id is a lowercase letter followed by up to 47 lowercase letters, digits or underscores.

Why: DSH's own Human-only secret prompt is scalar, and ordinary question answers are persisted as text, so neither fits a multi-field card that must never reach history. A single format keeps the declaration, the consumers, the Channel validation and the Messaging reply fence from drifting apart; a field the contract accepts but a fence does not recognise would let a reference leak into a reply.

Enforced by: `private-reference-format.property.test.ts` (the contract accepts exactly the field ids the reference and placeholder parsers accept, every written reference reads back and is found inside any reply text, and no other core source spells the pattern), `private-inputs-request-lifecycle.test.ts`, `private-inputs-account-references.test.ts`, `private-profile-boundary.test.ts`.

## 2. Settlement commits to the Channel before the Bot continues

<a id="adr-0166"></a>
_Formerly ADR-0166._

The `PrivateInputs` owner keeps each live request with its real Agent, Bot identity, account, declared fields and a fifteen-minute Host deadline. Each pending request admits at most one submit. The configured resolution is the linearization point: the Channel store's idempotent append checks a trusted `canCommit` predicate inside its persistence boundary, and references reach the Bot only after that commit. Cancellation, stop, ownership loss, Host disposal and expiry commit an empty-reference outcome before settling their waiters. A grant carries its request and Channel locator, and a consumer requires the exact committed configured resolution, so a written grant without that proof is unusable even if cleanup fails. Startup expires lost pending cards without recreating a waiter and removes orphan grants. A private resolution never creates an Inbox Admission, so expiry cannot wake a stopped Orchestrator. Client inputs are uncontrolled password fields that clear on submit, cancel, terminal status, unmount and replacement; reload restores metadata only.

Why: native credential storage and Channel persistence cannot share a transaction, so the Channel commit has to be the single fact that makes a grant usable. Restoring Promises from history would confuse durable authority with live authority.

Enforced by: `private-inputs-request-lifecycle.test.ts`, `private-input-attention.test.ts`.

## 3. Account versions fence every use; revocation erases values at once

<a id="adr-0167"></a>
_Formerly ADR-0167._

Each Bot identity and account has one current grant, recorded in a separate native binding record (account scope, opaque revision, active grant id, or a null tombstone after revocation). Every consumption checks the live Agent, Bot birth, account, complete references, the immutable grant, the Channel proof and the current binding immediately before the consumer starts. Each account has a Host-local serialized queue; replacement captures the revision and activates only if it still matches, and native activation precedes the Channel's configured resolution. The Owner's card offers replacement (a blank card that never reads old values) and local revocation. Revocation writes the tombstone, aborts every registered use of that account, and deletes the grant record in the same queue; a failed delete is removed by startup recovery. `privateAccounts` lists accounts with status and card ids, never values or references. Deleting a Bot cancels its pending requests, stops running uses and deletes its grant and binding records; the binding is deleted rather than tombstoned because a later Bot with the same slug has a different birth time. Stop reports are bounded to one second and say "uncertain" when a use has not settled, and Channel audit text describes local revocation, never third-party token revocation.

Why: mutating values behind a stable reference or deriving authority from UI state lets an old card keep working after the Owner replaced it. The tombstone is a one-way security migration: an older binary ignores it and could revive old grants, so a Profile with retained grants must never be downgraded to an unfenced binary.

Enforced by: `private-inputs-account-references.test.ts`.

## 4. A new card needs a current Human interaction; unattended runs only reuse

<a id="adr-0169"></a>
_Formerly ADR-0169._

`ask_secret` first tries to reuse the account's current configured grant, through the same checks as interactive use; reuse needs no card. Opening a new card additionally needs a current Human interaction: a retained canonical `human-message` Source Event admitted for that Bot in the current turn of the actual Orchestrator Session, from a Human DM or Group. History, prompt text, a destination Channel id or an earlier Human turn in the same Session do not count. A Schedule run stores only opaque references and admits a `schedule` Source Event through the Bot Inbox; when it has no usable account, `ask_secret` throws a static Owner-action error before creating a card or waiter, and the Owner configures the account in Web Chat and runs the Schedule again.

Why: an unattended run that opens a card leaves a Human waiter nobody is watching, and asking the model whether it is unattended is not a check.

Enforced by: `private-input-origin.test.ts` (a revoked IM authority followed by reuse in a later Schedule), `private-inputs-account-references.test.ts`, `private-inputs-channel-and-im-delivery.test.ts`.

## 5. A secret asked for from an IM conversation is still filled in Web Chat

<a id="adr-0172"></a>
_Formerly ADR-0172._

An authorized external conversation may lead an Orchestrator to call `ask_secret`. The request binds to a current accepted bridge-message Source Event; with several external sources in a turn, the call names one with `source_event_id`, and two sources selecting the same account in one turn are refused as ambiguous. A live accepted local Human message supplies Owner interaction even when IM events are batched into that turn. The card opens in the Bot's Human DM; no IM text, attachment, quote or group card is a submission endpoint. The Host sends a static Owner-action notice through the Messaging Outbox; with `privateInputWebUrl` set (explicit HTTP(S), no userinfo, query, path or token) the notice carries a fragment with only Channel and card ids, and without it the notice has no link and the Owner opens the card from the Bot's Chat. Source leases recheck Session, turn, Bot identity, pause state, Source content and Messaging Binding before the private result's reply starts; cancellation expires the card and aborts active uses. The Messaging reply boundary rejects any text that contains a private reference.

Why: an IM channel cannot authenticate the Owner the way the Web bridge can, and a link in a chat must not become a credential. The flow was last qualified with a real IM App inside the removed protected Profile (§6); its Host code is unchanged since.

Enforced by: `private-input-origin.test.ts`, `private-input-locator.test.ts`, `private-reference-format.property.test.ts` (the reply fence finds a reference anywhere in a reply).

## 6. Every Profile guards the credential store; the Docker-protected Profile is gone

<a id="adr-0192"></a><a id="adr-0170"></a>
_Formerly ADR-0189 (store guard), ADR-0192 and ADR-0170 (retired with the protected Profile)._

The native credential store is a file of the Host's OS user, so a reference alone does not stop an Agent that can read it. The Host guards it in two layers, for every Agent and after any Human approval. First, it adds a read denial to DSH's sandbox command line: a Seatbelt `deny file-read*` for the store on macOS, and the store masked with `/dev/null` under bwrap. Second, it refuses Agent file tools aimed at the store or the DSH home that holds it, and Shell commands that name the store. The kernel rule is missing in `danger-full-access` mode, under the Landlock runner and on Windows; there only the text layer applies, and a command that reaches the file through a variable, traversal or script is not recognised. These are accepted limits: full access is an explicit Human risk acknowledgement, and those runners have no per-file read denial. The rule is added by rewriting the command line DSH's sandbox provider returns, because DSH's policy has no protected-read vocabulary, so a repository test pins the installed runner shape and the Host logs a warning the first time a runner gets no rule. `privateInputExecution: true` now only logs that the Profile runs as an ordinary one; stored grants stay usable. The container Shell, container MCP runner and the fixed private MCP tool are removed; someone who needs a stronger boundary runs the whole Host in a container or a separate OS user.

Why: the Docker Profile needed a pinned image, changed every Agent tool, never left qualification, and doubled execution paths and tests. The owner's direction was that secret input must work by default and that the protection to aim for is control of reads of the store, as with any environment file. The OS keychain would not help while the Host runs from a command line, because it authorizes by program and an Agent's Shell can run the same programs.

Enforced by: `scripts/test/dsh-sandbox-shape.test.mjs` (the installed DSH runner shape), `credential-store-guard.test.ts` (the Seatbelt and bwrap rewrites, and an unknown runner left unchanged), `private-profile-boundary.test.ts` (Agent tools refused at the store).

## 7. Fixed Host consumers use a secret: `protected_cli` and `secret_http`

<a id="adr-0189-consumers"></a>
_Formerly ADR-0189 (consumers) and ADR-0164 (fixed status check)._

`protected_cli` runs the fixed `http-status-v1` check: one GET to the Owner-supplied endpoint, no redirects, response body, headers and stderr discarded, numeric status only. `secret_http` (`http-request-v1`) lets a Bot call an HTTP API whose destination is a field the Owner typed into the card; the Bot chooses only a path under it, the method, and where each secret goes through `{{field}}` placeholders in headers, query values or the body. Redirects are refused, plain HTTP is allowed only for a local endpoint, the request body is capped at 64,000 characters, and the response returns at most 32,000 characters with the secret masked in raw, base64 and URL-encoded form. Each call needs the ordinary Human execution approval, whose card shows references and placeholders, not values. HTTP 401 or 403 returns a static repair action pointing to replacement in Web Chat.

Why: a Host-run consumer with an Owner-fixed destination is the only way to use a secret without placing it in a model-written command. HTTP success proves the request completed, not that the remote service authenticated it.

Enforced by: `secret-http.test.ts`.

## 8. `secret_cli` runs one program with secrets in its environment

<a id="adr-0191"></a><a id="adr-0208"></a>
_Formerly ADR-0191 and ADR-0208._

`secret_cli` names a bare program, its arguments, and environment variables whose values hold `{{field}}` placeholders. The Host fills them from the Bot's own grants and starts the program directly, through DSH's sandbox with the Bot's working folder as the writable root, so the store denial of §6 applies; without a sandbox it does not start. A path, a shell, an interpreter or a launcher as the program, a placeholder in an argument and loader-changing variable names are refused before any card. The program gets only the search path, home, user, locale, temp directory and the named variables. A run lasts at most two minutes and returns the exit code and up to 32,000 characters each of stdout and stderr, with the secret masked in raw, base64, unpadded base64, base64url, hex and URL-encoded form. The approval card offers allow once, **always allow this kind**, and reject; the kind is the program, the account and the set of variable names, not the arguments. Always allow saves a `secret-cli` Tool Approval Rule for that Bot and role, revocable like any rule. A current Approver can decide either from an external IM. A Session with full access skips the card ([Session decisions §7](sessions.md#adr-0193)).

Why: many command-line tools read credentials only from the environment, and exporting the value in a terminal reaches every later command. Asking for every call made the Human approve without reading, so the class of call became the unit of approval. The program receives the secret: under an always-allow rule it can run any subcommand, including one that prints the credential, and the card says so.

Enforced by: `secret-command.test.ts`, `secret-cli-approval-rule.test.ts`, `secret-cli-approval-bridge.test.ts`.

## 9. A Bot starts an MCP server with secrets; a remembered server serves every Bot by switch

<a id="adr-0195"></a><a id="adr-0196"></a><a id="adr-0198"></a>
_Formerly ADR-0195, ADR-0196 and ADR-0198._

`secret_mcp_connect` names a server, a bare launcher (`npx`, `uvx` and `node` are allowed), its arguments and placeholder-bearing environment variables. After approval the Host starts it through the Shell sandbox with a clean environment (package caches redirected to the temp area) and mounts DSH's MCP client for that Orchestrator Session only; its tools appear as `mcp__<server>__<tool>`, each call goes through ordinary approval, and every string of a result is masked. The server runs until `secret_mcp_disconnect`, revocation, or the end of the Session or Host; it is a registered use of the grant, is not restarted automatically, and is not available to Assignments. The start card offers allow once, allow and remember, and reject, only on the Web card. Remembering stores the exact start (name, program, arguments, variable names with placeholders, account and references, no value) in `bot_secret_mcp_servers`; the Bot's Session reconnects it at each start, and a different start is a new card. A remembered server is listed in every Bot's settings: the Bot that set it up has it on, every other Bot has a switch that is off. Turning the switch on (Owner only, recorded in `bot_secret_mcp_enabled`) runs a separate process for that Bot with the setting-up Bot's secret; the enabling Bot gets the tools, never the references. Revoking the account stops it everywhere; removing it in any Bot's settings removes it for all; deleting the setting-up Bot erases the record and the switches.

Why: an integration that needs a client library or several related calls is usually an MCP server that reads its credential from the environment, and DSH's Profile-level MCP config would expose that value to every Agent. A launcher that fetches a package runs whatever that package contains, and a remembered start may fetch a newer version than the one approved; the settings row shows the command and removal is one click. Leaving the switch off by default limits who can steer a Bot into calling the server from a Group or IM.

Enforced by: `secret-mcp.test.ts`, `secret-mcp-store.test.ts`.

## 10. The Owner CLI writes secrets from stdin and never prints them

<a id="adr-0158"></a>
_Formerly ADR-0158._

`tobs secret-put <NAME>` reads the value from stdin only; a value in argv is a `secret-in-argv` error, and an empty value is refused (use `secret-unset`). The writer edits only the target entry under top-level `refs:` by its YAML source range, never re-serializing the document, so comments and provider-owned `records:` stay byte-for-byte; `records:` is never written. It backs the file up first, re-parses it with the native `parseCredentialsDocument` after writing, and restores the backup on any failure with a coded error that never echoes the value. A new file is created owner-only (0600), and an existing file readable by others is refused with a repair hint. `secret-list` reports names, source and writability, never values. These verbs work offline against the DSH home; a running Host reloads the file through its watcher.

Why: the credential file is strictly validated YAML that stops the Host from starting when malformed, and a round trip could mangle opaque grant payloads. Shell history and process listings make argv values a leak by construction.

Enforced by: `bot-offline-operations-cli.test.ts`, `bot-secret-regression.test.ts`.
