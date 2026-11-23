import { z } from 'zod';
import { OperationalDatabaseError } from '../database/owner.js';
import type { HumanContext } from '../humans/context.js';
import { accountSpaceFiles, prepareSpaceTransfer } from '../workspaces/space-lifecycle.js';
import { channelRoleMembershipEntrySql } from './channel-contract.js';
import { TeamError } from './error.js';
import type { TeamMember, TeamService } from './service.js';

export type MemberLifecycleHost = {
  accessChanged: TeamService['accessChanged'];
  assertRevocationAvailable: TeamService['assertRevocationAvailable'];
  db: TeamService['db'];
  disposePeers: TeamService['disposePeers'];
  invalidate: TeamService['invalidate'];
  isOwner: TeamService['isOwner'];
  log: TeamService['log'];
  manageTarget: TeamService['manageTarget'];
  member: TeamService['member'];
  now: TeamService['now'];
  ownedBots: TeamService['ownedBots'];
  owner: TeamService['owner'];
  pairedIds: TeamService['pairedIds'];
  pairing: TeamService['pairing'];
  privateAccess: TeamService['privateAccess'];
  purge: TeamService['purge'];
  purgeTarget: TeamService['purgeTarget'];
  revokeMember: TeamService['revokeMember'];
  roles: TeamService['roles'];
  settings: TeamService['settings'];
  settleBotPreparations: TeamService['settleBotPreparations'];
  spaceProvider: TeamService['spaceProvider'];
  spaces: TeamService['spaces'];
  stopBots: TeamService['stopBots'];
  transferPreview: TeamService['transferPreview'];
};

