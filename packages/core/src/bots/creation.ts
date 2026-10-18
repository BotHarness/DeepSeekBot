import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelStore } from '../channels/store.js';
import { dmChannelId } from '../channels/channel.js';
import type { CreatePersonaBotInput, PersonaBotRecord } from './persona-bot.js';
import type { PersonaBotRegistry } from './registry.js';

export type BotCreationInput = Omit<CreatePersonaBotInput, 'slug'>;
export interface BotCreationReceipt {
  operationKey: string;
  botSlug: string;
  status: 'reserved' | 'created';
  channelId?: string;
}
export interface BotCreationResult {
  record: PersonaBotRecord;
  channelId: string;
  receipt?: BotCreationReceipt;
}
export interface BotCreationService {
  create(input: BotCreationInput, operationKey?: string): BotCreationResult;
  lookup(operationKey: string, input: BotCreationInput): BotCreationReceipt | undefined;
}
export class BotCreationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BotCreationError';
  }
}
interface CreationRow {
  operation_key: string;
  payload_hash: string;
  bot_slug: string;
  status: 'reserved' | 'created';
}
export function validBotCreationKey(key: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key);
}
function checkedKey(key: string): void {
  if (!validBotCreationKey(key))
    throw new BotCreationError(
      'invalid-operation-key',
      'The operation key must be 8–128 letters, digits, dots, colons, underscores or hyphens.',
    );
}
function fingerprint(input: BotCreationInput): string {
  const canonical = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export function createBotCreation(options: {
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
}): BotCreationService {
  const { database, registry, channels } = options;
  const read = (key: string) =>
    database.read(
      (db) =>
        db
          .prepare(
            'SELECT operation_key, payload_hash, bot_slug, status FROM bot_creation_operations WHERE operation_key = ?',
          )
          .get(key) as CreationRow | undefined,
    );
  const match = (row: CreationRow, input: BotCreationInput): void => {
    if (row.payload_hash !== fingerprint(input))
      throw new BotCreationError(
        'creation-key-conflict',
        'This operation key belongs to a different creation request.',
      );
  };
  const receipt = (row: CreationRow): BotCreationReceipt => {
    const bot = registry.get(row.bot_slug);
    if (
      bot?.paused === true ||
      (!bot && registry.getHistorical(row.bot_slug)) ||
      (!bot && row.status === 'created')
    )
      throw new BotCreationError(
        'creation-identity-unavailable',
        'The original Bot is no longer active; this key cannot recreate it.',
      );
    const channelId = dmChannelId(row.bot_slug);
    const complete = bot !== undefined && channels.get(channelId) !== undefined;
    return {
      operationKey: row.operation_key,
      botSlug: row.bot_slug,
      status: complete ? 'created' : 'reserved',
      ...(complete ? { channelId } : {}),
    };
  };
  return {
    lookup(operationKey, input) {
      checkedKey(operationKey);
      const row = read(operationKey);
      if (!row) return undefined;
      match(row, input);
      return receipt(row);
    },
    create(input, operationKey) {
      let row: CreationRow | undefined;
      if (operationKey !== undefined) {
        checkedKey(operationKey);
        if (input.memoryDir !== undefined || input.memoryLocation !== undefined)
          throw new BotCreationError(
            'invalid-create-scope',
            'Stable creation uses the managed Memory location; move Memory separately after creation.',
          );
        const hash = fingerprint(input);
        database.transaction((db) => {
          db.prepare(
            'INSERT OR IGNORE INTO bot_creation_operations (operation_key,payload_hash,bot_slug,status) VALUES (?,?,?,?)',
          ).run(operationKey, hash, 'bot-' + randomUUID().replaceAll('-', ''), 'reserved');
        });
        row = read(operationKey)!;
        match(row, input);
        receipt(row);
      }
      const slug = row?.bot_slug ?? 'bot-' + randomUUID().replaceAll('-', '');
      let record = registry.get(slug);
      if (record === undefined) {
        if (row !== undefined && existsSync(registry.defaultMemoryDirFor(slug)))
          throw new BotCreationError(
            'creation-memory-conflict',
            'The reserved Memory folder already exists without its Bot identity; repair it before retrying this operation.',
          );
        const created = registry.create({ ...input, slug });
        if (!created.ok)
          throw new BotCreationError(
            created.reason,
            created.detail ?? 'The Bot could not be created.',
          );
        record = created.record;
      }
      const channel = channels.getOrCreateDm(slug, record.displayName);
      if (!channel)
        throw new BotCreationError(
          'creation-dm-unavailable',
          'The Bot identity exists but its DM could not be prepared; retry with the same operation key.',
        );
      if (row !== undefined)
        database.transaction((db) => {
          db.prepare(
            "UPDATE bot_creation_operations SET status = 'created' WHERE operation_key = ?",
          ).run(row!.operation_key);
        });
      return {
        record,
        channelId: channel.id,
        ...(row === undefined
          ? {}
          : {
              receipt: {
                operationKey: row.operation_key,
                botSlug: slug,
                status: 'created' as const,
                channelId: channel.id,
              },
            }),
      };
    },
  };
}
