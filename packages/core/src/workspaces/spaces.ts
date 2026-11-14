import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { HumanContext } from '../humans/context.js';
import type { TeamRoles } from '../team/roles.js';
import { TeamError } from '../team/error.js';
import { WorkspaceGrantError, type DshWorkspace, type DshWorkspaceLookup } from './grants.js';
import { canonicalPath, within } from './space-paths.js';

export const spaceAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('everyone') }).strict(),
  z.object({ kind: z.literal('roles'), roleIds: z.array(z.string().min(1)).max(1000) }).strict(),
  z.object({ kind: z.literal('members'), humanIds: z.array(z.string().min(1)).max(1000) }).strict(),
]);
export type SpaceAudience = z.infer<typeof spaceAudienceSchema>;
export type WorkspaceSpace = {
  spaceId: string;
  name: string;
  canManage: boolean;
} & ({ kind: 'account'; ownerHumanId: string } | { kind: 'shared'; audience: SpaceAudience });
const rowSchema = z.object({
  space_id: z.string(),
  kind: z.enum(['account', 'shared']),
  name: z.string(),
  owner_human_id: z.string().nullable(),
  audience_json: z.string().nullable(),
});
type SpaceRow = z.infer<typeof rowSchema>;
const botSchema = z.object({ owner: z.string(), memory: z.string().nullable(), slug: z.string() });

