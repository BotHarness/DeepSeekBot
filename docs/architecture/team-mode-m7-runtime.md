# M7 Bot access and speaker policy runtime

Issue #4150 implements the application-defined TeamBots and SpeakerPolicy services. The
operational database is the durable authority; the existing Typert bridge and API Gateway
remain the invocation path. This is the logic half. Client/mobile controls, bilingual public
CLI guidance, release copy, rendered evidence and Human acceptance belong to the UI integration.

## Principal and participant authority

A Bot's principal is `persona_bots.owner_human_id`. Group reads require the principal's current
active membership and current role qualification, plus `joinPrincipalChannels`. Group writes
add actual Bot membership, the principal's current Channel `post` right, and the adding
Human's current audience qualification. There is no
silenced state. Group participants may mention any Bot already present, including private Bots.
Changing roles or removing a principal from a group invalidates the next read/write immediately.
Tool guards and send fences check the current principal and trusted source Channels again during
live Orchestrator and Assignment turns. The message store checks Bot authority at append after
asynchronous preparation. No permission snapshot is retained across operations.

**Explicit DM exception, confirmed for this task:** a Bot's own Human–Bot DM uses participant
authority. The participating Human must currently qualify under the Bot's visibility for a new
message and for the Bot to reply. The principal remains active and the Bot must remain available.
Each Human has one deterministic DM per Bot; legacy principal DMs retain their existing IDs.
Other Humans, including the principal and Host Owner, cannot read that DM through ordinary
Channel APIs. M11 audited viewing is the Human-only exception. A visibility shrink or loss of an
audience role leaves the Human's existing DM history readable but refuses new Human messages and
Bot replies. Principal deactivation/suspension or Team-mode removal stops Bot access everywhere.

A private Bot may initiate a DM with a public Bot reachable by its principal. The public Bot's
side uses that initiating principal as its participant, allowing replies in that established DM.
A public Bot cannot initiate contact with a private Bot, even with the same principal. Human
Channel visibility follows the recorded initiating participant; an unrelated public Bot principal
requires M11. Bot action traces are suppressed when that principal cannot read the target Channel.
Bot callers cannot use any of the five M11 methods, including under the Owner Human ID.

## Storage and migration

The single named migration `bot-visibility` is appended after `migration-ledger`. Its generation
is derived by `BOT_HARNESS_SCHEMA_PLAN`; tests select it by ID or `targetGeneration`. Historical
153 fixtures upgrade through the ledger before this migration. It adds visibility/switch columns,
role policy/revision columns, indexed Bot/Channel adding-Human records, per-Bot Human opt-outs,
and per-Session attached policy revisions.

New and existing Bots default to private, proactive DMs off, principal Channels on and speaker
context on. Private is the safest equivalent of the previous Owner-only DM/roster reach: it does
not publish any old Bot or make a member's Bot reachable to another Human. Existing group Bot
membership is retained. Adding-Human provenance for pre-M7 groups is their Bot's principal. For
existing current-Owner Bots only, absent principal group membership is materialized so the old
Owner-Bot group reach survives under the new intersection. An explicit historical removal is
never restored. Existing DM content, IDs, Memory paths, roles and permissions are unchanged.

M6 remains the Memory/path authority. This slice does not move repositories or add a parallel
Memory store. Public Bots need M6 integration to place their shared Memory in an audience-matched
shared space under `bots/`, separate from grantable `files/`; account-only Memory is not a shared
space. The UI must disclose that one public Bot Memory spans its conversations before publication.
M6 Grant/path enforcement must continue to evaluate current Bot audience when adding that placement
integration. Shell confinement remains M12, independent of these application checks.

## Bridge and CLI

All payloads resolve the caller from invocation, including `--as`; none accepts an actor override.
Errors use `{ ok:false, error:{ code, message:code, details? } }` at the bridge boundary.

