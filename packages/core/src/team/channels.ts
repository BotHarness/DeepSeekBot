import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import type { ChannelStore } from '../channels/store.js';
import type { TeamRoles } from './roles.js';
import { TeamError } from './error.js';
import {
  channelPolicySchema,
  channelBotDmEligibleSql,
  channelRoleEligibleSql,
  channelVisibilitySchema,
  type ChannelPolicy,
  type ChannelVisibility,
} from './channel-contract.js';

const settingsSchema = z.object({
  owner: z.string(),
  visibility: z.string().transform((v) => channelVisibilitySchema.parse(JSON.parse(v))),
  policy: z.string().transform((v) => channelPolicySchema.parse(JSON.parse(v))),
});
const policyRevision = (policy: ChannelPolicy): string =>
  createHash('sha256')
    .update(JSON.stringify(channelPolicySchema.parse(policy)))
    .digest('hex');

export class TeamChannels {
  constructor(
    private readonly db: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    private readonly roles: TeamRoles,
    private readonly changed: (revoke?: boolean) => void,
  ) {}

  private active(human: HumanContext): boolean {
    return !!this.db.read((db) =>
      db
        .prepare("SELECT 1 FROM humans WHERE human_id = ? AND status = 'active'")
        .get(human.humanId),
    );
  }
  private settings(channelId: string) {
    const row = this.db.read((db) =>
      db
        .prepare(
          `SELECT owner_human_id AS owner, visibility_json AS visibility, policy_json AS policy FROM channel_records WHERE channel_id = ? AND json_extract(record_json, '$.type') = 'group' AND json_extract(record_json, '$.deletedAt') IS NULL`,
        )
        .get(channelId),
    );
    if (!row) throw new TeamError('channel-not-found');
    return settingsSchema.parse(row);
  }
  private qualifies(human: HumanContext, channelId: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`SELECT 1 FROM channel_records c
      JOIN humans h ON h.human_id = ? WHERE c.channel_id = ?
      AND ${channelRoleEligibleSql('c', 'h.human_id')}`)
        .get(human.humanId, channelId),
    );
  }
  private joined(human: HumanContext, channelId: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(
          'SELECT 1 FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
        )
        .get(channelId, human.humanId),
    );
  }
  private audience(joinedOnly: boolean, includeDeleted = false): string {
    return `h.status = 'active' ${includeDeleted ? '' : "AND json_extract(c.record_json, '$.deletedAt') IS NULL"} AND (
      (json_extract(c.record_json, '$.type') = 'dm' AND (
        (json_extract(c.record_json, '$.humanParticipants') IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(c.record_json, '$.humanParticipants') p WHERE p.value = h.human_id))
        OR (json_extract(c.record_json, '$.humanParticipants') IS NULL AND ${channelBotDmEligibleSql('c', 'h.human_id')})))
      OR (json_extract(c.record_json, '$.type') = 'group'
        AND (m.human_id IS NOT NULL ${joinedOnly ? '' : "OR json_extract(c.visibility_json, '$.kind') IN ('public','roles')"})
        AND ${channelRoleEligibleSql('c', 'h.human_id')}))`;
  }
  private accessQuery(joinedOnly: boolean, includeDeleted = false): string {
    return `SELECT c.channel_id FROM channel_records c CROSS JOIN team_settings s JOIN humans h ON h.human_id = ?
      LEFT JOIN channel_human_members m ON m.channel_id = c.channel_id AND m.human_id = h.human_id AND m.left_at IS NULL
      WHERE ${this.audience(joinedOnly, includeDeleted)}`;
  }
  visibleIds(human: HumanContext, joinedOnly = true): Set<string> {
    return new Set(
      z
        .array(z.object({ channel_id: z.string() }))
        .parse(this.db.read((db) => db.prepare(this.accessQuery(joinedOnly)).all(human.humanId)))
        .map((row) => row.channel_id),
    );
  }
  canKnow(human: HumanContext, channelId: string): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`${this.accessQuery(true, true)} AND c.channel_id = ?`)
        .get(human.humanId, channelId),
    );
  }
  canRead(human: HumanContext, channelId: string, joinedOnly = false): boolean {
    return !!this.db.read((db) =>
      db
        .prepare(`${this.accessQuery(joinedOnly)} AND c.channel_id = ?`)
        .get(human.humanId, channelId),
    );
  }
  role(human: HumanContext, channelId: string): 'owner' | 'admin' | 'member' {
    const settings = this.settings(channelId);
    if (settings.owner === human.humanId) return 'owner';
    return this.db.read((db) =>
      db
        .prepare('SELECT 1 FROM channel_admins WHERE channel_id = ? AND human_id = ?')
        .get(channelId, human.humanId),
    )
      ? 'admin'
      : 'member';
  }
  requireManage(human: HumanContext, channelId: string): void {
    if (!this.active(human)) throw new TeamError('permission-required');
    this.settings(channelId);
    if (this.roles.permissions(human).includes('channels.manageAll')) return;
    if (!this.canRead(human, channelId, true)) throw new TeamError('channel-not-found');
    if (this.role(human, channelId) === 'member') throw new TeamError('permission-required');
  }
  requirePolicy(human: HumanContext, channelId: string, key: keyof ChannelPolicy): void {
    if (!this.canRead(human, channelId, true)) throw new TeamError('channel-not-found');
    const channel = this.channels.get(channelId);
    if (channel?.type !== 'group') {
      if (key === 'post') return;
      throw new TeamError('channel-not-found');
    }
    if (
      this.roles.permissions(human).includes('channels.manageAll') ||
      this.settings(channelId).policy[key] === 'everyone' ||
      this.role(human, channelId) !== 'member'
    )
      return;
    throw new TeamError(
      key === 'post'
        ? 'channel-post-restricted'
        : key === 'mentionAll'
          ? 'channel-mention-restricted'
          : 'permission-required',
      undefined,
      { permission: key },
    );
  }
  view(human: HumanContext, channelId: string) {
    if (!this.canRead(human, channelId)) throw new TeamError('channel-not-found');
    const settings = this.settings(channelId);
    const admins = z
      .array(z.object({ humanId: z.string(), displayName: z.string() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(
              `SELECT h.human_id AS humanId, h.display_name AS displayName FROM channel_admins a JOIN humans h USING(human_id) WHERE a.channel_id = ? ORDER BY h.human_id`,
            )
            .all(channelId),
        ),
      );
    return {
      role: this.role(human, channelId),
      policy: settings.policy,
      policyRevision: policyRevision(settings.policy),
      visibility: settings.visibility,
      admins,
    };
  }
  visibilitySet(human: HumanContext, channelId: string, visibility: ChannelVisibility): null {
    this.requireManage(human, channelId);
    if (visibility.kind === 'roles')
      for (const roleId of visibility.roleIds) {
        if (
          !this.db.read((db) =>
            db.prepare('SELECT 1 FROM host_roles WHERE role_id = ?').get(roleId),
          )
        )
          throw new TeamError('role-not-found');
      }
    if (JSON.stringify(this.settings(channelId).visibility) === JSON.stringify(visibility))
      return null;
    this.db.transaction(
      (db) =>
        db
          .prepare(
            'UPDATE channel_records SET visibility_json = ?, public = ? WHERE channel_id = ?',
          )
          .run(JSON.stringify(visibility), Number(visibility.kind === 'public'), channelId),
      ['channels', 'team'],
    );
    this.changed(true);
    return null;
  }
  private memberId(reference: string): string {
    const row = this.db.read((db) =>
      db
        .prepare(`SELECT human_id FROM (
      SELECT human_id, 0 AS priority FROM humans WHERE human_id = ?
      UNION ALL SELECT human_id, 1 AS priority FROM member_credentials WHERE username = ?
      ) ORDER BY priority LIMIT 1`)
        .get(reference, reference.toLowerCase()),
    );
    if (!row) throw new TeamError('member-not-found');
    return z.object({ human_id: z.string() }).parse(row).human_id;
  }
  adminsSet(human: HumanContext, channelId: string, references: string[]): null {
    this.settings(channelId);
    if (!this.canRead(human, channelId, true)) throw new TeamError('channel-not-found');
    if (!this.active(human) || this.role(human, channelId) !== 'owner')
      throw new TeamError('permission-required', undefined, { permission: 'owner' });
    const humanIds = references.map((reference) => this.memberId(reference));
    const ceiling = new Set(this.roles.permissions(human));
    const previous = z
      .array(z.object({ human_id: z.string() }))
      .parse(
        this.db.read((db) =>
          db.prepare('SELECT human_id FROM channel_admins WHERE channel_id = ?').all(channelId),
        ),
      );
    for (const id of humanIds) {
      if (!this.active(humanContext(id)) || !this.joined(humanContext(id), channelId))
        throw new TeamError('member-not-found');
    }
    for (const id of new Set([...humanIds, ...previous.map((row) => row.human_id)])) {
      if (
        !this.roles.isOwner(human) &&
        (this.roles.isOwner(humanContext(id)) ||
          this.roles.permissions(humanContext(id)).some((permission) => !ceiling.has(permission)))
      )
        throw new TeamError('permission-required');
    }
    this.db.transaction(
      (db) => {
        db.prepare('DELETE FROM channel_admins WHERE channel_id = ?').run(channelId);
        for (const id of new Set(humanIds))
          if (id !== human.humanId)
            db.prepare('INSERT INTO channel_admins VALUES (?, ?)').run(channelId, id);
      },
      ['channels', 'team'],
    );
    this.changed(true);
    return null;
  }
  policySet(
    human: HumanContext,
    channelId: string,
    policy: ChannelPolicy,
    expectedRevision?: string,
  ): null {
    this.requireManage(human, channelId);
    const updated = this.db.transaction(
      (db) => {
        if (
          expectedRevision !== undefined &&
          expectedRevision !== policyRevision(this.settings(channelId).policy)
        )
          return false;
        db.prepare('UPDATE channel_records SET policy_json = ? WHERE channel_id = ?').run(
          JSON.stringify(policy),
          channelId,
        );
        return true;
      },
      ['channels', 'team'],
    );
    if (!updated) throw new TeamError('stale-channel-policy');
    this.changed(true);
    return null;
  }
  browse(human: HumanContext) {
    return z
      .array(
        z.object({
          channelId: z.string(),
          name: z.string(),
          description: z
            .string()
            .nullable()
            .transform((v) => v ?? undefined),
          memberCount: z.number(),
          joined: z.coerce.boolean(),
          visibility: z.enum(['public', 'roles']),
        }),
      )
      .parse(
        this.db.read((db) =>
          db
            .prepare(`WITH viewer AS (SELECT human_id FROM humans WHERE human_id = ? AND status = 'active')
      SELECT c.channel_id AS channelId, json_extract(c.record_json, '$.name') AS name, json_extract(c.record_json, '$.description') AS description,
      COALESCE(json_array_length(c.record_json, '$.members'),0) + (SELECT COUNT(*) FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.left_at IS NULL) AS memberCount,
      EXISTS(SELECT 1 FROM channel_human_members m WHERE m.channel_id = c.channel_id AND m.human_id = h.human_id AND m.left_at IS NULL) AS joined,
      json_extract(c.visibility_json, '$.kind') AS visibility
      FROM channel_records c CROSS JOIN viewer h WHERE json_extract(c.record_json, '$.type') = 'group' AND json_extract(c.record_json, '$.deletedAt') IS NULL
      AND json_extract(c.visibility_json, '$.kind') IN ('public','roles')
      AND ${channelRoleEligibleSql('c', 'h.human_id')} ORDER BY c.channel_id`)
            .all(human.humanId),
        ),
      );
  }
  join(human: HumanContext, channelId: string): null {
    if (!this.browse(human).some((c) => c.channelId === channelId))
      throw new TeamError('channel-not-found');
    this.db.transaction(
      (db) =>
        db
          .prepare(
            `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at) SELECT ?, human_id, display_name, 1, ? FROM humans WHERE human_id = ? AND status = 'active' ON CONFLICT(channel_id,human_id) DO UPDATE SET left_at = NULL`,
          )
          .run(channelId, new Date().toISOString(), human.humanId),
      ['channels', 'team'],
    );
    this.changed();
    return null;
  }
  addMember(human: HumanContext, channelId: string, reference: string): null {
    this.requirePolicy(human, channelId, 'addMembers');
    const humanId = this.memberId(reference);
    if (!this.active(humanContext(humanId))) throw new TeamError('member-not-found');
    if (!this.qualifies(humanContext(humanId), channelId))
      throw new TeamError('permission-required', undefined, { permission: 'addMembers' });
    const ceiling = new Set(this.roles.permissions(human));
    if (
      !this.roles.isOwner(human) &&
      (this.roles.isOwner(humanContext(humanId)) ||
        this.roles.permissions(humanContext(humanId)).some((p) => !ceiling.has(p)))
    )
      throw new TeamError('permission-required', undefined, { permission: 'addMembers' });
    this.db.transaction(
      (db) =>
        db
          .prepare(
            `INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at) SELECT ?,human_id,display_name,1,? FROM humans WHERE human_id = ? ON CONFLICT(channel_id,human_id) DO UPDATE SET left_at = NULL`,
          )
          .run(channelId, new Date().toISOString(), humanId),
      ['channels', 'team'],
    );
    this.changed();
    return null;
  }
  descriptionSet(human: HumanContext, channelId: string, description: string): null {
    this.requirePolicy(human, channelId, 'editDetails');
    this.db.transaction(
      (db) =>
        db
          .prepare(
            "UPDATE channel_records SET record_json = json_set(record_json, '$.description', ?) WHERE channel_id = ?",
          )
          .run(description, channelId),
      ['channels', 'team'],
    );
    this.changed();
    return null;
  }
  roleDirectory(human: HumanContext, channelId: string) {
    this.requireManage(human, channelId);
    return z
      .array(z.object({ roleId: z.string(), name: z.string() }))
      .parse(
        this.db.read((db) =>
          db.prepare('SELECT role_id AS roleId, name FROM host_roles ORDER BY role_id').all(),
        ),
      );
  }
  directory(human: HumanContext) {
    this.roles.require(human, 'dm.humans');
    return z
      .array(z.object({ humanId: z.string(), displayName: z.string() }))
      .parse(
        this.db.read((db) =>
          db
            .prepare(
              "SELECT human_id AS humanId, display_name AS displayName FROM humans WHERE status = 'active' AND human_id <> ? ORDER BY human_id",
            )
            .all(human.humanId),
        ),
      );
  }
  dm(human: HumanContext, humanId: string) {
    this.roles.require(human, 'dm.humans');
    if (!this.active(human) || human.humanId === humanId || !this.active(humanContext(humanId)))
      throw new TeamError('member-not-found');
    const participants = [human.humanId, humanId].sort();
    const id = `dm-humans-${createHash('sha256').update(JSON.stringify(participants)).digest('hex').slice(0, 32)}`;
    if (!this.channels.getOrCreateHumanDm) throw new TeamError('unavailable');
    const target = z
      .object({ displayName: z.string() })
      .parse(
        this.db.read((db) =>
          db
            .prepare('SELECT display_name AS displayName FROM humans WHERE human_id = ?')
            .get(humanId),
        ),
      );
    return {
      channel: {
        ...this.channels.getOrCreateHumanDm(human, id, participants),
        name: target.displayName,
      },
    };
  }
}
