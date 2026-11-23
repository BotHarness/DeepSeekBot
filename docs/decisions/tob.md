# Tob decisions

What Tob is, where the Human reaches it, and how it manages the Host through the CLI without becoming an administrator. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); who answers an approval is in [Approval decisions](approvals.md); Bot-to-Bot messages are in [Messaging decisions](messaging.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0223, 0224, 0225, 0268, 0314 and 0347, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **Authority comes from the accepted Human DM, never from Tob's files.** Only the protected Tob singleton's root Orchestrator, running for the exact accepted Human private-DM Source Events of the current execution, can manage the Host. Soul, Memory, display name, a CLI argument, a Group, external IM, another Bot or an Assignment Session never confer it.
- **Tob uses the Human's CLI and the existing owners.** Tob gets no management Tools of its own, no second settings store and no second approval owner. Every change goes through the same owner, revision check and approval card the Human's own command would.

## 1. Tob is a protected local PersonaBot with one Human DM

<a id="adr-0223"></a>
_Formerly ADR-0223; its Home panel, Home setup and layout v8 were removed by ADR-0268 (§2)._

Each Profile reserves one local Tob identity before provisioning its PersonaBot, Git Memory, Workspace Grant and Human DM; interrupted provisioning resumes the reservation instead of creating a second Tob. Tob is an ordinary PersonaBot in every other respect: its Soul and Memory stay editable and portable, and its conversation is one ordinary DM with ordinary Channel history. The Host owner refuses to archive or delete it, whatever its display name. A revoked Workspace Grant is never silently recreated. Tob inherits the Host's default model unless the Human customizes it.

Why: an ordinary named Bot with Host credentials would turn editable persona files and imported content into administrative authority. A separate Home conversation would duplicate history and lose the existing approval path.

Enforced by: `tob.test.ts` (concurrent clients converge on one Tob and one DM, restart keeps the identity, interrupted provisioning never restores a revoked Grant).

## 2. The Human reaches Tob through its DM; Tob Mode is a mobile entrance to it

<a id="adr-0268"></a>
_Formerly ADR-0268, which removed the Home panel of ADR-0223._

There is no Home panel. On desktop the Tob DM opens in Messages, and the "Open Tob" command does that without changing the layout; in Simple layout the Human can hide the Side column to focus on the conversation ([ADR-0269](onboarding.md#adr-0269)). Cross-Bot attention stays in Activity Center, and the Human asks Tob in conversation to create a Bot.

On mobile, **Tob Mode** is the ordinary chat screen for the Tob DM with a different entrance: pulling down on Chats past the commit distance (80 pt, `tobPull.commit`) and releasing opens it, sliding in from the top (a fade under Reduce Motion), and system Back or a push up closes it. The pull opens the Tob of the filtered computer Environment, or the most recently used one under "All environments" or a cloud filter; with no matching computer it refreshes instead. The Tob row stays in the Chats list.

**Tob Delegation** uses the existing Bot-to-Bot DM: Tob picks a colleague, sends without asking the Human first, and reports back in its Human DM. Each send shows the existing action notice; approval ownership, the Bot-hop limit and Tob's CLI authority do not change. Tob never joins a Group.

Why: a message sent from Home jumped to the Tob DM anyway, and Home's overview duplicated Activity Center. One conversation keeps one history and one approval path. ADR-0268 specified a 0.6 s timed hold; the shipped gesture (#3117) commits on distance instead.

Enforced by: `apps/mobile/test/tob-pull-model.test.ts`, `tob-mode.test.tsx`, `pull-to-tob.test.tsx`, `tob-delegation-prompt.test.ts`, `tob-delegation-telemetry.test.ts`.

## 3. Each Shell execution gets its own short-lived CLI broker

<a id="adr-0224"></a>
_Formerly ADR-0224 (authority, broker and lifecycle; its allowlist was replaced by ADR-0314, §4)._

Tob uses DSH's native bash or pwsh Tool. A Shell Provider wrapper binds each native ToolExecution to a process-local broker on a loopback endpoint and hands the child process an ephemeral bearer token. The Host takes Tob's identity from the actual ToolExecution and requires each new broker request to match the Shell's accepted Human DM sources. A later turn or newly accepted source makes that snapshot ineligible for new requests. On write admission, the broker captures those verified sources and their Human DM for that exact proposal. Later Inbox arrivals can steer the turn while the proposal waits for review or runs. The admitted write still requires the original sources to remain valid, the same turn and Session owner, and the live execution and target authority. Completion, cancellation and disposal revoke the broker, and a Host restart never revives one: Tob must start a new Shell and read the current state. In scoped mode the CLI never reads Human administrator credentials and never falls back to offline mutation.

The token is visible to any code in that Shell, so the broker is not isolation from another process of the same OS user. Its protection is the narrow operation scope, the Host-side source check, approval, revision guards and revocation. Diagnostics never log the endpoint or the token.

Why: a management Tool per setting would duplicate the CLI's discovery and drift from its approval behavior, and handing a Shell the Human's login would make editable persona text an unrestricted Host credential.

Enforced by: `tob.test.ts` (management binds to the current protected Orchestrator and canonical Human DM; new requests lose admission after the turn or a newly accepted message), `tob-cli-inbox-approval.test.ts` (Bot DM steering before the card opens or after the decision commits; one approved write and a refused second invocation), `tob-cli-broker.test.ts`, `tob-cli-shell.test.ts`.

## 4. Tob runs every CLI command: reads at once, writes after an approval card

<a id="adr-0314"></a>
_Formerly ADR-0314, which replaced ADR-0224's allowlist._

Tob can run every `tobs` command the Human has. Commands with typed operations keep them (§5). Any other command goes to the broker as `cli` with its exact argv, stdin and folder, and the Host runs the Human CLI in a child process with the Host's own loopback origin and launch token; the token never reaches Tob's Shell and is redacted from output.

A command runs at once only when the Host's read list (`brokerRead` in `bots/cli-effects.ts`) names it, its parsed effects change nothing, and it has no `--out`. Everything else is a write, including any command the list does not know. A write first shows the Human a card with the exact argv, the folder, and the size and SHA-256 of any stdin, never its contents. Full Access and Approval Templates do not replace this card; only an Always allow rule the Human saved from such a card can ([Approval decisions](approvals.md#adr-0249)). Channel Tool Approval routes the exact prepared operation to the Human DM captured at admission and rechecks the decision against the same call at execution. A rejected or cancelled card never runs the command. The Human CLI's own refusal comes back to Tob unchanged; a write that loses its result is `operation-outcome-uncertain`, and Tob reads before retrying. `--host`, `--token-file`, `--home`, `--as` and `--administration` are refused in any form, and `ssh-tunnel`, `voice-local-kit`, `audit`, `private` and `tob-cli` are refused outright. Output is capped at 8 MiB.

Why: a growing allowlist meant Tob kept refusing what the Human could do on the same Host, and CLI parity now gives Tob every new feature. The read list errs toward a card: a read it misses costs one click, while a write it wrongly admitted would run without one. The child reads named files with the Host's permissions, so a command with file input or output is never a read.

Enforced by: `tob-cli-authority.property.test.ts` (for any argv, a command runs at once only when the list names it, it changes nothing and it has no `--out`; an unknown command is a write; adding `--out` anywhere turns a read into a write; the refused options are refused anywhere, bare or with `=`), `tob-cli-host-commands.test.ts`, `tob-cli-approval.test.ts`.

## 5. Typed operations review the exact change and survive a lost response

<a id="adr-0225"></a>
_Formerly ADR-0225, with the reviewed-settings write of ADR-0223 and ADR-0224._

- **Settings.** A write carries the namespace, patch, expected revision and previous value; Native Settings stays the only value and revision owner. The guard rechecks authority, revision and previous value after approval and right before writing, then returns the read-back. A stale proposal refuses, and an uncertain result is reconciled against Settings, never replayed. Human `settings-set` accepts the same two optional guards; scoped Tob writes require them. The first typed setting was `botharness-client.assignmentConcurrencyLimit` (1 to 32).
- **Bot creation.** The `bot_creation_operations` table binds a stable operation key to a canonical input fingerprint and a reserved slug before the Registry creates the Bot and its managed Memory and the Channel owner prepares its Human DM. Repeating the same key and payload reconciles; a different payload refuses; archived or deleted identities are never recreated from a key; a Memory folder with no Registry record refuses as `creation-memory-conflict` and is kept for repair. Keyed creation covers blank Bots in managed Memory only.
- **Profile.** Reads return an opaque fingerprint of the whole Registry record, and metadata (name, description, tags only), appearance and pause or resume writes must carry it. Images are reviewed by digest and size.
- **Deletion.** Uses the owner's preview token, dependency scope and owner-derived Memory path; retention is the default and erasure is explicit. Every confirmation and retry needs a fresh Human decision and the explicit confirmation flag, even under Full Access or a saved rule. Tob itself can never be archived or deleted.

Why: a transport failure after creation must not produce a second identity, Memory or DM, and a profile write must not overwrite a change made while its card was pending. These owners already existed; Tob reaches them without sharing the Human's credentials.

Enforced by: `tob.test.ts` (stale proposals refuse, an uncertain write reconciles through read-back), `tob-cli-bot-create.test.ts`, `tob-cli-bot-profile-operations.test.ts`, `tob-cli-broker.test.ts` (concurrent setting changes and denied approvals never write).

## 6. A model-free CLI request runs inside a real accepted Human DM turn

<a id="adr-0347"></a>
_Formerly ADR-0347._

The authenticated Host Owner can start a typed request with `tobCli`. The runtime appends a real Human message to that Owner's Tob DM and runs it through the usual Source Event claim, Admission, Orchestrator queue and turn; no caller chooses an actor, source, Session or cwd. The turn runs the `deepseekbot_cli` Tool once, without a model step, against a per-invocation broker that shares the Shell path's approval, confirmations, revision checks and execution guard, so it adds no second card. The Tool exists only during that lease; ordinary model turns, same-name replacements and recursive `tob-cli` requests never get it.

One request runs at a time, and a busy Orchestrator refuses a new one; ordinary DMs queue behind it. Results are process evidence only: at most 16 entries, kept 10 minutes after they settle, with 256 argv entries, 64 KiB of argv and 1 MiB of stdin per request. Stdin is never copied into the DM. A request id on that DM message stops ordinary retry or continuation from reusing it, and nothing replays after a restart.

Why: the temporary direct Session behind the Human CLI has no accepted Tob DM, so it could not pass the source check. Running inside a real turn lets agents test the production path, approval card included, without a model.

Enforced by: `tob-cli-invocation.test.ts`, `tob-cli-approval.test.ts`.