export async function suspend(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
): Promise<void> {
  this.owner(human);
  if (humanId === human.humanId) throw new TeamError('forbidden');
  this.db.transaction(
    (db) => {
      db.prepare(`UPDATE humans SET status = 'suspended' WHERE human_id = ?`).run(humanId);
      db.prepare(
        'UPDATE member_grants SET revoked_at = ? WHERE human_id = ? AND revoked_at IS NULL',
      ).run(new Date(this.now()).toISOString(), humanId);
    },
    ['team'],
  );
  this.invalidate();
  await this.disposePeers(humanId);
}
export function pairedIds(
  this: MemberLifecycleHost,
  humanId: string,
  keepGrant?: string,
): string[] {
  return this.db
    .read((db) =>
      db
        .prepare(`SELECT device_id FROM paired_devices
      WHERE human_id = ? AND revoked_at IS NULL AND device_id <> ?`)
        .all(humanId, keepGrant ?? ''),
    )
    .map((row) => String(row.device_id));
}
export function assertRevocationAvailable(
  this: MemberLifecycleHost,
  members: readonly TeamMember[],
  keepGrant?: string,
): void {
  if (!this.pairing && members.some((member) => this.pairedIds(member.humanId, keepGrant).length))
    throw new TeamError('unavailable');
}
export async function revokeMember(
  this: MemberLifecycleHost,
  humanId: string,
  keepGrant?: string,
): Promise<void> {
  const ids = this.pairedIds(humanId, keepGrant);
  if (ids.length && !this.pairing) throw new TeamError('unavailable');
  this.db.transaction(
    (db) =>
      db
        .prepare(`UPDATE member_grants SET revoked_at = ?
      WHERE human_id = ? AND revoked_at IS NULL AND grant_id <> ?`)
        .run(new Date(this.now()).toISOString(), humanId, keepGrant ?? ''),
    ['team'],
  );
  for (const id of ids) this.pairing?.revoke(id);
  this.invalidate();
  await this.disposePeers(humanId, keepGrant);
}
export async function deactivate(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
): Promise<null> {
  const member = this.manageTarget(human, humanId);
  this.assertRevocationAvailable([member]);
  this.db.transaction(
    (db) => {
      db.prepare("UPDATE humans SET status = 'deactivated' WHERE human_id = ?").run(humanId);
      db.prepare('DELETE FROM team_mode_suspensions WHERE human_id = ?').run(humanId);
    },
    ['team'],
  );
  await this.revokeMember(humanId);
  await this.settleBotPreparations?.(humanId);
  await this.stopBots?.(this.ownedBots(humanId).map((bot) => bot.slug));
  this.log('member-deactivated', { initiator: human.humanId, humanId });
  return null;
}
export async function reactivate(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
): Promise<null> {
  const member = this.manageTarget(human, humanId);
  if (!this.settings().enabled) throw new TeamError('team-mode-off');
  this.assertRevocationAvailable([member]);
  await this.revokeMember(humanId);
  this.manageTarget(human, humanId);
  if (!this.settings().enabled) throw new TeamError('team-mode-off');
  this.db.transaction(
    (db) => {
      db.prepare("UPDATE humans SET status = 'active' WHERE human_id = ?").run(humanId);
      db.prepare('DELETE FROM team_mode_suspensions WHERE human_id = ?').run(humanId);
      db.prepare(channelRoleMembershipEntrySql('human')).run(
        new Date(this.now()).toISOString(),
        humanId,
      );
    },
    ['team'],
  );
  this.invalidate();
  return null;
}
export function ownedBots(this: MemberLifecycleHost, humanId: string, transferable = false) {
  return z.array(z.object({ slug: z.string(), displayName: z.string() })).parse(
    this.db.read((db) =>
      db
        .prepare(`SELECT b.slug, json_extract(b.body, '$.displayName') AS displayName FROM persona_bots b
        WHERE b.owner_human_id = ?
        ${transferable ? 'AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug) AND NOT EXISTS (SELECT 1 FROM tob_identity t JOIN team_settings s ON s.owner_human_id = t.human_id WHERE t.bot_slug = b.slug)' : ''}
        ORDER BY b.slug`)
        .all(humanId),
    ),
  );
}
export function transferPreview(this: MemberLifecycleHost, human: HumanContext, humanId: string) {
  this.manageTarget(human, humanId);
  const channels = z.array(z.object({ channelId: z.string(), name: z.string() })).parse(
    this.db.read((db) =>
      db
        .prepare(`SELECT channel_id AS channelId,
        json_extract(record_json, '$.name') AS name FROM channel_records
        WHERE json_extract(record_json, '$.type') = 'group'
        AND owner_human_id = ?
        ORDER BY channel_id`)
        .all(humanId),
    ),
  );
  const bots = this.ownedBots(humanId, true);
  return {
    channels,
    bots,
    ...(this.spaceProvider
      ? {
          space: {
            spaceId: 'spaces/' + humanId,
            files: accountSpaceFiles(this.spaces.home, humanId),
            memories: bots.map((bot) => ({ slug: bot.slug })),
          },
        }
      : {}),
  };
}
export async function transfer(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
  toHumanId: string,
): Promise<null> {
  if (human.caller === 'bot')
    throw new TeamError('permission-required', undefined, { permission: 'members.manage' });
  this.manageTarget(human, humanId);
  const target = this.member(toHumanId);
  if (!target) throw new TeamError('member-not-found');
  if (target.humanId === humanId || (!target.owner && target.status !== 'active'))
    throw new TeamError('transfer-target-invalid');
  this.manageTarget(human, humanId);
  if (!this.isOwner(human)) this.roles.requireManagementTarget(human, toHumanId);
  const currentTarget = this.member(toHumanId);
  if (!currentTarget || (!currentTarget.owner && currentTarget.status !== 'active'))
    throw new TeamError('transfer-target-invalid');
  const preview = this.transferPreview(human, humanId);
  if (this.spaceProvider) {
    this.spaces.ensureAccount(humanId);
    this.spaces.ensureAccount(toHumanId);
  }
  const spaceTransfer = this.spaceProvider
    ? prepareSpaceTransfer(
        this.db,
        this.spaces.home,
        humanId,
        toHumanId,
        preview.bots.map((bot) => bot.slug),
      )
    : undefined;
  const transferred = JSON.stringify(preview.channels.map((channel) => channel.channelId));
  try {
    this.db.transaction(
      (db) => {
        for (const bot of preview.bots)
          this.privateAccess.recordBotAction(
            human,
            { ...bot, ownerHumanId: humanId },
            'transfer',
            db,
          );
        spaceTransfer?.commit(db);
        db.prepare(`UPDATE channel_records SET record_json = json_set(record_json, '$.dmHumanId', ?)
          WHERE json_extract(record_json, '$.type') = 'dm'
            AND json_extract(record_json, '$.dmHumanId') IS NULL
            AND json_extract(record_json, '$.botSlug') IN (
              SELECT slug FROM persona_bots WHERE owner_human_id = ?
                AND slug IN (SELECT value FROM json_each(?)))`).run(
          humanId,
          humanId,
          JSON.stringify(preview.bots.map((bot) => bot.slug)),
        );
        db.prepare(`UPDATE persona_bots SET owner_human_id = ?, body = json_set(body, '$.ownerHumanId', ?)
          WHERE slug IN (SELECT value FROM json_each(?)) AND owner_human_id = ?`).run(
          toHumanId,
          toHumanId,
          JSON.stringify(preview.bots.map((bot) => bot.slug)),
          humanId,
        );
        db.prepare(`UPDATE channel_records SET owner_human_id = ?, record_json = json_set(record_json, '$.ownerHumanId', ?)
        WHERE json_extract(record_json, '$.type') = 'group'
        AND owner_human_id = ?`).run(toHumanId, toHumanId, humanId);
        db.prepare(`INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
        SELECT channel_id, ?, ?, 1, ? FROM channel_records
        WHERE channel_id IN (SELECT value FROM json_each(?))
          OR (json_extract(record_json, '$.type') = 'group' AND EXISTS
            (SELECT 1 FROM json_each(record_json, '$.members') m
              WHERE m.value IN (SELECT value FROM json_each(?))))
        ON CONFLICT(channel_id, human_id) DO UPDATE SET left_at = NULL, membership_basis = 'invited'`).run(
          toHumanId,
          target.displayName,
          new Date(this.now()).toISOString(),
          transferred,
          JSON.stringify(preview.bots.map((bot) => bot.slug)),
        );
      },
      [
        'team',
        'channel',
        'bot-registry',
        'bot-ownership',
        'workspace-spaces',
        'workspace-grants',
        'private-audit',
      ],
    );
  } catch (error) {
    if (error instanceof OperationalDatabaseError && error.code === 'post-commit-interrupted') {
      await Promise.allSettled([
        Promise.resolve().then(() => this.pairing?.closeStreams?.()),
        this.disposePeers(),
        Promise.resolve().then(() => this.stopBots?.(preview.bots.map((bot) => bot.slug))),
      ]);
    } else {
      spaceTransfer?.rollback();
      if (error instanceof OperationalDatabaseError && error.cause instanceof TeamError)
        throw error.cause;
    }
    throw error;
  }
  try {
    this.accessChanged(true);
    await this.stopBots?.(preview.bots.map((bot) => bot.slug));
  } catch (error) {
    try {
      spaceTransfer?.finish();
    } catch {}
    throw error;
  }
  spaceTransfer?.finish();
  return null;
}
export function purgeTarget(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
): TeamMember {
  const member = this.manageTarget(human, humanId);
  if (member.status !== 'deactivated') throw new TeamError('member-active');
  const owned = this.transferPreview(human, humanId);
  if (owned.channels.length) throw new TeamError('transfer-required');
  if (!this.purge) throw new TeamError('unavailable');
  return member;
}
export function purgePreview(this: MemberLifecycleHost, human: HumanContext, humanId: string) {
  this.purgeTarget(human, humanId);
  return this.purge!.memberPreview(human, humanId);
}
export async function purgeConfirm(
  this: MemberLifecycleHost,
  human: HumanContext,
  humanId: string,
  token: string,
  username: string,
): Promise<null> {
  if (human.caller === 'bot')
    throw new TeamError('permission-required', undefined, { permission: 'members.manage' });
  const checkTarget = () => {
    this.roles.requireManagementTarget(human, humanId);
    if (
      !this.member(humanId) &&
      this.db.read((db) =>
        db.prepare('SELECT 1 FROM deleted_humans WHERE human_id = ?').get(humanId),
      )
    )
      throw new TeamError('purge-token-invalid');
    const member = this.purgeTarget(human, humanId);
    if (username !== member.username) throw new TeamError('purge-token-invalid');
  };
  checkTarget();
  for (const bot of this.ownedBots(humanId))
    this.privateAccess.recordBotAction(
      human,
      { ...bot, ownerHumanId: humanId },
      'memberPurgeConfirm',
    );
  await this.settleBotPreparations?.(humanId);
  checkTarget();
  this.purge!.memberConfirm(human, humanId, token);
  await this.purge!.memberSettled(humanId);
  this.invalidate();
  this.log('member-purged', { initiator: human.humanId, humanId });
  return null;
}
