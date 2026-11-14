import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import { TeamError } from './error.js';
import { ALL_PERMISSIONS, roleSchema, type HostPermission, type HostRole } from './permissions.js';

const roleFields = `r.role_id AS roleId, r.name, r.builtin, r.permissions_json AS permissions,
  (SELECT COUNT(*) FROM human_roles m WHERE m.role_id = r.role_id) AS memberCount`;

type RoleAuthority = { kind: 'owner' } | { kind: 'member'; permissions: ReadonlySet<string> };

export class TeamRoles {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly invalidate: (revoke?: boolean) => void,
  ) {}

  ownerContext(): HumanContext {
    const row = z
      .object({ owner_human_id: z.string() })
      .parse(
        this.db.read((db) =>
          db.prepare('SELECT owner_human_id FROM team_settings WHERE singleton = 1').get(),
        ),
      );
    return humanContext(row.owner_human_id);
  }

  isOwner(human: HumanContext): boolean {
    return human.humanId === this.ownerContext().humanId;
  }

  permissions(human: HumanContext): HostPermission[] {
    const rows = z
      .array(z.object({ permissions: z.string().nullable(), owner: z.coerce.boolean() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(`SELECT r.permissions_json AS permissions,
        s.owner_human_id = h.human_id AS owner FROM humans h CROSS JOIN team_settings s
        LEFT JOIN human_roles m ON m.human_id = h.human_id
        LEFT JOIN host_roles r ON r.role_id = m.role_id WHERE h.human_id = ? AND h.status = 'active'`)
            .all(human.humanId),
        ),
      );
    if (rows.some((row) => row.owner)) return [...ALL_PERMISSIONS];
    const effective = new Set(
      rows.flatMap((row) =>
        row.permissions === null ? [] : z.array(z.string()).parse(JSON.parse(row.permissions)),
      ),
    );
    return ALL_PERMISSIONS.filter((permission) => effective.has(permission));
  }

  require(human: HumanContext, ...permissions: [HostPermission, ...HostPermission[]]): void {
    const effective = this.permissions(human);
    if (!permissions.some((permission) => effective.includes(permission)))
      throw new TeamError('permission-required', undefined, { permission: permissions[0] });
  }

  list(human: HumanContext): HostRole[] {
    this.require(human, 'roles.manage', 'members.manage');
    return z
      .array(roleSchema)
      .parse(
        this.db.read((db) =>
          db.prepare(`SELECT ${roleFields} FROM host_roles r ORDER BY r.role_id`).all(),
        ),
      );
  }

  private role(roleId: string): HostRole {
    const row = this.db.read((db) =>
      db.prepare(`SELECT ${roleFields} FROM host_roles r WHERE r.role_id = ?`).get(roleId),
    );
    if (!row) throw new TeamError('role-not-found');
    return roleSchema.parse(row);
  }

  private name(name: string, roleId?: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 128 || /[\u0000-\u001f\u007f]/u.test(trimmed))
      throw new TeamError('role-name-invalid');
    if (
      this.db.read((db) =>
        db
          .prepare('SELECT 1 FROM host_roles WHERE name = ? AND role_id <> ?')
          .get(trimmed, roleId ?? ''),
      )
    )
      throw new TeamError('role-name-taken');
    return trimmed;
  }

  private validatePermissions(permissions: string[]): HostPermission[] {
    if (permissions.some((id) => !ALL_PERMISSIONS.some((known) => known === id)))
      throw new TeamError('permission-unknown');
    return ALL_PERMISSIONS.filter((id) => permissions.includes(id));
  }

  private authority(human: HumanContext): RoleAuthority {
    return this.isOwner(human)
      ? { kind: 'owner' }
      : { kind: 'member', permissions: new Set(this.permissions(human)) };
  }

  private checkPermissions(
    authority: RoleAuthority,
    permissions: readonly string[],
    operation: 'grant' | 'manage',
  ): void {
    if (authority.kind === 'owner') return;
    const permission = permissions.find(
      (id) =>
        !authority.permissions.has(id) || (operation === 'grant' && id === 'privateContent.view'),
    );
    if (permission !== undefined)
      throw new TeamError('permission-not-grantable', undefined, { permission });
  }

  create(human: HumanContext, name: string, permissions: string[]): { role: HostRole } {
    this.require(human, 'roles.manage');
    const normalized = this.name(name);
    const grants = this.validatePermissions(permissions);
    this.checkPermissions(this.authority(human), grants, 'grant');
    const id = randomUUID();
    this.db.transaction(
      (db) =>
        db
          .prepare('INSERT INTO host_roles VALUES (?, ?, NULL, ?)')
          .run(id, normalized, JSON.stringify(grants)),
      ['team'],
    );
    this.invalidate();
    return { role: this.role(id) };
  }

  update(
    human: HumanContext,
    roleId: string,
    patch: { name?: string; permissions?: string[] },
  ): { role: HostRole } {
    this.require(human, 'roles.manage');
    const role = this.role(roleId);
    const authority = this.authority(human);
    this.checkPermissions(authority, role.permissions, 'manage');
    const name = patch.name === undefined ? role.name : this.name(patch.name, roleId);
    const grants =
      patch.permissions === undefined
        ? role.permissions
        : this.validatePermissions(patch.permissions);
    if (role.builtin === 'admin' && grants.includes('privateContent.view'))
      throw new TeamError('permission-not-grantable', undefined, {
        permission: 'privateContent.view',
      });
    this.checkPermissions(authority, grants, 'grant');
    this.db.transaction(
      (db) =>
        db
          .prepare('UPDATE host_roles SET name = ?, permissions_json = ? WHERE role_id = ?')
          .run(name, JSON.stringify(grants), roleId),
      ['team'],
    );
    this.invalidate(role.permissions.some((permission) => !grants.includes(permission)));
    return { role: this.role(roleId) };
  }

  delete(human: HumanContext, roleId: string): null {
    this.require(human, 'roles.manage');
    const role = this.role(roleId);
    const authority = this.authority(human);
    this.checkPermissions(authority, role.permissions, 'manage');
    if (role.builtin) throw new TeamError('role-builtin');
    if (
      authority.kind === 'member' &&
      this.db.read((db) =>
        db
          .prepare(`SELECT 1 FROM humans h
      WHERE h.human_id <> (SELECT owner_human_id FROM team_settings)
      AND NOT EXISTS (SELECT 1 FROM human_roles m WHERE m.human_id = h.human_id AND m.role_id <> ?)
      LIMIT 1`)
          .get(roleId),
      )
    )
      this.checkPermissions(authority, this.role('member').permissions, 'grant');
    this.db.transaction(
      (db) => {
        db.prepare('DELETE FROM human_roles WHERE role_id = ?').run(roleId);
        db.prepare('DELETE FROM host_roles WHERE role_id = ?').run(roleId);
        db.prepare(`INSERT INTO human_roles SELECT h.human_id, 'member' FROM humans h
        WHERE h.human_id <> (SELECT owner_human_id FROM team_settings)
        AND NOT EXISTS (SELECT 1 FROM human_roles m WHERE m.human_id = h.human_id)`).run();
      },
      ['team'],
    );
    this.invalidate(true);
    return null;
  }

  validateAssignments(human: HumanContext, roleIds: string[]): string[] {
    const ids = [...new Set(roleIds.length ? roleIds : ['member'])];
    const roles = ids.map((id) => this.role(id));
    const authority = this.authority(human);
    if (ids.includes('admin') && authority.kind !== 'owner')
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    for (const role of roles) this.checkPermissions(authority, role.permissions, 'grant');
    return ids;
  }

  set(human: HumanContext, humanId: string, roleIds: string[]): null {
    if (human.humanId === humanId && !this.isOwner(human))
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    this.require(human, 'members.manage');
    if (!this.db.read((db) => db.prepare('SELECT 1 FROM humans WHERE human_id = ?').get(humanId)))
      throw new TeamError('member-not-found');
    if (this.isOwner(humanContext(humanId))) throw new TeamError('owner-protected');
    const ids = this.validateAssignments(human, roleIds);
    const previous = z
      .array(z.object({ role_id: z.string() }))
      .parse(
        this.db.read((db) =>
          db.prepare('SELECT role_id FROM human_roles WHERE human_id = ?').all(humanId),
        ),
      );
    this.db.transaction(
      (db) => {
        db.prepare('DELETE FROM human_roles WHERE human_id = ?').run(humanId);
        for (const id of ids) db.prepare('INSERT INTO human_roles VALUES (?, ?)').run(humanId, id);
      },
      ['team'],
    );
    this.invalidate(previous.some((row) => !ids.includes(row.role_id)));
    return null;
  }
}