| Method               | Payload                                                       | Success                                                                                                   |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `botVisibility`      | `{slug}`                                                      | `{visibility,switches,audienceDirectory}`; principal or `bots.manageAll`                                  |
| `botVisibilitySet`   | `{slug,visibility,confirm?}`                                  | `{applied,visibility?,preview:{dmsBecomingReadOnly:[{channelId,humanId}],channelsLeaving:[{channelId}]}}` |
| `botSwitches`        | `{slug,proactiveDms?,joinPrincipalChannels?,speakerContext?}` | `{switches}`; principal only; no changes reads switches                                                   |
| `reachableBots`      | `{}`                                                          | `[{slug,displayName,avatar?,visibility,principalDisplayName}]`; metadata only                             |
| `botProactiveOptOut` | `{slug,optOut}`                                               | `null`; calling Human's own preference                                                                    |
| `roleConflicts`      | `{humanId}` or CLI `{username}`                               | `[{topic,allowRole:{roleId,name},denyRole:{roleId,name}}]`                                                |
| `speakerPolicy`      | `{humanId?,topic?}`                                           | `{humanId,displayName,roles,resolved}`; own policy or member/role manager                                 |

Visibility is `{kind:'private'}` or `{kind:'public',audience}`. Audience is M6's
`{kind:'everyone'}`, `{kind:'roles',roleIds}` or `{kind:'members',humanIds}`. Publishing or widening
requires `bots.createPublic`, including when a manager edits another Bot. Owner permissions are
implicit. Audience containment is symbolic: switching incomparable audience kinds requires the
widening permission and a shrink preview; present membership alone cannot authorize future roles.
A shrink without confirmation returns `applied:false` and changes nothing. Confirmation recomputes
current effects, persists the audience and removes unqualified group memberships. Added groups
record the actual adding Human; revocation of that Human's audience qualification cannot leave a
cached write grant. Turning principal Channels off removes current group Bot memberships.

Adding a Bot checks the adder's group `addBots` policy, Bot audience, principal membership and
switch. Creating a group with another principal's Bot is refused until that principal has joined
the new group; create the group, add the principal, then invite the Bot. Management does not grant
DM access. External IM binding requires the Bot's principal plus `im.bind` (the existing Host
permission ID for bind-external-im), independently of all-Bots management.

CLI forms, all online and supporting `--as`:

```text
bots visibility <slug>
bots visibility-set <slug> --private | --public everyone|roles:<ids>|members:<ids> [--confirm]
bots switches <slug> [--proactive-dms on|off] [--join-channels on|off] [--speaker-context on|off]
bots reachable
bots proactive-opt-out <slug> on|off
roles conflicts <username>
roles create --name <name> --permissions <ids> [--policy-stdin]
roles update <roleId> [--policy-stdin]
speaker-policy [--human-id <id>] [--topic <topic>]
bot-tool <slug> speaker_policy --args-stdin
```

Role policy stdin is `[{topic,text,effect:'allow'|'deny'}]`. `roleCreate`/`roleUpdate` accept the
same optional `policy`; their returned roles include `policy` and `policyRevision`. Hard
permissions remain the union across roles. Topic tags are admin-set. Resolution reuses the
existing Behavior permission evaluator with topic identity; Deny wins and every Allow/Deny role
pair is returned for assignment UI review. Policy is advisory and never grants resource access.

With `speakerContext` on, model input carries `[Name · RoleA, RoleB]` from trusted Host identity.
A role's complete policy and revision are attached on first appearance in each Session, and
reattached after a revision change. Latest revision wins. Attachment bookkeeping commits after
successful delivery, so failed delivery cannot suppress the retry's policy. No per-speaker system
prompt rewrite occurs; its fixed rule explains the envelope once. The `speaker_policy` Bot tool
reads a named/current Human's roles and resolved topic policy on demand. The existing direct Bot
tool runner invokes the same code without a model.

New refusal codes include `bot-principal-inactive`, `bot-principal-required`,
`bot-principal-channel-denied`, `bot-channel-join-disabled`, `bot-channel-access-denied`,
`bot-dm-read-only`, `bot-proactive-denied`, `bot-private-target-denied`, and `bot-audience-denied`.
Object discovery keeps `bot-not-found`/`channel-not-found`; permission failures retain
`permission-required` and `details.permission`. Other details identify only the addressed
`slug`, `channelId` or `humanId`. Input/reference errors retain `invalid-input`, `role-not-found`
and `member-not-found`. No new localized error prose is included here.

## Performance

No dependency, worker, timer or model call is added. Reachable discovery filters active principal,
visibility, current role membership and deleted Bots in one SQL query before decoding metadata.
Point authorization uses indexed Bot, Human, role, membership and opt-out keys, independent of
unrelated roster size. Group/DM reads and live tool/send fences add bounded current-authority
reads. Policy work is bounded by assigned roles and at most 100 items per role; attached revisions
are indexed by Session/role. Shrink previews scan current Channels only on explicit settings
changes. Tests guard discovery query count, indexed revocation behavior and unchanged read-only
privacy, separately from correctness of the real Host journey. These bounds are not browser FPS,
native qualification or end-to-end performance claims.

