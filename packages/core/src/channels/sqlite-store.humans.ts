import type { HumanContext } from '../humans/context.js';
import { isChannelNotice } from './channel-notice.js';
import {
  isBotDmChannel,
  type LocalHumanIdentity,
  type HumanAvatar,
  HUMAN_AVATAR_BATCH,
  humanAvatarVersion,
  isHumanAvatar,
  type ChannelMessage,
} from './channel.js';
import type { ChannelStore } from './store.js';
import { parseMessage } from './sqlite-store.message-payload.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { createChannelAdmissions } from './sqlite-store.admissions.js';
import type { createChannelRecords } from './sqlite-store.records.js';
import type { SqliteChannelAccess, SqliteChannelStoreOptions } from './sqlite-store.types.js';

export function createChannelHumans({
  database,
  sourceHumanIdentity,
  readRecord,
  humanAccess,
  options,
  now,
}: {
  database: OperationalDatabaseModulePort;
  sourceHumanIdentity: ReturnType<typeof createChannelAdmissions>['sourceHumanIdentity'];
  readRecord: ReturnType<typeof createChannelRecords>['readRecord'];
  humanAccess: SqliteChannelAccess;
  options: SqliteChannelStoreOptions;
  now: () => Date;
}) {
  let humanAvatarTableCache: boolean | undefined;

  const humanAvatarTable = () =>
    (humanAvatarTableCache ??= database.read(
      (db) =>
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'human_avatars'")
          .get() !== undefined,
    ));

  let profileSetupTableCache: boolean | undefined;

  const profileSetupTable = () =>
    (profileSetupTableCache ??= database.read(
      (db) =>
        db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'human_profile_setup'",
          )
          .get() !== undefined,
    ));

  const humanIdentity = (human: HumanContext): LocalHumanIdentity => {
    const row = database.read((db) =>
      db
        .prepare(`SELECT n.default_display_name${sourceHumanIdentity() ? ', h.display_name' : ''}${humanAvatarTable() ? ', a.version AS avatar_version' : ''}${
          profileSetupTable()
            ? `, EXISTS (SELECT 1 FROM humans p
                   WHERE p.human_id = actor.human_id
                     AND p.human_id IS NOT COALESCE((SELECT owner_human_id FROM team_settings), 'local-human')
                     AND NOT EXISTS (SELECT 1 FROM human_profile_setup s WHERE s.human_id = p.human_id)
                 ) AS profile_pending`
            : ''
        }
          FROM (SELECT ? AS human_id) actor
          LEFT JOIN local_human_names n ON n.human_id = actor.human_id
          ${sourceHumanIdentity() ? 'LEFT JOIN humans h ON h.human_id = actor.human_id' : ''}
          ${humanAvatarTable() ? 'LEFT JOIN human_avatars a ON a.human_id = actor.human_id' : ''}`)
        .get(human.humanId),
    ) as
      | {
          default_display_name: string | null;
          display_name?: string | null;
          avatar_version?: string | null;
          profile_pending?: number;
        }
      | undefined;
    const defaultDisplayName = row?.default_display_name ?? null;
    const avatarVersion = row?.avatar_version ?? undefined;
    const pending = avatarVersion === undefined && row?.profile_pending === 1;
    return {
      humanId: human.humanId,
      defaultDisplayName,
      displayName: defaultDisplayName ?? row?.display_name ?? 'Human',
      ...(avatarVersion === undefined ? {} : { avatarVersion }),
      ...(pending ? { profileSetup: 'pending' as const } : {}),
    };
  };

  const humanMembers = (
    id: string,
  ): Array<{
    human_id: string;
    display_name: string;
    avatar_version: string | null;
    visible_from_revision: number;
    read_revision: number;
  }> =>
    database.read((db) =>
      db
        .prepare(`
        SELECT m.human_id, COALESCE(k.nickname, n.default_display_name, m.display_name, 'Human') AS display_name,
               ${humanAvatarTable() ? 'a.version' : 'NULL'} AS avatar_version, m.visible_from_revision,
               COALESCE(r.revision, 0) AS read_revision
          FROM channel_human_members m
          LEFT JOIN local_human_names n ON n.human_id = m.human_id
          LEFT JOIN channel_human_nicknames k ON k.channel_id = m.channel_id AND k.human_id = m.human_id
          ${humanAvatarTable() ? 'LEFT JOIN human_avatars a ON a.human_id = m.human_id' : ''}
          LEFT JOIN channel_read_positions r
            ON r.channel_id = m.channel_id AND r.human_id = m.human_id
         WHERE m.channel_id = ? AND m.left_at IS NULL
         ORDER BY m.human_id
      `)
        .all(id),
    ) as Array<{
      human_id: string;
      display_name: string;
      avatar_version: string | null;
      visible_from_revision: number;
      read_revision: number;
    }>;

  const readNickname = (human: HumanContext, id: string): string | null => {
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT nickname FROM channel_human_nicknames WHERE channel_id = ? AND human_id = ?',
        )
        .get(id, human.humanId),
    ) as { nickname: string } | undefined;
    return row?.nickname ?? null;
  };

  const participates = (human: HumanContext, id: string): boolean => {
    const channel = readRecord(id);
    if (channel === undefined || channel.deletedAt !== undefined) return false;
    if (humanAccess.current && !humanAccess.current.canRead(human, id)) return false;
    return channel.type === 'dm'
      ? (channel.humanParticipants?.includes(human.humanId) ?? !isBotDmChannel(channel))
      : humanMembers(id).some((member) => member.human_id === human.humanId);
  };

  const normalizeHumanName = (name: string | null): string | null => {
    if (
      name !== null &&
      (typeof name !== 'string' || name.length > 128 || /[\u0000-\u001f\u007f]/u.test(name))
    )
      throw new Error('Human name must be a single line of at most 128 characters');
    return name?.trim() || null;
  };

  const humanReceiptsFor = (
    message: ChannelMessage,
    revision: number,
    members: ReturnType<typeof humanMembers>,
  ): ChannelMessage['humanReceipts'] => {
    if (
      message.author.kind === 'human' ||
      message.author.kind === 'system' ||
      isChannelNotice(message)
    )
      return undefined;
    const recipients = members
      .filter((member) => member.visible_from_revision <= revision)
      .map((member) => ({
        humanId: member.human_id,
        displayName: member.display_name,
        state: member.read_revision >= revision ? ('read' as const) : ('unread' as const),
      }));
    return recipients.length === 0 ? undefined : recipients;
  };

  const methods = {
    humanIdentity,
    setHumanDefaultName(human: HumanContext, displayName) {
      const normalized = normalizeHumanName(displayName);
      database.transaction(
        (db) =>
          db
            .prepare(
              'INSERT INTO local_human_names (human_id, default_display_name) VALUES (?, ?) ON CONFLICT(human_id) DO UPDATE SET default_display_name = excluded.default_display_name',
            )
            .run(human.humanId, normalized),
        ['human-identity'],
      );
      options.onRecordChanged?.();
      return humanIdentity(human);
    },
    humanNickname(human: HumanContext, id) {
      return participates(human, id) ? readNickname(human, id) : undefined;
    },
    setHumanAvatar(human: HumanContext, avatar) {
      if (avatar !== null && !isHumanAvatar(avatar)) throw new Error('Invalid Human avatar');
      database.transaction(
        (db) => {
          if (avatar === null)
            db.prepare('DELETE FROM human_avatars WHERE human_id = ?').run(human.humanId);
          else
            db.prepare(
              'INSERT INTO human_avatars (human_id, avatar, version) VALUES (?, ?, ?) ON CONFLICT(human_id) DO UPDATE SET avatar = excluded.avatar, version = excluded.version',
            ).run(human.humanId, avatar, humanAvatarVersion(avatar));
        },
        ['human-identity'],
      );
      options.onRecordChanged?.();
      return humanIdentity(human);
    },
    finishHumanProfileSetup(human: HumanContext) {
      if (profileSetupTable())
        database.transaction(
          (db) =>
            db
              .prepare(
                'INSERT INTO human_profile_setup (human_id, finished_at) VALUES (?, ?) ON CONFLICT(human_id) DO NOTHING',
              )
              .run(human.humanId, now().toISOString()),
          ['human-identity'],
        );
      return humanIdentity(human);
    },
    humanAvatars(human: HumanContext, humanIds) {
      if (!humanAvatarTable()) return [];
      const wanted = [...new Set(humanIds)].slice(0, HUMAN_AVATAR_BATCH);
      if (wanted.length === 0) return [];
      return database.read((db) => {
        const visible = db.prepare(`
          SELECT a.human_id AS humanId, a.version, a.avatar FROM human_avatars a
           WHERE a.human_id = ?
             AND (a.human_id = ? OR EXISTS (
               SELECT 1 FROM channel_human_members mine
                 JOIN channel_human_members theirs ON theirs.channel_id = mine.channel_id
                 JOIN channel_records c ON c.channel_id = mine.channel_id
                WHERE mine.human_id = ? AND mine.left_at IS NULL
                  AND json_extract(c.record_json, '$.deletedAt') IS NULL
                  AND theirs.human_id = a.human_id AND theirs.left_at IS NULL))`);
        return wanted.flatMap((id) => {
          const row = visible.get(id, human.humanId, human.humanId) as HumanAvatar | undefined;
          return row === undefined
            ? []
            : [{ humanId: row.humanId, version: row.version, avatar: row.avatar }];
        });
      });
    },
    setHumanNickname(human: HumanContext, id, nickname) {
      if (!participates(human, id))
        throw new Error('The local Human must participate in this Channel');
      const normalized = normalizeHumanName(nickname);
      database.transaction(
        (db) => {
          if (normalized === null)
            db.prepare(
              'DELETE FROM channel_human_nicknames WHERE channel_id = ? AND human_id = ?',
            ).run(id, human.humanId);
          else
            db.prepare(
              'INSERT INTO channel_human_nicknames (channel_id, human_id, nickname) VALUES (?, ?, ?) ON CONFLICT(channel_id, human_id) DO UPDATE SET nickname = excluded.nickname',
            ).run(id, human.humanId, normalized);
        },
        ['human-identity'],
      );
      options.onRecordChanged?.();
    },
    listHumanMembers(human: HumanContext, id) {
      const channel = readRecord(id);
      if (channel?.type === 'dm' && !channel.humanParticipants && !isBotDmChannel(channel)) {
        const identity = humanIdentity(channel.dmHumanId ? { humanId: channel.dmHumanId } : human);
        return [
          {
            humanId: identity.humanId,
            displayName: readNickname(human, id) ?? identity.displayName,
            ...(identity.avatarVersion === undefined
              ? {}
              : { avatarVersion: identity.avatarVersion }),
          },
        ];
      }
      return humanMembers(id).map((member) => ({
        humanId: member.human_id,
        displayName: member.display_name,
        ...(member.avatar_version === null ? {} : { avatarVersion: member.avatar_version }),
      }));
    },
    hasHumanMembership(human, id) {
      return (
        database.read((db) =>
          db
            .prepare(
              'SELECT 1 FROM channel_human_members WHERE channel_id = ? AND human_id = ? AND left_at IS NULL',
            )
            .get(id, human.humanId),
        ) !== undefined
      );
    },
    readPosition(human: HumanContext, id) {
      if (humanAccess.current && !humanAccess.current.canRead(human, id)) return undefined;
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT message_id, revision, read_at FROM channel_read_positions WHERE channel_id = ? AND human_id = ?
      `)
          .get(id, human.humanId),
      ) as { message_id: string; revision: number; read_at: string } | undefined;
      return row === undefined
        ? undefined
        : {
            messageId: row.message_id,
            revision: row.revision,
            readAt: row.read_at,
          };
    },
    async markRead(human: HumanContext, id, messageId) {
      const row = database.read((db) =>
        db
          .prepare(`
        SELECT p.revision, e.payload_json, e.body FROM channel_placements p
        JOIN source_events e ON e.source_event_id = p.source_event_id
        WHERE p.channel_id = ? AND p.message_id = ?
      `)
          .get(id, messageId),
      ) as { revision: number; payload_json: string; body: string } | undefined;
      if (row === undefined || parseMessage(row.payload_json, row.body) === undefined)
        return undefined;
      const previous = this.readPosition(human, id);
      if (previous !== undefined && previous.revision >= row.revision) return previous;
      const position = { messageId, revision: row.revision, readAt: now().toISOString() };
      database.transaction(
        (db) =>
          db
            .prepare(`
        INSERT INTO channel_read_positions (channel_id, human_id, message_id, revision, read_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(channel_id, human_id) DO UPDATE SET
          message_id = excluded.message_id, revision = excluded.revision, read_at = excluded.read_at
      `)
            .run(id, human.humanId, messageId, position.revision, position.readAt),
        ['channel'],
      );
      if (readRecord(id)?.type === 'group') {
        try {
          options.onHumanReadChanged?.(id, human.humanId, position.revision);
        } catch (error) {
          options.warn?.('Human read notification failed: ' + String(error));
        }
      }
      return position;
    },
  } satisfies Pick<
    ChannelStore,
    | 'humanIdentity'
    | 'setHumanDefaultName'
    | 'humanNickname'
    | 'setHumanAvatar'
    | 'finishHumanProfileSetup'
    | 'humanAvatars'
    | 'setHumanNickname'
    | 'listHumanMembers'
    | 'hasHumanMembership'
    | 'readPosition'
    | 'markRead'
  > &
    ThisType<ChannelStore>;

  return { participates, humanMembers, humanReceiptsFor, methods };
}
