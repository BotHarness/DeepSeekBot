import { botMetadata, type BotMetadataResult } from '../../team/bot-administration.js';
import { ownsBot } from '../../team/bot-access.js';
import { TeamRoles } from '../../team/roles.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { join } from 'node:path';
import { dmChannelId } from '../../channels/channel.js';
import { createBotPairing } from '../../messaging/pairing.js';
import { attachOperationalModule } from '../../database/owner.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../../marketplace/descriptor.js';
import type { BotCreateCliIo, BotCreateResult, CreateValues } from './cli-types.js';
import { CliFailure, usageError } from './cli-errors.js';
import { nextActions } from './cli-create.js';
import {
  trimmed,
  resolveHome,
  openRegistry,
  openChannels,
  requireBotRecord,
} from './cli-offline.js';
import { memoryBot } from './cli-memory.js';

export function runList(
  values: CreateValues,
  io: BotCreateCliIo,
): { bots: Array<{ id: string; name: string; createdAt: string }> } {
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome, true);
  try {
    return {
      bots: registry.list().map((record) => ({
        id: record.slug,
        name: record.displayName,
        createdAt: record.createdAt,
      })),
    };
  } finally {
    owner.close();
  }
}

export function runShow(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): BotCreateResult | BotMetadataResult {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('show needs a bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome, true);
  try {
    const record = registry.get(slug);
    if (record === undefined) {
      throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    }
    const human = new TeamRoles(attachOperationalModule(owner, 'team'), () => {}).ownerContext();
    if (!ownsBot(human, record)) return { metadataOnly: true, bot: botMetadata(human, record) };
    const channelId = dmChannelId(slug);
    return {
      bot: { id: slug, name: record.displayName },
      dm: { channelId },
      dataDir: registry.memoryDirFor(slug) ?? join(dshHome, 'botharness', 'bots', slug, 'memory'),
      steps: [{ name: 'show', status: 'ok' }],
      next: nextActions(
        channelId,
        record.displayName,
        slug,
        record.modelPlan === undefined && record.model === undefined,
      ),
    };
  } finally {
    owner.close();
  }
}

export function runPause(
  id: string,
  paused: boolean,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string; paused: boolean } } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('pause and resume need exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const result = registry.setPaused(slug, paused);
    if (!result.ok) throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    io.stderr(`tobs: ${paused ? 'paused' : 'resumed'} ${slug}`);
    return {
      bot: {
        id: slug,
        name: result.record.displayName,
        paused: result.record.paused === true,
      },
    };
  } finally {
    owner.close();
  }
}

export function runUpdate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string; roles: string[]; description?: string } } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('update needs exactly one bot id.');
  const displayName = trimmed(values.name);
  const description = trimmed(values.description);
  const roles =
    values.role === undefined
      ? undefined
      : values.role.map((role) => role.trim()).filter((role) => role.length > 0);
  if (displayName === undefined && description === undefined && roles === undefined) {
    throw usageError('update needs at least one of --name, --description, or --role.');
  }
  if (
    (roles !== undefined &&
      (roles.length > MAX_DESCRIPTOR_TAGS ||
        roles.some((tag) => [...tag].length > MAX_DESCRIPTOR_TAG_LENGTH))) ||
    (description !== undefined && [...description].length > MAX_DESCRIPTOR_BIO_LENGTH)
  ) {
    throw new CliFailure('invalid-input', 'Tags or bio exceed the profile limits.', 1);
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const result = registry.update(slug, {
      ...(displayName === undefined ? {} : { displayName }),
      ...(roles === undefined ? {} : { roles }),
      ...(description === undefined ? {} : { description }),
    });
    if (!result.ok) {
      throw result.reason === 'not-found'
        ? new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1)
        : new CliFailure('invalid-input', 'The bot could not be updated.', 1);
    }
    io.stderr(`tobs: updated ${slug}`);
    return {
      bot: {
        id: slug,
        name: result.record.displayName,
        roles: result.record.roles ?? [],
        ...(result.record.description === undefined
          ? {}
          : { description: result.record.description }),
      },
    };
  } finally {
    owner.close();
  }
}

export function runHumanNameSet(
  values: CreateValues,
  io: BotCreateCliIo,
): { human: { humanId: string; displayName: string } } {
  const name = trimmed(values.name);
  const clear = values.clear === true;
  if ((name === undefined) === !clear) {
    throw usageError('human-name-set needs --name or --clear, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    try {
      const identity = channels.setHumanDefaultName(OWNER_HUMAN_CONTEXT, clear ? null : name!);
      io.stderr(`tobs: set the Human display name`);
      return { human: { humanId: identity.humanId, displayName: identity.displayName } };
    } catch (error) {
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The Human display name is invalid.',
        1,
      );
    }
  } finally {
    owner.close();
  }
}

export function runChannelHumanNameSet(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { channel: { id: string }; nickname: string | null } {
  const channelId = id.trim();
  if (channelId.length === 0)
    throw usageError('channel-human-name-set needs exactly one channel id.');
  const nickname = trimmed(values.nickname);
  const clear = values.clear === true;
  if ((nickname === undefined) === !clear) {
    throw usageError('channel-human-name-set needs --nickname or --clear, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    if (channels.get(channelId) === undefined) {
      throw new CliFailure('unknown-channel', `Unknown channel: ${channelId}`, 1);
    }
    try {
      channels.setHumanNickname(OWNER_HUMAN_CONTEXT, channelId, clear ? null : nickname!);
    } catch (error) {
      throw new CliFailure(
        'invalid-input',
        error instanceof Error ? error.message : 'The Human nickname is invalid.',
        1,
      );
    }
    io.stderr(`tobs: set the Human nickname in ${channelId}`);
    return {
      channel: { id: channelId },
      nickname: channels.humanNickname(OWNER_HUMAN_CONTEXT, channelId) ?? null,
    };
  } finally {
    owner.close();
  }
}

export function runChannels(
  values: CreateValues,
  io: BotCreateCliIo,
): { channels: Array<{ id: string; type: string; name: string; botSlug?: string }> } {
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    return {
      channels: channels.list().map((channel) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name,
        ...(channel.botSlug === undefined ? {} : { botSlug: channel.botSlug }),
      })),
    };
  } finally {
    owner.close();
  }
}

export function runChannelMessages(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { channel: { id: string }; messages: unknown[] } {
  const channelId = id.trim();
  if (channelId.length === 0) throw usageError('channel-messages needs exactly one channel id.');
  const rawLimit = trimmed(values.limit);
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    if (!/^[0-9]+$/u.test(rawLimit) || Number(rawLimit) < 1) {
      throw usageError('--limit must be a positive whole number.');
    }
    limit = Number(rawLimit);
  }
  const before = trimmed(values.before);
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const channels = openChannels(dshHome, owner, registry);
    if (channels.get(channelId) === undefined) {
      throw new CliFailure('unknown-channel', `Unknown channel: ${channelId}`, 1);
    }
    return {
      channel: { id: channelId },
      messages: channels.readMessages(channelId, {
        ...(limit === undefined ? {} : { limit }),
        ...(before === undefined ? {} : { before }),
      }),
    };
  } finally {
    owner.close();
  }
}

export function runPairings(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; pairings: unknown[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('pairings needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    const pairing = createBotPairing(attachOperationalModule(owner, 'messaging'), (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    });
    return { bot: memoryBot(record), pairings: pairing.list(record.slug) };
  } finally {
    owner.close();
  }
}