## Integration additions

`botVisibility` also returns `audienceDirectory: {roles:[{roleId,name}],members:[{humanId,displayName}]}`
for its authorized managers. This supplies audience choices without granting role/member management.
Human DM projections add `readOnly` and the calling participant's `proactiveOptOut`. Group projections
retain all present Bot IDs and add `memberBots:[{slug,displayName,avatar?}]`; a private Bot being present
does not expose its profile. Joined discovery/search retains its joined scope, while an explicitly
addressed group read may use principal membership without Bot membership.

Once a Bot has a DM belonging to another Human, ordinary Session/attention inspection and direct Bot
tool execution could expose that shared execution transcript. Those inspector paths refuse with
`bot-session-private`, including for its principal, and retain that restriction after a visibility
shrink. `speaker_policy` remains directly callable because it contains no DM transcript. Other
Humans' DM contents use M11's audited Channel/DM view; a shared-session inspector needs a separate
participant-safe projection. This gate supplements ordinary Channel, Activity, search and trace
filtering; it does not turn M11 into a Bot capability. Activity snapshots/overviews and live
frames strip shared execution details and Session titles; ordinary Bot details and Session-ID
discovery omit those shared Sessions. The frame projection resolves foreign participants in
one SQL query per projection, rather than one query per Bot. This extra projection work is
linear in stamped DM records; a query-count guard prevents per-Bot amplification. It is not
a measured end-to-end latency improvement. Cross-principal visibility mutations use the
existing administrative audit with action `botVisibilitySet`.

Shrink qualification retains a Channel if an alternative current audience member with `addBots`
can add the Bot there; co-occupants need not all belong to the Bot's audience. The recorded original
adder preserves invitation provenance, rather than imposing audience containment on every occupant.

For an existing Owner Bot already in a role-scoped group, the migration also materializes the
current Owner's Channel-admin qualification when that principal membership is active. The Host
Owner already holds all management permissions; this preserves the Bot's former read reach without
granting a Host Role to the Owner or changing anyone else's audience. Explicitly removed Owner
membership is not revived or given this qualification.

Publication freezes the existing principal DM's Human identity. Indexed pair lookup preserves that
same DM when principals later change: a new principal never acquires an earlier Human's public-Bot
DM, and an already-existing DM for the incoming principal is reused. Bot traces and M11 Bot-profile
views select the current principal's own DM rather than assuming the legacy `dm-<slug>` ID. Member
purge scopes these DMs by their participating Human, preserving another Human's conversation even
when that Human's Bot changes ownership. Private, never-published Human–Bot DM transfer keeps M9's existing
history-transfer semantics. Bot–Bot DMs retain their recorded initiating Human across transfer;
member purge removes that participant's DM independently of either Bot's later owner.

## UI integration needs

1. Bot settings visibility and audience controls, using `audienceDirectory`; publication permission and principal/all-Bots management gating.
2. Shrink impact preview and explicit confirmation, then refresh DMs and Channel membership.
3. Principal switches for proactive DMs, principal Channels and speaker context; per-Human proactive opt-out.
4. Reachable-Bot discovery and DM/add pickers using metadata only; existing participant DM navigation and read-only state.
5. Channel add eligibility and present-Bot mention pickers using `memberBots`, including private Bots already in the Channel.
6. Admin Role Policy editor with topic tags and Allow/Deny items; assignment conflict indicators using `roleConflicts` and policy revisions.
7. Principal status/access-loss feedback and current-audience refusal handling through coded errors and `details`.
8. Public-Bot inspector privacy handling for `bot-session-private`; route authorized Humans through M11's existing audited DM view.
9. External IM binding controls requiring principal identity and `im.bind`; all-Bots management alone is insufficient.
10. M6 shared-Memory placement and cross-conversation disclosure for public Bots, with separate audience-matched `bots/` and grantable `files/` paths.
11. Bilingual CLI guidance and release fragments, plus Web/mobile rendering and Human acceptance for these controls. This logic task intentionally leaves public copy to the UI owner.
