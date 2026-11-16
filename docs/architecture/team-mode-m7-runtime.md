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

M6 remains the Memory/path authority. Public Bots use a dedicated, hidden M6 shared space:
`shared/.bot-<slug>/bots/<slug>/memory`. Its audience equals the Bot's current public audience.
The ID is deterministic per Bot; visible folders with identical audiences are never reused.
Audience changes retarget that same space atomically with Bot visibility, preserving the repository
and its history without another filesystem move. Returning to private moves the repository to
`spaces/<current-principal>/bots/<slug>/memory`, including after an M9 principal transfer.

The existing M6 `workspace_file_transfers` journal and copy/proof/rollback/retirement functions
own relocation. Preparation journals before moving bytes. A failed metadata transaction restores
the original repository; startup rolls back unfinished preparation and resumes committed retirement
before Bot admission. Only the committed `memoryDir` and ownership proof designate live Memory;
unfinished source copies remain protected by M6's backup-path guard. Already-public round-one Bots
are reconciled into this layout at startup. No new schema migration or second Memory store is added.

The bridge uses the existing Orchestrator replacement seam before a path-changing operation.
A running Bot returns `bot-busy` with `details.slug`; no bytes move. Hidden spaces have no `files/`,
are omitted from folder/Workspace lists even for managers, cannot be independently updated/deleted,
and cannot be granted at any descendant or ancestor. Another Bot cannot read this Memory through
native file tools even when its principal belongs to the public audience. Public Memory cannot be
moved out through the ordinary Memory-location setting. Purge removes accepted Memory and releases
its hidden space; retained deleted Memory keeps its protection. Shell confinement remains M12.

Every actual Host visibility preview/result now includes
`preview.memory: {from,to}` using relative path labels, never absolute Host paths. An external
custom source is labelled `custom/<slug>/memory`. Explicit `confirm:false` previews publication
without applying it; CLI `bots visibility-set ... --preview` sends that value. Omitted confirmation
keeps publication/widening behavior; shrinking still needs `confirm:true`. The UI can disclose that
one public Bot Memory spans all its conversations before applying publication.

This is cold settings/startup work. Same-filesystem moves rename the proven repository; cross-device
moves reuse M6's verified copy and retirement, proportional to repository size. An already-correct
startup placement is one metadata read with no repository or metadata writes (regression guarded).
No worker, timer or dependency is added. Existing M6 path/query-count guards remain applicable.

## Bridge and CLI

All payloads resolve the caller from invocation, including `--as`; none accepts an actor override.
Errors use `{ ok:false, error:{ code, message:code, details? } }` at the bridge boundary.

| Method               | Payload                                                       | Success                                                                                                                    |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `botVisibility`      | `{slug}`                                                      | `{visibility,switches,audienceDirectory}`; principal or `bots.manageAll`                                                   |
| `botVisibilitySet`   | `{slug,visibility,confirm?}`                                  | `{applied,visibility?,preview:{dmsBecomingReadOnly:[{channelId,humanId}],channelsLeaving:[{channelId}],memory:{from,to}}}` |
| `botSwitches`        | `{slug,proactiveDms?,joinPrincipalChannels?,speakerContext?}` | `{switches}`; principal only; no changes reads switches                                                                    |
| `reachableBots`      | `{}`                                                          | `[{slug,displayName,avatar?,visibility,principalDisplayName}]`; metadata only                                              |
| `botProactiveOptOut` | `{slug,optOut}`                                               | `null`; calling Human's own preference                                                                                     |
| `roleConflicts`      | `{humanId}` or CLI `{username}`                               | `[{topic,allowRole:{roleId,name},denyRole:{roleId,name}}]`                                                                 |
| `speakerPolicy`      | `{humanId?,topic?}`                                           | `{humanId,displayName,roles,resolved}`; own policy or member/role manager                                                  |

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
bots visibility-set <slug> --private | --public everyone|roles:<ids>|members:<ids> [--confirm | --preview]
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

`botVisibility` also returns `audienceDirectory: {roles:[{roleId,name,builtin}],members:[{humanId,displayName}]}`
for its authorized managers. This supplies audience choices without granting role/member management.
`builtin` is `'admin'`, `'member'` or `null`, matching `spaceAudienceDirectory` so clients can localize
built-in role names; custom roles retain their stored name.
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
when that Human's Bot changes ownership. Private, never-published Human–Bot DMs are also frozen to the previous
principal in the ownership-transfer transaction before the owner changes. This includes existing
unstamped legacy DMs at transfer time; already-stamped and unrelated DMs stay unchanged. The new
principal reuses their own DM or receives a fresh one, without the previous participant's history. Bot–Bot DMs retain their recorded initiating Human across transfer;
member purge removes that participant's DM independently of either Bot's later owner. Legacy Owner-only Assignment attention without a persisted DM projection retains its principal-DM locator only when the recorded requester is the principal and no Bot DM record exists; missing or deleted participant DMs never fall back to another Human.

## Shared discovery and participant arrangement

Ordinary `list` keeps the principal's full entries unchanged. Other reachable public Bots are
an explicit metadata-only projection, including for the Owner and all-Bots managers:

```ts
{
  slug: string;
  displayName: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  primaryColor?: BotPrimaryColor;
  paused: boolean;
  deleted: boolean;
  readOnly?: true;
  sharedBy: { humanId: string; displayName: string };
  metadataOnly: true;
}
```

No prompt, role tag, description, Model Plan, Workspace, Memory path, activity or Session field
is included. Image avatars use the existing asset URL. Shared search matches only public names
and slugs. Discovery reuses the current audience/principal query, decodes only reachable or
participant-history rows, and adds one read independent of Bot count; query-count and malformed-private-record tests guard
this boundary. Principal deactivation, role revoke and audience shrink are effective on the next
list. A non-principal with an existing Human–Bot participant DM retains the metadata entry after
losing reach, with `readOnly:true`; callers without that DM do not retain it. This also preserves
history after a return to private, principal deactivation or accepted Bot deletion (`deleted:true`).
The entry disappears if the participant DM is removed. `reachableBots` remains audience-only:
history entries never grant DM initiation, Channel addition, sending, Bot tools or management.
Principal attribution falls back to the retained Human ID if that Human record no longer exists.
Bot callers do not inherit Human history metadata. Explicit administrative discovery retains
M11/M2's existing metadata rules and deduplicates shared entries.

The named migration `human-roster-arrangements` adds one operational row per Human who customizes
an arrangement. It reuses the RosterStore operations and schema for pins, hidden entries, sections
and order. The legacy local-Human row/import is unchanged. Arrangement reads and writes use the
trusted caller, including after Host ownership transfer; no actor id comes from a payload. Shared
slugs and accessible Channels may be arranged without granting Bot management. Arrangement writes
serialize per Human, survive reopening, and inherit Human deletion cleanup through their foreign key.
Roster invalidation carries no arrangement contents across Humans.

The existing `openBot` path can use `channelDm`, Channel projection, messages, timeline, send and
`botAttention`. For a reachable non-principal, attention derives their DM from trusted participation
and restricts the SQL page to that Channel before pagination. A payload cannot select someone else's
DM; absent participant DM returns an empty page. This participant projection is Human-only; Bot
callers retain their existing inspection refusals. Bot settings, Memory, models, Workspaces, schedules
and Sessions retain their existing refusals. `openBot`'s separate Session load therefore remains a
refusal and does not acquire a shared transcript. Existing all-Bots administrative capabilities
remain explicit and do not grant content access. No Client or mobile code changes are included.

## Participant DM resolution in the CLI

Online `send` resolves `channelDm {slug}` before sending and uses the returned Channel ID in the
receipt, send and every status poll. It never calls owner-only `get` to resolve a public Bot.
`send-status` resolves the same participant DM and can inspect an existing receipt after audience
loss. Refusals after resolution retain that real Channel ID; a failed resolution does not fabricate
a legacy receipt. No retry sends another message without the caller's explicit retry/message ID.

The same Host resolver supplies generated DM IDs for online Memory, profile/appearance, usage,
call-history and creation-result paths. Existing management gates still refuse non-principals;
resolving a participant DM is not management authority. Explicit Channel IDs from a command are
never rewritten. Offline private creation receipts and protected Tob-local operations retain their
canonical initial DM identity; these paths do not impersonate a member through `--as`.

`channelDm` reopens an existing, readable Human participant DM without requiring current audience
reach, returning `channel.readOnly:true` when reach is lost. It performs no write in that case.
Without an existing DM, current reach is required before creating one. Bot callers do not receive
this Human history exception. The ordinary Channel write fence remains authoritative for `send`.

The shared/history projection is still one discovery read, using the existing participant-pair
lookup index. Each CLI command resolves its DM with one authenticated RPC; `send` drops the
preceding owner-only `get`, so resolution uses one fewer RPC than before. Status polling and
call-history pagination reuse the resolved ID. Current authorization is rechecked by the Host.
No schema migration, dependency, worker or additional Memory store is introduced.

## UI integration needs

1. Bot settings visibility and audience controls, using `audienceDirectory`; publication permission and principal/all-Bots management gating.
2. Shrink impact preview and explicit confirmation, then refresh DMs and Channel membership.
3. Principal switches for proactive DMs, principal Channels and speaker context; per-Human proactive opt-out.
4. Reachable-Bot discovery and DM/add pickers using metadata only; retain existing participant DM navigation for `list` entries with `readOnly:true`, and exclude those history-only entries from new-DM/add pickers using `reachableBots`.
5. Channel add eligibility and present-Bot mention pickers using `memberBots`, including private Bots already in the Channel.
6. Admin Role Policy editor with topic tags and Allow/Deny items; assignment conflict indicators using `roleConflicts` and policy revisions.
7. Principal status/access-loss feedback and current-audience refusal handling through coded errors and `details`.
8. Public-Bot inspector privacy handling for `bot-session-private`; route authorized Humans through M11's existing audited DM view.
9. External IM binding controls requiring principal identity and `im.bind`; all-Bots management alone is insufficient.
10. Publication/retarget disclosure using `preview.memory`; backing M6 shared-Memory placement is implemented in core and remains separate from grantable folders.
11. Bilingual CLI guidance and release fragments, plus Web/mobile rendering and Human acceptance for these controls. This logic task intentionally leaves public copy to the UI owner.
