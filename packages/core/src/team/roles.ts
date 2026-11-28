import { resolveHostPermissions, type RoleGrant } from '../team-policy/host-access.js';
import { rolePolicySchema, type RolePolicy } from '../team-policy/bot-contract.js';
import { STALE_HOST_ROLE } from '@botharness/host-protocol/team-roles';
import { allPublicBotsSql } from '../team-policy/bot-access.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import { TeamError } from '../team-policy/error.js';
import { effectiveHostPermissions, type EffectiveHostPermissions } from './host-permissions.js';
import {
  channelRoleMembershipEntrySql,
  channelRoleMembershipExitSql,
} from '../team-policy/channel-contract.js';
import {
  ALL_PERMISSIONS,
  allowsEngineAccount,
  allowsModel,
  ownerGrantedPermission,
  roleSchema,
  type HostPermission,
  type HostRole,
  type RoleModels,
  type RoleModelsInput,
  type ModelsAllowed,
  roleModelsSchema,
} from '../team-policy/permissions.js';

const roleFields = `r.role_id AS roleId, r.name, r.builtin, r.permissions_json AS permissions, r.denied_permissions_json AS denied, r.models_json AS models, r.policy_json AS policy, r.policy_revision AS policyRevision, r.revision, r.all_public_bots AS allPublicBots,
  (SELECT COUNT(*) FROM human_roles m WHERE m.role_id = r.role_id) AS memberCount`;

export function requireEngineAccountGrant(allowed: ModelsAllowed, accountId: string): void {
  if (!allowsEngineAccount(allowed, accountId))
    throw new TeamError('model-not-allowed', undefined, { route: accountId });
}

type RoleAuthority = { kind: 'owner' } | { kind: 'member'; permissions: ReadonlySet<string> };

