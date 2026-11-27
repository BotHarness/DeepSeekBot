import type { DatabaseSync } from 'node:sqlite';
import type { ChannelBotChange, ChannelBotsView } from '@botharness/host-protocol/channel-bots';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelStore } from '../channels/store.js';
import { humanContext, type HumanContext } from '../humans/context.js';
import {
  channelBlockedBots,
  channelBlockedHumans,
  setChannelSenderBlock,
} from '../messaging/permissions/index.js';
import type { TeamChannels } from './channels.js';
import { allowsBotMention } from '../team-policy/channel-access.js';
import { channelBotAudienceSchema, channelPolicySchema } from '../team-policy/channel-contract.js';
import { TeamError } from '../team-policy/error.js';

type Audience = z.infer<typeof channelBotAudienceSchema>;
const everyone: Audience = { kind: 'everyone' };

const audienceRows = z.array(z.object({ bot_slug: z.string(), audience_json: z.string() }));
const roleRows = z.array(z.object({ role_id: z.string() }));
const members = z.array(z.object({ humanId: z.string(), displayName: z.string() }));
const botRows = z.array(z.object({ botSlug: z.string(), name: z.string(), owned: z.number() }));

function audiences(db: DatabaseSync, channelId: string) {
  return new Map(
    audienceRows
      .parse(
        db
          .prepare(
            'SELECT bot_slug, audience_json FROM channel_bot_mention_audiences WHERE channel_id = ?',
          )
          .all(channelId),
      )
      .map((row) => [row.bot_slug, channelBotAudienceSchema.parse(JSON.parse(row.audience_json))]),
  );
}

export function channelBotReception(
  db: DatabaseSync,
  human: HumanContext,
  channelId: string,
  mentioned: ReadonlySet<string>,
) {
  const blocked = channelBlockedBots(db, channelId, human.humanId);
  const deniedMentions = new Set<string>();
  if (mentioned.size === 0 || [...mentioned].every((slug) => blocked.has(slug)))
    return { blocked, deniedMentions };

  const row = z.object({ policy: z.string(), admin: z.number() }).parse(
    db
      .prepare(`SELECT c.permission_table_json AS policy,
        (c.owner_human_id IS ? OR EXISTS (SELECT 1 FROM channel_admins a
          WHERE a.channel_id = c.channel_id AND a.human_id = ?)) AS admin
      FROM channel_records c WHERE c.channel_id = ?`)
      .get(human.humanId, human.humanId, channelId),
  );
  const policy = channelPolicySchema.parse(JSON.parse(row.policy));
  const perBot = audiences(db, channelId);
  const hasRoles =
    policy.overrides.length > 0 ||
    [...mentioned].some((slug) => perBot.get(slug)?.kind === 'roles');
  const roleIds = new Set(
    hasRoles
      ? roleRows
          .parse(
            db.prepare('SELECT role_id FROM human_roles WHERE human_id = ?').all(human.humanId),
          )
          .map((role) => role.role_id)
      : [],
  );
  for (const slug of mentioned)
    if (!allowsBotMention(policy, perBot.get(slug) ?? everyone, roleIds, !!row.admin))
      deniedMentions.add(slug);
  return { blocked, deniedMentions };
}

export class TeamChannelBots {
  constructor(
    private readonly database: OperationalDatabaseModulePort,
    private readonly channels: ChannelStore,
    private readonly access: TeamChannels,
  ) {}

  private scope(human: HumanContext, channelId: string) {
    const channel = this.channels.get(channelId);
    if (channel?.type !== 'group' || channel.deletedAt !== undefined)
      throw new TeamError('channel-not-found');
    const manager = this.access.canManageBotSettings(human, channelId);
    if (!manager && !this.access.canRead(human, channelId, true))
      throw new TeamError('channel-not-found');
    const bots = this.database
      .read((db) =>
        botRows.parse(
          db
            .prepare(`SELECT slug AS botSlug, coalesce(json_extract(body, '$.displayName'), slug) AS name,
            (owner_human_id IS ?) AS owned FROM persona_bots
          WHERE slug IN (SELECT value FROM json_each(?)) ORDER BY name, slug`)
            .all(human.humanId, JSON.stringify(channel.members)),
        ),
      )
      .filter((bot) => manager || bot.owned);
    if (!manager && bots.length === 0) throw new TeamError('permission-required');
    return { manager, bots };
  }

  view(human: HumanContext, channelId: string): ChannelBotsView {
    const { manager, bots } = this.scope(human, channelId);
    return this.database.read((db) => {
      const perBot = audiences(db, channelId);
      return {
        bots: bots.map(({ botSlug, name }) => ({
          botSlug,
          name,
          audience: perBot.get(botSlug) ?? everyone,
          canSetAudience: manager,
          blockedHumanIds: channelBlockedHumans(db, channelId, botSlug),
        })),
        roles: manager ? this.access.roleDirectory(human, channelId) : [],
        members: members.parse(
          db
            .prepare(`SELECT h.human_id AS humanId, m.display_name AS displayName
            FROM channel_human_members m JOIN humans h USING (human_id)
            WHERE m.channel_id = ? AND m.left_at IS NULL AND h.status = 'active'
            ORDER BY m.display_name, h.human_id`)
            .all(channelId),
        ),
      };
    });
  }

  change(human: HumanContext, channelId: string, botSlug: string, change: ChannelBotChange) {
    const { manager, bots } = this.scope(human, channelId);
    if (!bots.some((bot) => bot.botSlug === botSlug)) throw new TeamError('bot-not-found');
    if (change.kind === 'audience') {
      if (!manager) throw new TeamError('permission-required');
      if (change.audience.kind === 'roles') {
        const { roleIds } = change.audience;
        const valid = this.database.read((db) => {
          const exists = db.prepare('SELECT 1 FROM host_roles WHERE role_id = ?');
          return roleIds.every((id) => exists.get(id));
        });
        if (!valid) throw new TeamError('role-not-found');
      }
    } else if (
      change.blocked &&
      !this.access.canRead(humanContext(change.humanId), channelId, true)
    ) {
      throw new TeamError('member-not-found');
    }
    this.database.transaction(
      (db) => {
        if (change.kind === 'block') {
          setChannelSenderBlock(db, {
            channelId,
            botSlug,
            humanId: change.humanId,
            blocked: change.blocked,
          });
          return;
        }
        db.prepare(`INSERT INTO channel_bot_mention_audiences(channel_id, bot_slug, audience_json)
        VALUES (?, ?, ?) ON CONFLICT (channel_id, bot_slug) DO UPDATE SET audience_json = excluded.audience_json`).run(
          channelId,
          botSlug,
          JSON.stringify(change.audience),
        );
      },
      ['channels', 'team', 'messaging'],
    );
    return this.view(human, channelId);
  }
}
