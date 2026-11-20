import { createHash } from 'node:crypto';
import { TeamError } from '../team/error.js';
import type { HumanContext } from '../humans/context.js';
import type { DatabaseSync } from 'node:sqlite';
import { isValidSlug } from '../bots/slug.js';
import {
  botDmChannelId,
  remoteBotDmRecord,
  isBotNetworkMembership,
  mergeBotNetworkMembership,
  dmChannelId,
  isBotDmChannel,
  groupChannelIdBase,
  isChannelRecord,
  isGroupAvatar,
  isValidChannelId,
  type ChannelRecord,
} from './channel.js';
import type { ChannelStore } from './store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SqliteChannelStoreOptions, SqliteChannelAccess } from './sqlite-store.types.js';

export function parseRecord(value: string, id: string): ChannelRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isChannelRecord(parsed, id) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function createChannelRecords({
  database,
  options,
  now,
  isBotActive,
  humanAccess,
}: {
  database: OperationalDatabaseModulePort;
  options: SqliteChannelStoreOptions;
  now: () => Date;
  isBotActive: (slug: string) => boolean;
  humanAccess: SqliteChannelAccess;
}) {
  const readRecord = (id: string): ChannelRecord | undefined => {
    if (!isValidChannelId(id)) return undefined;
    const row = database.read((db) =>
      db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(id),
    ) as { record_json: string } | undefined;
    if (row === undefined) return undefined;
    const record = parseRecord(row.record_json, id);
    return record?.deletedAt === undefined ? record : undefined;
  };

  const publishRecordChanged = (): void => {
    try {
      options.onRecordChanged?.();
    } catch (error) {
      options.warn?.('Channel record notification failed: ' + String(error));
    }
  };

  const remoteHostKey = (db: DatabaseSync, host: string): string | undefined => {
    const rows = db
      .prepare(`SELECT DISTINCT json_extract(record_json, '$.remoteBot.hostKey') AS host_key
      FROM channel_records WHERE json_extract(record_json, '$.remoteBot.hostId') = ?
      AND json_extract(record_json, '$.remoteBot.hostKey') IS NOT NULL`)
      .all(host);
    if (rows.length > 1) throw new Error('network-host-key-conflict');
    const key = rows[0]?.host_key;
    if (key !== undefined && (typeof key !== 'string' || !/^[0-9a-f]{64}$/u.test(key)))
      throw new Error('network-host-key-invalid');
    return key;
  };

  const assertHostKey = (db: DatabaseSync, host: string, key: string): void => {
    if (!/^[0-9a-f]{64}$/u.test(key)) throw new Error('network-host-key-invalid');
    const known = remoteHostKey(db, host);
    if (known !== undefined && known !== key) throw new Error('network-host-key-conflict');
  };

  let channelAccessSchemaReady = false;

  const hasChannelAccessSchema = (): boolean => {
    if (!channelAccessSchemaReady)
      channelAccessSchemaReady = database.read((db) =>
        db
          .prepare('PRAGMA table_info(channel_records)')
          .all()
          .some((column) => column.name === 'owner_human_id'),
      );
    return channelAccessSchemaReady;
  };

  const humanBotDm = (slug: string, humanId?: string): ChannelRecord | undefined => {
    if (!hasChannelAccessSchema()) return readRecord(dmChannelId(slug));
    const row = database.read((db) =>
      db
        .prepare(`SELECT c.channel_id,c.record_json FROM channel_records c JOIN persona_bots b
      ON b.slug=json_extract(c.record_json,'$.botSlug') WHERE json_extract(c.record_json,'$.type')='dm'
      AND json_extract(c.record_json,'$.botSlug') IS NOT NULL AND b.slug=?
      AND json_extract(c.record_json,'$.deletedAt') IS NULL
      AND coalesce(json_extract(c.record_json,'$.dmHumanId'),b.owner_human_id)=coalesce(?,b.owner_human_id)
      ORDER BY c.channel_id LIMIT 1`)
        .get(slug, humanId ?? null),
    );
    return typeof row?.['channel_id'] === 'string' && typeof row['record_json'] === 'string'
      ? parseRecord(row['record_json'], row['channel_id'])
      : undefined;
  };

  const writeRecord = (human: HumanContext, record: ChannelRecord): void => {
    database.transaction(
      (db) => {
        if (hasChannelAccessSchema())
          db.prepare(`INSERT INTO channel_records (channel_id, record_json, owner_human_id) VALUES (?, ?, ?)
          ON CONFLICT(channel_id) DO UPDATE SET record_json = excluded.record_json`).run(
            record.id,
            JSON.stringify(record),
            record.ownerHumanId ?? human.humanId,
          );
        else
          db.prepare(`INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)
          ON CONFLICT(channel_id) DO UPDATE SET record_json = excluded.record_json`).run(
            record.id,
            JSON.stringify(record),
          );
        if (record.type === 'group')
          db.prepare(`
            INSERT OR IGNORE INTO channel_human_members
              (channel_id, human_id, display_name, visible_from_revision, joined_at)
            VALUES (?, ?, 'Human', 1, ?)
          `).run(record.id, human.humanId, record.createdAt);
      },
      ['channel'],
    );
    publishRecordChanged();
  };

  const methods = {
    getOrCreateHumanDm(human, id, participants) {
      if (!hasChannelAccessSchema()) throw new TeamError('unavailable');
      const existing = readRecord(id);
      if (existing) return existing;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: '',
        members: [],
        humanParticipants: participants,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      database.transaction(
        (db) => {
          db.prepare(
            'INSERT INTO channel_records(channel_id,record_json,owner_human_id) VALUES (?, ?, ?)',
          ).run(id, JSON.stringify(record), human.humanId);
          for (const participant of participants)
            db.prepare(
              `INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at) SELECT ?,human_id,display_name,1,? FROM humans WHERE human_id = ?`,
            ).run(id, timestamp, participant);
        },
        ['channels'],
      );
      publishRecordChanged();
      return record;
    },
    get: readRecord,
    list() {
      const rows = database.read((db) =>
        db.prepare('SELECT channel_id, record_json FROM channel_records').all(),
      ) as unknown as Array<{ channel_id: string; record_json: string }>;
      return rows
        .flatMap((row) => {
          const record = parseRecord(row.record_json, row.channel_id);
          return record === undefined || record.deletedAt !== undefined ? [] : [record];
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    getOrCreateDm(human: HumanContext, botSlug, botName) {
      if (!isValidSlug(botSlug)) return undefined;
      const paired = humanBotDm(botSlug, human.humanId);
      if (paired) return paired;
      const legacyRecord = readRecord(dmChannelId(botSlug));
      const legacy =
        legacyRecord?.type === 'dm' && legacyRecord.botSlug === botSlug ? legacyRecord : undefined;
      const bot = hasChannelAccessSchema()
        ? database.read((db) =>
            db.prepare('SELECT owner_human_id FROM persona_bots WHERE slug = ?').get(botSlug),
          )
        : undefined;
      const participant =
        typeof bot?.['owner_human_id'] === 'string' &&
        (bot['owner_human_id'] !== human.humanId ||
          (legacy?.dmHumanId !== undefined && legacy.dmHumanId !== human.humanId));
      const base = participant
        ? `dm-member-${createHash('sha256')
            .update(JSON.stringify([human.humanId, botSlug]))
            .digest('hex')
            .slice(0, 32)}`
        : dmChannelId(botSlug);
      const ownsRecord = (record: ChannelRecord): boolean =>
        record.type === 'dm' &&
        record.botSlug === botSlug &&
        (participant
          ? record.dmHumanId === human.humanId
          : record.dmHumanId === undefined || record.dmHumanId === human.humanId);
      let id = base;
      for (let attempt = 2; ; attempt += 1) {
        const existing = readRecord(id);
        if (existing !== undefined && ownsRecord(existing)) return existing;
        if (existing === undefined) {
          const row = database.read((db) =>
            db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(id),
          ) as { record_json: string } | undefined;
          const tombstone = row === undefined ? undefined : parseRecord(row.record_json, id);
          if (row === undefined || (tombstone !== undefined && ownsRecord(tombstone))) break;
        }
        id = `${base}-${attempt}`;
      }
      const displayName = botName ?? options.botDisplayName?.(botSlug);
      if (displayName === undefined) return undefined;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: displayName.trim() || botSlug,
        members: [botSlug],
        botSlug,
        ...(participant ? { dmHumanId: human.humanId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(human, record);
      return record;
    },
    remoteHostKey(host) {
      return database.read((db) => remoteHostKey(db, host));
    },
    trustRemoteHostKey(host, key, membership) {
      if (membership !== undefined && !isBotNetworkMembership(membership))
        throw new Error('network-membership-invalid');
      database.transaction(
        (db) => {
          assertHostKey(db, host, key);
          const result = db
            .prepare(`UPDATE channel_records
          SET record_json = json_set(record_json, '$.remoteBot.hostKey', ?)
          WHERE json_extract(record_json, '$.remoteBot.hostId') = ?`)
            .run(key, host);
          if (result.changes === 0) throw new Error('network-channel-required');
          if (membership !== undefined) {
            const rows = db
              .prepare(`SELECT channel_id, record_json FROM channel_records
              WHERE json_extract(record_json, '$.remoteBot.hostId') = ?`)
              .all(host);
            for (const row of rows) {
              if (typeof row.channel_id !== 'string' || typeof row.record_json !== 'string')
                throw new Error('network-channel-invalid');
              const record = parseRecord(row.record_json, row.channel_id);
              if (record?.remoteBot === undefined) throw new Error('network-channel-invalid');
              const merged = mergeBotNetworkMembership(record.remoteBot.membership, membership);
              db.prepare(`UPDATE channel_records SET record_json = json_set(record_json,
                '$.remoteBot.membership', json(?)) WHERE channel_id = ?`).run(
                JSON.stringify(merged),
                row.channel_id,
              );
            }
          }
        },
        ['channel'],
      );
      publishRecordChanged();
    },
    getOrCreateRemoteBotDm(localBotSlug, remote) {
      const candidate = remoteBotDmRecord(localBotSlug, remote, now().toISOString());
      if (!isBotActive(localBotSlug)) throw new Error('Remote Bot DM recipient is not active');
      const result = database.transaction(
        (db) => {
          if (remote.hostKey !== undefined) assertHostKey(db, remote.hostId, remote.hostKey);
          const row = db
            .prepare('SELECT record_json FROM channel_records WHERE channel_id = ?')
            .get(candidate.id);
          const existing =
            typeof row?.record_json === 'string'
              ? parseRecord(row.record_json, candidate.id)
              : undefined;
          if (
            existing !== undefined &&
            existing.deletedAt === undefined &&
            (existing.remoteBot?.hostId !== remote.hostId ||
              existing.remoteBot.botSlug !== remote.botSlug ||
              existing.members.length !== 1 ||
              existing.members[0] !== localBotSlug ||
              !isBotDmChannel(existing))
          )
            throw new Error('Remote Bot DM identity collision');
          const record =
            existing?.deletedAt === undefined && existing !== undefined ? existing : candidate;
          const key = remote.hostKey ?? remoteHostKey(db, remote.hostId);
          const pinned =
            key === undefined
              ? record
              : { ...record, remoteBot: { ...record.remoteBot!, hostKey: key } };
          const updated =
            remote.membership === undefined
              ? pinned
              : {
                  ...pinned,
                  remoteBot: {
                    ...pinned.remoteBot!,
                    membership: mergeBotNetworkMembership(
                      pinned.remoteBot?.membership,
                      remote.membership,
                    ),
                  },
                };
          db.prepare(`INSERT INTO channel_records (channel_id, record_json) VALUES (?, ?)
          ON CONFLICT(channel_id) DO UPDATE SET record_json = excluded.record_json`).run(
            updated.id,
            JSON.stringify(updated),
          );
          return updated;
        },
        ['channel'],
      );
      publishRecordChanged();
      return result;
    },
    getOrCreateBotDm(human: HumanContext, firstBotSlug, secondBotSlug, name) {
      if (
        !isValidSlug(firstBotSlug) ||
        !isValidSlug(secondBotSlug) ||
        firstBotSlug === secondBotSlug
      )
        return undefined;
      const id = botDmChannelId(firstBotSlug, secondBotSlug);
      const members = [firstBotSlug, secondBotSlug].sort();
      const existing = readRecord(id);
      if (existing !== undefined) {
        if (
          existing.type !== 'dm' ||
          existing.botSlug !== undefined ||
          JSON.stringify(existing.members) !== JSON.stringify(members)
        )
          throw new Error(`Bot DM identity collision: ${id}`);
        return existing;
      }
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'dm',
        name: name.trim() || members.join(' · '),
        members,
        ...(() => {
          const principal = hasChannelAccessSchema()
            ? database.read((db) =>
                db
                  .prepare('SELECT owner_human_id FROM persona_bots WHERE slug=?')
                  .get(firstBotSlug),
              )
            : undefined;
          return typeof principal?.['owner_human_id'] === 'string'
            ? { dmHumanId: principal['owner_human_id'] }
            : {};
        })(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(human, record);
      return record;
    },
    createGroup(human: HumanContext, input) {
      const base = groupChannelIdBase(input.name);
      let id = input.id ?? base;
      if (
        input.id !== undefined &&
        (!isValidChannelId(id) ||
          database.read((db) =>
            db.prepare('SELECT 1 FROM channel_records WHERE channel_id = ?').get(id),
          ) !== undefined)
      )
        throw new Error('Group Channel identity is unavailable');
      for (
        let suffix = 2;
        input.id === undefined &&
        database.read((db) =>
          db.prepare('SELECT 1 FROM channel_records WHERE channel_id = ?').get(id),
        ) !== undefined;
        suffix++
      )
        id = `${base}-${suffix}`;
      const timestamp = now().toISOString();
      const record: ChannelRecord = {
        id,
        type: 'group',
        ...(input.ownerBotSlug === undefined ? { ownerHumanId: human.humanId } : {}),
        name: input.name.trim() || id,
        members: [...input.members],
        ...(input.ownerBotSlug === undefined ? {} : { ownerBotSlug: input.ownerBotSlug }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      writeRecord(human, record);
      return record;
    },
    setGroupAvatar(human: HumanContext, channelId, avatar) {
      humanAccess.current?.requirePolicy(human, channelId, 'editDetails');
      const channel = readRecord(channelId);
      if (channel?.type !== 'group') throw new Error('Group Channel not found');
      if (avatar !== null && !isGroupAvatar(avatar)) throw new Error('Invalid Group avatar');
      if (channel.avatar === (avatar ?? undefined)) return channel;
      const updated: ChannelRecord = { ...channel, updatedAt: now().toISOString() };
      if (avatar === null) delete updated.avatar;
      else updated.avatar = avatar;
      writeRecord(human, updated);
      return updated;
    },
    rename(human: HumanContext, id, name) {
      if (readRecord(id)?.type === 'group')
        humanAccess.current?.requirePolicy(human, id, 'editDetails');
      const prior = readRecord(id);
      if (prior === undefined || !name.trim()) return undefined;
      const updated = { ...prior, name: name.trim() };
      writeRecord(human, updated);
      return updated;
    },
  } satisfies Pick<
    ChannelStore,
    | 'getOrCreateHumanDm'
    | 'get'
    | 'list'
    | 'getOrCreateDm'
    | 'remoteHostKey'
    | 'trustRemoteHostKey'
    | 'getOrCreateRemoteBotDm'
    | 'getOrCreateBotDm'
    | 'createGroup'
    | 'setGroupAvatar'
    | 'rename'
  >;

  return { readRecord, humanBotDm, hasChannelAccessSchema, publishRecordChanged, methods };
}
