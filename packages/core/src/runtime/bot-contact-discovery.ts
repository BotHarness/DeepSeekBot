import { createHash } from 'node:crypto';

import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import { isValidSlug } from '../bots/slug.js';

export const BOT_CONTACT_OUTPUT_LIMIT = 12_000;

export interface BotContactQuery {
  query?: string;
  cursor?: string;
  limit?: number;
  botId?: string;
}

export interface BotContact {
  botId: string;
  displayName: string;
  displayNameTruncated?: true;
  description?: string;
  descriptionTruncated?: true;
  hostId?: string;
  botSlug?: string;
  device?: { model: string | null; platform: string | null };
  capabilities?: string[];
}

export interface NetworkBotContact {
  hostKey?: string;
  hostId: string;
  botSlug: string;
  displayName: string;
  description?: string;
  device: { model: string | null; platform: string | null };
  capabilities: readonly string[];
}

export function networkBotId(hostId: string, botSlug: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(hostId) || !isValidSlug(botSlug))
    throw new Error('Invalid remote Bot identity');
  return `remote:${hostId}:${botSlug}`;
}

function validContactId(id: string): boolean {
  if (isValidSlug(id)) return true;
  const parts = id.split(':');
  if (parts.length !== 3 || parts[0] !== 'remote') return false;
  try {
    return networkBotId(parts[1]!, parts[2]!) === id;
  } catch {
    return false;
  }
}

function projectNetwork(bot: NetworkBotContact, descriptionLimit: number): BotContact {
  const text = (value: string | null) => (value === null ? null : value.slice(0, 128));
  return {
    botId: networkBotId(bot.hostId, bot.botSlug),
    hostId: bot.hostId,
    botSlug: bot.botSlug,
    displayName: bot.displayName.slice(0, 128),
    ...(bot.displayName.length > 128 ? { displayNameTruncated: true } : {}),
    ...(bot.description === undefined
      ? {}
      : {
          description: bot.description.slice(0, descriptionLimit),
          ...(bot.description.length > descriptionLimit ? { descriptionTruncated: true } : {}),
        }),
    device: { model: text(bot.device.model), platform: text(bot.device.platform) },
    capabilities: [...new Set(bot.capabilities)].slice(0, 8).map((value) => value.slice(0, 48)),
  };
}

export interface BotContactPage {
  outputLimit: number;
  contacts: BotContact[];
  nextCursor?: string;
}

function project(bot: PersonaBotRecord, descriptionLimit: number): BotContact {
  return {
    botId: bot.slug,
    displayName: bot.displayName.slice(0, 128),
    ...(bot.displayName.length > 128 ? { displayNameTruncated: true } : {}),
    ...(bot.description === undefined
      ? {}
      : {
          description: bot.description.slice(0, descriptionLimit),
          ...(bot.description.length > descriptionLimit ? { descriptionTruncated: true } : {}),
        }),
  };
}

export function discoverBotContacts(
  registry: PersonaBotRegistry,
  ownerBotId: string,
  input: BotContactQuery = {},
  networkContacts: readonly NetworkBotContact[] = [],
): BotContactPage {
  if (input.botId !== undefined) {
    if (input.query !== undefined || input.cursor !== undefined || input.limit !== undefined)
      throw new Error('list_bot_contacts: bot_id detail cannot be combined with page arguments');
    const remote = networkContacts.find(
      (bot) => networkBotId(bot.hostId, bot.botSlug) === input.botId,
    );
    if (remote !== undefined)
      return { outputLimit: BOT_CONTACT_OUTPUT_LIMIT, contacts: [projectNetwork(remote, 1_000)] };
    const bot = registry.get(input.botId);
    if (bot === undefined || bot.slug === ownerBotId || bot.paused === true)
      throw new Error('list_bot_contacts: bot_id must identify an active colleague');
    return { outputLimit: BOT_CONTACT_OUTPUT_LIMIT, contacts: [project(bot, 1_000)] };
  }
  const query = input.query?.trim().toLowerCase() ?? '';
  if (query.length > 200)
    throw new Error('list_bot_contacts: query must be at most 200 characters');
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error('list_bot_contacts: limit must be an integer from 1 to 50');
  const filter = createHash('sha256').update(JSON.stringify({ ownerBotId, query })).digest('hex');
  let afterId: string | undefined;
  if (input.cursor !== undefined) {
    try {
      if (input.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(input.cursor))
        throw new Error('invalid');
      const decoded: unknown = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('version' in decoded) ||
        decoded.version !== 1 ||
        !('filter' in decoded) ||
        decoded.filter !== filter ||
        !('afterId' in decoded) ||
        typeof decoded.afterId !== 'string' ||
        !validContactId(decoded.afterId)
      )
        throw new Error('invalid');
      afterId = decoded.afterId;
    } catch {
      throw new Error('list_bot_contacts: invalid cursor; restart with unchanged query');
    }
  }
  const local = registry
    .list()
    .filter((bot) => bot.slug !== ownerBotId && bot.paused !== true)
    .filter(
      (bot) =>
        query === '' ||
        [bot.slug, bot.displayName, bot.description ?? ''].some((value) =>
          value.toLowerCase().includes(query),
        ),
    )
    .map((bot) => project(bot, 160));
  const remote = networkContacts
    .filter(
      (bot) =>
        query === '' ||
        [
          bot.botSlug,
          bot.displayName,
          bot.description ?? '',
          bot.device.model ?? '',
          bot.device.platform ?? '',
          ...bot.capabilities,
        ].some((value) => value.toLowerCase().includes(query)),
    )
    .map((bot) => projectNetwork(bot, 160));
  const matching = [...new Map([...local, ...remote].map((bot) => [bot.botId, bot])).values()]
    .filter((bot) => afterId === undefined || bot.botId > afterId)
    .sort((left, right) => (left.botId < right.botId ? -1 : left.botId > right.botId ? 1 : 0));
  const contacts: BotContact[] = [];
  const frame = (next: boolean): BotContactPage => ({
    outputLimit: BOT_CONTACT_OUTPUT_LIMIT,
    contacts,
    ...(next
      ? {
          nextCursor: Buffer.from(
            JSON.stringify({ version: 1, filter, afterId: contacts.at(-1)!.botId }),
          ).toString('base64url'),
        }
      : {}),
  });
  for (const bot of matching.slice(0, limit)) {
    contacts.push(bot);
    if (
      JSON.stringify(frame(contacts.length < matching.length)).length > BOT_CONTACT_OUTPUT_LIMIT
    ) {
      contacts.pop();
      break;
    }
  }
  return frame(contacts.length < matching.length);
}