export class WorkspaceSpaces {
  readonly home: string;
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    home: string,
    private readonly roles: TeamRoles,
    private readonly invalidate: () => void = () => {},
    initialize = true,
  ) {
    this.home = realpathSync(home);
    if (!initialize) return;
    this.db.transaction(
      (connection) =>
        connection.exec(`INSERT OR IGNORE INTO workspace_spaces
      SELECT 'spaces/' || human_id, 'account', display_name, human_id, NULL FROM humans`),
      ['workspace-spaces'],
    );
    for (const row of this.rows()) this.ensureDirectory(row.space_id);
  }

  private rows(): SpaceRow[] {
    return z
      .array(rowSchema)
      .parse(
        this.db.read((connection) =>
          connection.prepare('SELECT * FROM workspace_spaces ORDER BY space_id').all(),
        ),
      );
  }
  path(spaceId: string): string {
    if (!/^(spaces|shared)\/[^/\\\u0000]+$/u.test(spaceId) || /\/(\.|\.\.)$/u.test(spaceId))
      throw new TeamError('space-not-found');
    return join(this.home, spaceId);
  }
  private ensureDirectory(spaceId: string): string {
    const path = this.path(spaceId);
    if (canonicalPath(path) !== path) throw new TeamError('grant-protected-path');
    mkdirSync(join(path, 'files'), { recursive: true });
    if (realpathSync(path) !== path || realpathSync(join(path, 'files')) !== join(path, 'files'))
      throw new TeamError('grant-protected-path');
    return path;
  }
  ensureAccount(humanId: string, requireActive = false): string {
    const member = z
      .object({
        name: z.string(),
        existing: z.string().nullable(),
        status: z.string(),
        enabled: z.coerce.boolean(),
        owner: z.coerce.boolean(),
      })
      .safeParse(
        this.db.read((connection) =>
          connection
            .prepare(
              'SELECT display_name AS name, status, s.enabled, s.owner_human_id = h.human_id AS owner, (SELECT space_id FROM workspace_spaces WHERE owner_human_id = h.human_id) AS existing FROM humans h CROSS JOIN team_settings s WHERE h.human_id = ?',
            )
            .get(humanId),
        ),
      );
    if (!member.success) throw new TeamError('member-not-found');
    if (requireActive && member.data.status !== 'active') throw new TeamError('member-suspended');
    if (requireActive && !member.data.enabled && !member.data.owner)
      throw new TeamError('team-mode-off');
    const spaceId = 'spaces/' + humanId;
    this.ensureDirectory(spaceId);
    if (member.data.existing === null)
      this.db.transaction(
        (connection) =>
          connection
            .prepare(`INSERT OR IGNORE INTO workspace_spaces
      VALUES (?, 'account', ?, ?, NULL)`)
            .run(spaceId, member.data.name, humanId),
        ['workspace-spaces'],
      );
    return this.path(spaceId);
  }
  private includes(audience: SpaceAudience, humanId: string, roleIds?: readonly string[]): boolean {
    if (audience.kind === 'everyone') return true;
    if (audience.kind === 'members') return audience.humanIds.includes(humanId);
    if (roleIds) return roleIds.some((id) => audience.roleIds.includes(id));
    const roles = z
      .array(z.object({ role_id: z.string() }))
      .parse(
        this.db.read((connection) =>
          connection.prepare('SELECT role_id FROM human_roles WHERE human_id = ?').all(humanId),
        ),
      );
    return roles.some((role) => audience.roleIds.includes(role.role_id));
  }
  private roleIds(humanId: string): string[] {
    return z
      .array(z.object({ role_id: z.string() }))
      .parse(
        this.db.read((connection) =>
          connection.prepare('SELECT role_id FROM human_roles WHERE human_id = ?').all(humanId),
        ),
      )
      .map((row) => row.role_id);
  }
  private record(row: SpaceRow, canManage: boolean): WorkspaceSpace {
    const common = { spaceId: row.space_id, name: row.name, canManage };
    return row.kind === 'account'
      ? { ...common, kind: 'account', ownerHumanId: z.string().parse(row.owner_human_id) }
      : {
          ...common,
          kind: 'shared',
          audience: spaceAudienceSchema.parse(JSON.parse(z.string().parse(row.audience_json))),
        };
  }
  list(human: HumanContext): WorkspaceSpace[] {
    this.ensureAccount(human.humanId, true);
    const manage = this.roles.permissions(human).includes('workspaces.manageShared');
    const roleIds = this.roleIds(human.humanId);
    return this.rows().flatMap<WorkspaceSpace>((row) => {
      const record = this.record(row, row.kind === 'shared' && manage);
      return record.kind === 'account'
        ? record.ownerHumanId === human.humanId
          ? [record]
          : []
        : manage || this.includes(record.audience, human.humanId, roleIds)
          ? [record]
          : [];
    });
  }
  private audience(input: SpaceAudience): SpaceAudience {
    const audience = spaceAudienceSchema.parse(input);
    const ids =
      audience.kind === 'everyone'
        ? []
        : audience.kind === 'roles'
          ? audience.roleIds
          : audience.humanIds;
    const table = audience.kind === 'roles' ? 'host_roles' : 'humans';
    const key = audience.kind === 'roles' ? 'role_id' : 'human_id';
    for (const id of new Set(ids))
      if (
        !this.db.read((connection) =>
          connection.prepare(`SELECT 1 FROM ${table} WHERE ${key} = ?`).get(id),
        )
      )
        throw new TeamError(audience.kind === 'roles' ? 'role-not-found' : 'member-not-found');
    return audience.kind === 'everyone'
      ? audience
      : audience.kind === 'roles'
        ? { kind: 'roles', roleIds: [...new Set(ids)].sort() }
        : { kind: 'members', humanIds: [...new Set(ids)].sort() };
  }
  private name(input: string, spaceId = ''): string {
    const name = input.trim();
    if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/u.test(name))
      throw new TeamError('invalid-input');
    if (
      this.db.read((connection) =>
        connection
          .prepare(
            "SELECT 1 FROM workspace_spaces WHERE kind = 'shared' AND name = ? AND space_id <> ?",
          )
          .get(name, spaceId),
      )
    )
      throw new TeamError('space-name-taken');
    return name;
  }
  create(human: HumanContext, name: string, input: SpaceAudience): WorkspaceSpace {
    this.roles.require(human, 'workspaces.manageShared');
    const normalized = this.name(name);
    const audience = this.audience(input);
    const slug =
      normalized
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '')
        .slice(0, 80) || 'space';
    let spaceId = 'shared/' + slug;
    let suffix = 2;
    while (this.rows().some((row) => row.space_id === spaceId) || existsSync(this.path(spaceId)))
      spaceId = 'shared/' + slug + '-' + suffix++;
    this.ensureDirectory(spaceId);
    this.db.transaction(
      (connection) =>
        connection
          .prepare("INSERT INTO workspace_spaces VALUES (?, 'shared', ?, NULL, ?)")
          .run(spaceId, normalized, JSON.stringify(audience)),
      ['workspace-spaces'],
    );
    this.invalidate();
    return { spaceId, kind: 'shared', name: normalized, audience, canManage: true };
  }
  update(
    human: HumanContext,
    spaceId: string,
    patch: { name?: string; audience?: SpaceAudience },
  ): WorkspaceSpace {
    this.roles.require(human, 'workspaces.manageShared');
    const row = this.rows().find((entry) => entry.space_id === spaceId && entry.kind === 'shared');
    if (!row) throw new TeamError('space-not-found');
    const name = patch.name === undefined ? row.name : this.name(patch.name, spaceId);
    const audience =
      patch.audience === undefined
        ? spaceAudienceSchema.parse(JSON.parse(z.string().parse(row.audience_json)))
        : this.audience(patch.audience);
    this.db.transaction(
      (connection) =>
        connection
          .prepare('UPDATE workspace_spaces SET name = ?, audience_json = ? WHERE space_id = ?')
          .run(name, JSON.stringify(audience), spaceId),
      ['workspace-spaces'],
    );
    this.invalidate();
    return { spaceId, kind: 'shared', name, audience, canManage: true };
  }
  delete(human: HumanContext, spaceId: string, confirm: boolean): null {
    this.roles.require(human, 'workspaces.manageShared');
    if (!confirm) throw new TeamError('confirm-required');
    if (!this.rows().some((row) => row.space_id === spaceId && row.kind === 'shared'))
      throw new TeamError('space-not-found');
    const path = this.ensureDirectory(spaceId);
    if (
      readdirSync(path).some((name) => name !== 'files') ||
      readdirSync(join(path, 'files')).length ||
      this.memories().some((bot) => within(path, bot.memory))
    )
      throw new TeamError('space-not-empty');
    rmSync(path, { recursive: true });
    this.db.transaction(
      (connection) => {
        connection
          .prepare(
            'UPDATE workspace_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE workspace_id = ? OR workspace_path = ?',
          )
          .run(new Date().toISOString(), spaceId, path);
        connection.prepare('DELETE FROM workspace_spaces WHERE space_id = ?').run(spaceId);
      },
      ['workspace-spaces', 'workspace-grants'],
    );
    this.invalidate();
    return null;
  }
  private memories() {
    return z
      .array(botSchema)
      .parse(
        this.db.read((connection) =>
          connection
            .prepare(`SELECT slug, owner_human_id AS owner,
      json_extract(body, '$.memoryDir') AS memory FROM persona_bots`)
            .all(),
        ),
      )
      .map((bot) => ({
        ...bot,
        memory: canonicalPath(
          bot.memory ?? join(this.home, 'botharness', 'bots', bot.slug, 'memory'),
        ),
      }));
  }
  private refuse(
    code: 'grant-foreign-space' | 'grant-protected-path' | 'grant-outside-audience',
    path: string,
    spaceId?: string,
  ): never {
    throw new WorkspaceGrantError(code, code, {
      path,
      ...(spaceId === undefined ? {} : { spaceId }),
    });
  }
  assertPath(botSlug: string, input: string, grant = false): void {
    this.pathCheck(botSlug, grant)(input);
  }
  assertTree(botSlug: string, input: string): void {
    const check = this.pathCheck(botSlug, false);
    check(input);
    const root = canonicalPath(input);
    const visit = (path: string): void => {
      check(path);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        if (!within(root, canonicalPath(path))) this.refuse('grant-protected-path', path);
      } else if (stat.isDirectory()) {
        for (const name of readdirSync(path)) visit(join(path, name));
      }
    };
    if (existsSync(root) && statSync(root).isDirectory())
      for (const name of readdirSync(root)) visit(join(root, name));
  }
  private pathCheck(botSlug: string, grant: boolean): (input: string) => void {
    const bots = this.memories();
    const bot = bots.find((entry) => entry.slug === botSlug);
    const owner = bot?.owner ?? this.roles.ownerContext().humanId;
    const rows = this.rows();
    const roleIds = this.roleIds(owner);
    return (input) => {
      let path: string;
      try {
        path = canonicalPath(input);
      } catch {
        return this.refuse('grant-protected-path', resolve(input));
      }
      for (const memory of bots)
        if ((grant || memory.slug !== botSlug) && within(memory.memory, path))
          this.refuse(
            'grant-protected-path',
            path,
            rows.find((row) => within(this.path(row.space_id), memory.memory))?.space_id,
          );
      for (const row of rows) {
        const root = this.path(row.space_id);
        if (!within(root, path) && !within(path, root)) continue;
        if (row.kind === 'account' && row.owner_human_id !== owner)
          this.refuse('grant-foreign-space', path, row.space_id);
        if (
          row.kind === 'shared' &&
          !this.includes(
            spaceAudienceSchema.parse(JSON.parse(z.string().parse(row.audience_json))),
            owner,
            roleIds,
          )
        )
          this.refuse('grant-outside-audience', path, row.space_id);
      }
      for (const memory of bots)
        if (
          (grant || memory.slug !== botSlug) &&
          (within(memory.memory, path) || within(path, memory.memory))
        )
          this.refuse(
            'grant-protected-path',
            path,
            rows.find((row) => within(this.path(row.space_id), memory.memory))?.space_id,
          );
      const ownMemory = !grant && bot !== undefined && within(bot.memory, path);
      const managed = rows.some((row) => within(this.path(row.space_id), path));
      if (!ownMemory && !managed && (within(this.home, path) || within(path, this.home)))
        this.refuse('grant-protected-path', path);
      if (existsSync(path) && statSync(path).isFile() && statSync(path).nlink > 1) {
        const identity = statSync(path);
        const scan = (root: string): boolean => {
          if (!existsSync(root)) return false;
          const entry = lstatSync(root);
          if (entry.isSymbolicLink()) return false;
          if (entry.isFile()) return entry.dev === identity.dev && entry.ino === identity.ino;
          return entry.isDirectory() && readdirSync(root).some((name) => scan(join(root, name)));
        };
        for (const row of rows) {
          if (
            row.kind === 'account' &&
            row.owner_human_id !== owner &&
            scan(this.path(row.space_id))
          )
            this.refuse('grant-foreign-space', path, row.space_id);
          if (
            row.kind === 'shared' &&
            !this.includes(
              spaceAudienceSchema.parse(JSON.parse(z.string().parse(row.audience_json))),
              owner,
              roleIds,
            ) &&
            scan(this.path(row.space_id))
          )
            this.refuse('grant-outside-audience', path, row.space_id);
        }
        for (const memory of bots)
          if ((grant || memory.slug !== botSlug) && scan(memory.memory))
            this.refuse('grant-protected-path', path);
        if (
          readdirSync(this.home).some(
            (name) => name !== 'spaces' && name !== 'shared' && scan(join(this.home, name)),
          )
        )
          this.refuse('grant-protected-path', path);
      }
    };
  }
  workspaceLookup(external?: DshWorkspaceLookup): DshWorkspaceLookup {
    const spaces: DshWorkspace[] = this.rows().map((row) => ({
      id: row.space_id,
      path: join(this.path(row.space_id), 'files'),
      title: row.name,
      status: async () =>
        existsSync(join(this.path(row.space_id), 'files')) ? 'ok' : 'missing-dir',
    }));
    return {
      get: (id) => spaces.find((space) => space.id === id) ?? external?.get(id),
      list: () => [...spaces, ...(external?.list() ?? [])],
    };
  }
}