class HostRoleConflictError extends TeamError {
  constructor() {
    super(STALE_HOST_ROLE);
  }
}

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
    const rows = this.grantRows(human, "h.status = 'active'");
    if (rows.some((row) => row.owner)) return [...ALL_PERMISSIONS];
    return resolveHostPermissions(rows.flatMap((row) => (row.grant ? [row.grant] : [])));
  }

  effective(human: HumanContext, humanId: string): EffectiveHostPermissions {
    if (human.humanId !== humanId) this.require(human, 'members.manage', 'roles.manage');
    const result = effectiveHostPermissions(this.db, humanId);
    if (!result) throw new TeamError('member-not-found');
    return result;
  }

  private grantRows(
    human: HumanContext,
    status: string,
  ): { owner: boolean; grant: RoleGrant | undefined }[] {
    return z
      .array(
        z.object({
          permissions: z.string().nullable(),
          denied: z.string().nullable(),
          owner: z.coerce.boolean(),
        }),
      )
      .parse(
        this.db.read((db) =>
          db
            .prepare(`SELECT r.permissions_json AS permissions, r.denied_permissions_json AS denied,
        s.owner_human_id = h.human_id AS owner FROM humans h CROSS JOIN team_settings s
        LEFT JOIN human_roles m ON m.human_id = h.human_id
        LEFT JOIN host_roles r ON r.role_id = m.role_id WHERE h.human_id = ? AND ${status}`)
            .all(human.humanId),
        ),
      )
      .map((row) => ({
        owner: row.owner,
        grant:
          row.permissions === null
            ? undefined
            : {
                allow: z.array(z.string()).parse(JSON.parse(row.permissions)),
                deny: z.array(z.string()).parse(JSON.parse(row.denied ?? '[]')),
              },
      }));
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
    let all = false;
    const accounts = new Set<string>();
    const providers = new Set<string>();
    const routes = new Set<string>();
    for (const row of rows) {
      if (row.models === null) continue;
      const model = roleModelsSchema.parse(JSON.parse(row.models));
      for (const id of model.engineAccounts) accounts.add(id);
      if (model.kind === 'all') {
        all = true;
        continue;
      }
      for (const provider of model.providers) providers.add(provider);
      for (const route of model.routes) routes.add(route);
    }
    const engineAccounts = [...accounts].sort();
    if (all) return { all: true, engineAccounts };
    return {
      all: false,
      engineAccounts,
      providers: [...providers].sort(),
      routes: [...routes].sort(),
    };
  }

  requireModel(human: HumanContext, route: { provider: string; model: string }): void {
    const allowed = this.modelsAllowed(human);
    if (!allowsModel(allowed, route))
      throw new TeamError('model-not-allowed', undefined, {
        route: `${route.provider}/${route.model}`,
      });
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

  botScopeTarget(human: HumanContext, roleId: string) {
    if (human.caller === 'bot') throw new TeamError('permission-required');
    this.require(human, 'roles.manage', 'members.manage');
    const role = this.role(roleId);
    if (this.isOwner(human)) return { role, canSetAll: true, canSetSelected: true };
    const permissions = this.permissions(human);
    const ownRole = this.db.read((db) =>
      db
        .prepare('SELECT 1 FROM human_roles WHERE human_id = ? AND role_id = ?')
        .get(human.humanId, roleId),
    );
    const canEditRole =
      permissions.includes('roles.manage') &&
      !ownRole &&
      role.builtin !== 'admin' &&
      [...role.permissions, ...role.denied].every((id) =>
        permissions.some((permission) => permission === id),
      );
    const canSetAll = canEditRole && this.hasAllPublicBots(human);
    return { role, canSetAll, canSetSelected: canEditRole && (!role.allPublicBots || canSetAll) };
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

  private validateDenials(grants: readonly string[], denied: string[]): HostPermission[] {
    const denials = this.validatePermissions(denied);
    const both = denials.find((id) => grants.includes(id));
    if (both !== undefined)
      throw new TeamError('permission-conflict', undefined, { permission: both });
    return denials;
  }

  private validatePermissions(permissions: string[]): HostPermission[] {
    if (permissions.some((id) => !ALL_PERMISSIONS.some((known) => known === id)))
      throw new TeamError('permission-unknown');
    return ALL_PERMISSIONS.filter((id) => permissions.includes(id));
  }

  private authority(human: HumanContext): RoleAuthority {
    const rows = this.grantRows(human, "(h.status = 'active' OR s.owner_human_id = h.human_id)");
    if (rows.some((row) => row.owner)) return { kind: 'owner' };
    return {
      kind: 'member',
      permissions: new Set(
        resolveHostPermissions(rows.flatMap((row) => (row.grant ? [row.grant] : []))),
      ),
    };
  }

  private checkModelGrant(actor: ModelsAllowed, models: RoleModels): void {
    for (const id of models.engineAccounts) requireEngineAccountGrant(actor, id);
    if (actor.all) return;
    if (models.kind === 'all')
      throw new TeamError('model-not-allowed', undefined, { route: 'all' });
    const outsideProvider = models.providers.find(
      (provider) => !actor.providers.includes(provider),
    );
    if (outsideProvider !== undefined)
      throw new TeamError('model-not-allowed', undefined, { route: `${outsideProvider}/*` });
    const outside = models.routes.find((route) => {
      const separator = route.indexOf('/');
      return !allowsModel(actor, {
        provider: route.slice(0, separator),
        model: route.slice(separator + 1),
      });
    });
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
        !authority.permissions.has(id) || (operation === 'grant' && ownerGrantedPermission(id)),
    );
    if (permission !== undefined)
      throw new TeamError('permission-not-grantable', undefined, { permission });
  }

  private hasAllPublicBots(human: HumanContext): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(
          `SELECT 1 FROM humans h WHERE h.human_id = ? AND ${allPublicBotsSql('h.human_id')}`,
        )
        .get(human.humanId),
    );
  }

  private checkBotScopeGrant(human: HumanContext, authority: RoleAuthority, role: HostRole): void {
    if (role.allPublicBots && authority.kind !== 'owner' && !this.hasAllPublicBots(human))
      throw new TeamError('permission-not-grantable', undefined, { permission: 'allPublicBots' });
  }

  create(
    human: HumanContext,
    name: string,
    permissions: string[],
    models: RoleModelsInput = { kind: 'all' },
    policy: RolePolicy = [],
    denied: string[] = [],
  ): { role: HostRole } {
    this.require(human, 'roles.manage');
    const normalized = this.name(name);
    const grants = this.validatePermissions(permissions);
    const denials = this.validateDenials(grants, denied);
    const authority = this.authority(human);
    this.checkPermissions(authority, grants, 'grant');
    this.checkPermissions(authority, denials, 'manage');
    const modelPolicy = roleModelsSchema.parse(models);
    this.checkModelGrant(
      authority.kind === 'owner' ? { all: true } : this.modelsAllowed(human),
      modelPolicy,
    );
    const items = rolePolicySchema.parse(policy);
    const id = randomUUID();
    this.db.transaction(
      (db) =>
        db
          .prepare(
            'INSERT INTO host_roles (role_id, name, builtin, permissions_json, denied_permissions_json, models_json, policy_json) VALUES (?, ?, NULL, ?, ?, ?, ?)',
          )
          .run(
            id,
            normalized,
            JSON.stringify(grants),
            JSON.stringify(denials),
            JSON.stringify(modelPolicy),
            JSON.stringify(items),
          ),
      ['team'],
    );
    this.invalidate();
    return { role: this.role(id) };
  }

  update(
    human: HumanContext,
    roleId: string,
    patch: {
      expectedRevision?: number;
      name?: string;
      permissions?: string[];
      denied?: string[];
      models?: RoleModelsInput;
      policy?: RolePolicy;
    },
  ): { role: HostRole } {
    this.require(human, 'roles.manage');
    const role = this.role(roleId);
    const authority = this.authority(human);
    this.checkPermissions(authority, role.permissions, 'manage');
    this.checkPermissions(authority, role.denied, 'manage');
    const expectedRevision = patch.expectedRevision ?? role.revision;
    if (role.revision !== expectedRevision) throw new HostRoleConflictError();
    const policy = patch.policy === undefined ? role.policy : rolePolicySchema.parse(patch.policy);
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
    const ownerGrant = role.builtin === 'admin' ? grants.find(ownerGrantedPermission) : undefined;
    if (ownerGrant !== undefined)
      throw new TeamError('permission-not-grantable', undefined, { permission: ownerGrant });
    this.checkPermissions(authority, grants, 'grant');
    const denials =
      patch.denied === undefined && patch.permissions === undefined
        ? role.denied
        : this.validateDenials(
            grants,
            patch.denied ?? role.denied.filter((id) => !grants.includes(id)),
          );
    this.checkPermissions(authority, denials, 'manage');
    this.db.transaction(
      (db) => {
        const { changes } = db
          .prepare(
            'UPDATE host_roles SET name = ?, permissions_json = ?, denied_permissions_json = ?, models_json = ?, policy_json = ?, policy_revision = policy_revision + ?, revision = revision + 1 WHERE role_id = ? AND revision = ?',
          )
          .run(
            name,
            JSON.stringify(grants),
            JSON.stringify(denials),
            JSON.stringify(models),
            JSON.stringify(policy),
            Number(JSON.stringify(policy) !== JSON.stringify(role.policy)),
            roleId,
            expectedRevision,
          );
        if (!changes) throw new HostRoleConflictError();
      },
      ['team'],
    );
    this.invalidate(
      role.permissions.some((permission) => !grants.includes(permission)) ||
        denials.some((permission) => !role.denied.includes(permission)),
    );
    return { role: this.role(roleId) };
  }

  delete(human: HumanContext, roleId: string): null {
    this.require(human, 'roles.manage');
    const role = this.role(roleId);
    const authority = this.authority(human);
    this.checkPermissions(authority, role.permissions, 'manage');
    this.checkPermissions(authority, role.denied, 'manage');
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
      this.checkBotScopeGrant(human, authority, fallback);
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
        const at = new Date().toISOString();
        db.prepare(channelRoleMembershipExitSql('all')).run(at);
        db.prepare(channelRoleMembershipEntrySql('all')).run(at);
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
      this.checkBotScopeGrant(human, authority, role);
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
        const at = new Date().toISOString();
        db.prepare(channelRoleMembershipExitSql('human')).run(at, humanId);
        db.prepare(channelRoleMembershipEntrySql('human')).run(at, humanId);
      },
      ['team'],
    );
    this.invalidate(previous.some((row) => !ids.includes(row.role_id)));
    return null;
  }
}
