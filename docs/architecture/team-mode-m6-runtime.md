# Team mode M6 runtime contract

The application-defined `WorkspaceSpaces` Service owns account/shared space metadata in `workspace_spaces`. It uses the existing BotHarness Typert Service and API Gateway; the member-method catalog remains import-free. Mutations check `workspaces.manageShared` in the Service. Listing returns only the calling Human's account space and audience-visible shared spaces; managers additionally see all shared spaces. Manager authority never lists another Human's account space.

M6 uses schema generation **150**, following M4 Channel access (146), Environment E4 (147), and M10 (148/149). Schema plans require contiguous generations, so M6 must merge after M10. The upgrade regression covers a database already at 149 and one at main's 147; the latter runs M10's 148 and 149 before 150, never skips them. No upstream DSH schema or authentication protocol changes.

## Storage and Grants

Account roots are `DSH_HOME/spaces/<humanId>`; shared roots are `DSH_HOME/shared/<slug>`. Both reserve `files/` for grantable Workspace files. Account Bot Memory is `bots/<slug>/memory`, separate from `files/`. The Owner has an account root too. Account creation is ensured during member creation, sign-in and startup. The Workspace lookup exposes the space ID with its `files/` path; shared display-name changes preserve the ID and directory.

The migration persists pending Memory moves. Startup validates retained exclusive directory/inode proofs before rename, then rewrites both the Bot record's `memoryDir` and `persona_bot_memory_ownership`. An interrupted rename resumes using its recorded identity; an occupied destination, substituted repository or unproven custom Memory fails closed. Retained or unfinished deleted-Bot Memory moves too, with deletion-state paths and ownership proofs rewritten while preserving the deletion state. New member Bots and Tob use the account Memory layout. Imported managed repositories receive the same ownership proof.

Grant creation, prepared authorization commit and `requireActive` check current Bot ownership, current space audience and protected paths. A private Bot's audience is its owner; the pre-M7 Host Bot fallback is the current Host Owner. Role audiences resolve current role assignments using the same `host_roles.role_id` authority as M4 Channel visibility. Deleting a custom Host Role referenced by a shared-space audience returns `role-in-use` without mutating the role, assignments or audience; release the reference through a space audience update or space deletion first. Another account, any Memory repository and Host data remain forbidden even with broader Grant authority. Account and shared IDs resolve through the existing Grant store, with no second Grant authority. Deleting an empty shared space revokes its Grants, so recreating the same directory cannot revive them.

Native path guards cover `read`, `read_image`, `write`, `edit`, `str_replace_editor`, `glob`, `grep`, and every Add/Update/Delete/Move path in `apply_patch`. Space checks run before Full Access exemptions. Filesystem checks canonicalize symlinks, including dangling targets and symlink/`..` combinations. Existing multiply linked files are compared by device/inode against forbidden roots. Search preflight visits directory entries without following escaping links. Attachment saving, direct Bot attachment import/forwarding and Workspace file targets use the same current authority. These guards are application permissions, not OS confinement for Shell; M12 owns execution confinement.

`core.currentRoots(session, kind)` provides the bound `(Session, 'read' | 'write') => string[]` contract for M12. The underlying exported helper in `workspaces/grant-native-tools.ts` also accepts an explicit core port. Roots include own Memory and current applicable Grants, with Assignment snapshots checked against their original Grant.

## M9 integration

`memberTransferPreview` retains `channels` and `bots`, adding `space: { spaceId, files, memories }`. `files` is a relative-path filesystem manifest including kind, size, modification time and directory identity; `memories` identifies transferred ordinary Bots. Tob remains with its original Human. Transfer moves account files and private Bot directories into the destination account, rewrites Memory paths/proofs and revokes transferred Bot Grants in the ownership transaction. Existing destinations merge only directories; a file collision returns `space-name-taken` without overwriting either file. A durable file-move journal rolls back interrupted transfers before startup admission. The existing M9 permission ceiling, Owner/self protection, ownership publication and stop path remain in force.

Content Purge includes the account filesystem manifest in its confirmation fingerprint. Changed files require a new preview. Its existing monotonic deleted-Human ledger drives account-space deletion after accepted Bot Memory cleanup, including replay and accounts with no Bots. Shared roots remain; existing Content Purge managed-file reference rules remain authoritative for source attachments. Account metadata is removed with the identity. A failed Bot cleanup retains the account and the existing fail-closed recovery behavior.

## Wire and CLI

All bridge failures retain `{ ok: false, error: { code, message: code, details? } }` for the new space operations. Typert unwraps the existing bridge envelope.

| Method             | Payload                         | Success value                                                     |
| ------------------ | ------------------------------- | ----------------------------------------------------------------- |
| `spaces`           | `{}`                            | `[{ spaceId, kind, name, canManage, ownerHumanId?, audience? }]`  |
| `spaceCreate`      | `{ name, audience }`            | The created shared-space record                                   |
| `spaceUpdate`      | `{ spaceId, name?, audience? }` | The updated shared-space record                                   |
| `spaceDelete`      | `{ spaceId, confirm: true }`    | `null`                                                            |
| `workspaceOptions` | `{}`                            | `{ workspaces: [{ id: spaceId, path: "…/files", title: name }] }` |

Audience is exactly `{ kind: 'everyone' }`, `{ kind: 'roles', roleIds: string[] }`, or `{ kind: 'members', humanIds: string[] }`. References use canonical Host Role/Human IDs. Shared IDs are stable `shared/<slug>` values; account IDs are `spaces/<humanId>`.

Space refusals: `permission-required` with `details.permission: 'workspaces.manageShared'`, `space-name-taken`, `space-not-empty`, `space-not-found`, `role-not-found`, `member-not-found`, and `invalid-input` for malformed payloads. Account update/delete returns `space-not-found`. Listing rechecks active membership and mode.

Grant/path refusals: `grant-foreign-space`, `grant-protected-path`, `grant-outside-audience`; Grant errors include `details.path` and `details.spaceId` when known. Existing Grant refusals remain. Native Tool guards return the refusal code; attachment operations preserve the underlying coded error.

```text
spaces list [--as <username>]
spaces create --name <name> --audience roles:<id,...>|members:<humanId,...>|everyone [--as <username>]
spaces update <spaceId> [--name <name>] [--audience <audience>] [--as <username>]
spaces delete <spaceId> --confirm [--as <username>]
```

All commands use the existing online CLI path; `--as` goes only through the existing member Peer evaluation route and never retries as Owner. Claude owns the Settings surfaces, audience picker, Workspace pickers, refusal messages, translations, bilingual CLI guide and release fragment.

## Performance guard

No dependency, worker or timer is added. Ordinary path checks read Bot/space metadata and current role assignments in a fixed number of queries. Metadata work scales with retained Bots and spaces; hard-link inode scans occur only for multiply linked files. Directory searches reuse one synchronous permission snapshot across their preflight tree rather than querying for each file. Tests hold listing and path-check query counts constant while adding 1,000 Humans and additional role-scoped spaces. Transfer/purge filesystem manifests are explicit cold-path work. These are structural guards, not an end-to-end latency or OS-isolation claim.
