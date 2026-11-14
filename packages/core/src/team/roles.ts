import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import { TeamError } from './error.js';
import {
  ALL_PERMISSIONS,
  roleSchema,
  type HostPermission,
  type HostRole,
  type RoleModels,
  type ModelsAllowed,
  roleModelsSchema,
} from './permissions.js';

const roleFields = `r.role_id AS roleId, r.name, r.builtin, r.permissions_json AS permissions, r.models_json AS models,
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
            .prepare(`SELECT r.permissions_json AS permissions, r.models_json AS models,
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

  modelsAllowed(human: HumanContext): ModelsAllowed {
    const rows = z
      .array(z.object({ models: z.string().nullable(), owner: z.coerce.boolean() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(`SELECT r.models_json AS models, s.owner_human_id = h.human_id AS owner
      FROM humans h CROSS JOIN team_settings s LEFT JOIN human_roles m ON m.human_id = h.human_id
      LEFT JOIN host_roles r ON r.role_id = m.role_id
      WHERE h.human_id = ? AND (h.status = 'active' OR s.owner_human_id = h.human_id)`)
            .all(human.humanId),
        ),
      );
    if (rows.some((row) => row.owner)) return { all: true };
    const models = rows.flatMap((row) =>
      row.models === null ? [] : [roleModelsSchema.parse(JSON.parse(row.models))],
    );
    if (models.some((model) => model.kind === 'all')) return { all: true };
    return {
      all: false,
      routes: [
        ...new Set(models.flatMap((model) => (model.kind === 'only' ? model.routes : []))),
      ].sort(),
    };
  }

  requireModel(human: HumanContext, route: { provider: string; model: string }): void {
    const allowed = this.modelsAllowed(human);
    const key = `${route.provider}/${route.model}`;
    if (!allowed.all && !allowed.routes.includes(key))
      throw new TeamError('model-not-allowed', undefined, { route: key });
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
    const rows = z
      .array(z.object({ permissions: z.string().nullable(), owner: z.coerce.boolean() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(`SELECT r.permissions_json AS permissions, s.owner_human_id = h.human_id AS owner
        FROM humans h CROSS JOIN team_settings s LEFT JOIN human_roles m ON m.human_id = h.human_id
        LEFT JOIN host_roles r ON r.role_id = m.role_id
        WHERE h.human_id = ? AND (h.status = 'active' OR s.owner_human_id = h.human_id)`)
            .all(human.humanId),
        ),
      );
    if (rows.some((row) => row.owner)) return { kind: 'owner' };
    const effective = new Set(
      rows.flatMap((row) =>
        row.permissions === null ? [] : z.array(z.string()).parse(JSON.parse(row.permissions)),
      ),
    );
    return {
      kind: 'member',
      permissions: new Set(ALL_PERMISSIONS.filter((permission) => effective.has(permission))),
    };
  }

  private checkModelGrant(actor: ModelsAllowed, models: RoleModels): void {
    if (actor.all) return;
    if (models.kind === 'all')
      throw new TeamError('model-not-allowed', undefined, { route: 'all' });
    const outside = models.routes.find((route) => !actor.routes.includes(route));
    if (outside !== undefined)
      throw new TeamError('model-not-allowed', undefined, { route: outside });
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

  create(
    human: HumanContext,
    name: string,
    permissions: string[],
    models: RoleModels = { kind: 'all' },
  ): { role: HostRole } {
    this.require(human, 'roles.manage');
    const normalized = this.name(name);
    const grants = this.validatePermissions(permissions);
    const authority = this.authority(human);
    this.checkPermissions(authority, grants, 'grant');
    const modelPolicy = roleModelsSchema.parse(models);
    this.checkModelGrant(
      authority.kind === 'owner' ? { all: true } : this.modelsAllowed(human),
      modelPolicy,
    );
    const id = randomUUID();
    this.db.transaction(
      (db) =>
        db
          .prepare(
            'INSERT INTO host_roles (role_id, name, builtin, permissions_json, models_json) VALUES (?, ?, NULL, ?, ?)',
          )
          .run(id, normalized, JSON.stringify(grants), JSON.stringify(modelPolicy)),
      ['team'],
    );
    this.invalidate();
    return { role: this.role(id) };
  }

  update(
    human: HumanContext,
    roleId: string,
    patch: { name?: string; permissions?: string[]; models?: RoleModels },
  ): { role: HostRole } {
    this.require(human, 'roles.manage');
    const role = this.role(roleId);
    const authority = this.authority(human);
    this.checkPermissions(authority, role.permissions, 'manage');
    const models = patch.models === undefined ? role.models : roleModelsSchema.parse(patch.models);
    if (patch.models !== undefined)
      this.checkModelGrant(
        authority.kind === 'owner' ? { all: true } : this.modelsAllowed(human),
        models,
      );
    if (role.builtin === 'admin' && models.kind !== 'all') throw new TeamError('role-builtin');
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
          .prepare(
            'UPDATE host_roles SET name = ?, permissions_json = ?, models_json = ? WHERE role_id = ?',
          )
          .run(name, JSON.stringify(grants), JSON.stringify(models), roleId),
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
      this.db.read((db) => {
        if (
          !db
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspace_spaces'",
            )
            .get()
        )
          return false;
        return (
          db
            .prepare(`SELECT 1 FROM workspace_spaces s, json_each(s.audience_json, '$.roleIds') r
          WHERE s.kind = 'shared' AND json_extract(s.audience_json, '$.kind') = 'roles'
          AND r.value = ? LIMIT 1`)
            .get(roleId) !== undefined
        );
      })
    )
      throw new TeamError('role-in-use');
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
    ) {
      const fallback = this.role('member');
      this.checkPermissions(authority, fallback.permissions, 'grant');
      this.checkModelGrant(this.modelsAllowed(human), fallback.models);
    }
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
    const models = authority.kind === 'owner' ? { all: true as const } : this.modelsAllowed(human);
    for (const role of roles) {
      this.checkPermissions(authority, role.permissions, 'grant');
      this.checkModelGrant(models, role.models);
    }
    return ids;
  }

  requireManagementTarget(human: HumanContext, humanId: string): void {
    this.require(human, 'members.manage');
    if (this.isOwner(humanContext(humanId))) throw new TeamError('owner-protected');
    if (human.humanId === humanId)
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    const rows = this.db.read((db) =>
      db
        .prepare(`SELECT r.role_id, r.permissions_json
      FROM human_roles h JOIN host_roles r USING(role_id) WHERE h.human_id = ?`)
        .all(humanId),
    );
    const authority = this.authority(human);
    if (authority.kind === 'owner') return;
    if (rows.some((row) => row.role_id === 'admin'))
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    for (const row of rows)
      this.checkPermissions(
        authority,
        z.array(z.string()).parse(JSON.parse(String(row.permissions_json))),
        'manage',
      );
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
