import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { MAX_PERSONA_BOT_AVATAR_BYTES, personaBotAvatarFromBytes } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { dmChannelId } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import { humanContext } from '../../humans/context.js';
import { botOwner } from '../../team/bot-access.js';
import type { TeamService } from '../../team/service.js';
import { authorizedPathRoot } from '../../workspaces/grant-native-tools.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { BotCreatePreview } from '../../workspaces/tool-approval.js';
import { DirectBotToolError } from '../sessions/direct-tools.js';

export interface BotCreateInput {
  displayName: string;
  description?: string;
  tags?: string[];
  avatarPath?: string;
  soul?: string;
  coreMemory?: string;
  memoryLocation?: string;
}

export interface BotCreateOutcome {
  botId: string;
  displayName: string;
  dmChannelId: string;
  memoryDir: string;
  model: 'host-default' | 'set';
}

export const NEW_BOT_ID_PLACEHOLDER = '<new-bot-id>';

export const MAX_CREATED_BOT_NAME_LENGTH = 60;

export const MAX_CREATED_BOT_TAGS = 8;

export const MAX_CREATED_BOT_TAG_LENGTH = 32;

export const MAX_CREATED_BOT_BIO_LENGTH = 160;

interface RuntimeBotCreationPorts {
  channels: ChannelStore;
  closed: () => boolean;
  createBotId: () => string;
  grants: WorkspaceGrantStore | undefined;
  registry: PersonaBotRegistry;
  team: TeamService | undefined;
  warn: ((message: string) => void) | undefined;
}

export function createRuntimeBotCreation(ports: RuntimeBotCreationPorts) {
  function botCreatePreview(botSlug: string, args: unknown): BotCreatePreview | undefined {
    if (typeof args !== 'object' || args === null) return undefined;
    const input = args as Record<string, unknown>;
    const location =
      typeof input['memory_location'] === 'string' ? input['memory_location'].trim() : '';
    let avatar: string | undefined;
    let avatarError: string | undefined;
    if (typeof input['avatar_path'] === 'string')
      try {
        avatar = readCreatedAvatar(botSlug, input['avatar_path']);
      } catch (error) {
        avatarError = error instanceof Error ? error.message : 'invalid-avatar';
      }
    return {
      memoryFolder:
        location.length > 0
          ? join(location, NEW_BOT_ID_PLACEHOLDER)
          : join(ports.registry.rootDir, NEW_BOT_ID_PLACEHOLDER, 'memory'),
      defaultLocation: location.length === 0,
      ...(avatar === undefined ? {} : { avatar }),
      ...(avatarError === undefined ? {} : { avatarError }),
    };
  }

  function createBot(
    botSlug: string,
    sourceEventId: string | undefined,
    beforeSend: () => void,
    input: BotCreateInput,
  ): BotCreateOutcome {
    if (sourceEventId === undefined)
      throw new DirectBotToolError('source-required', 'Bot creation requires a Source Event');
    const refuse = (code: string, message: string): never => {
      throw new DirectBotToolError(code, `${code}: ${message}`);
    };
    const creator = ports.registry.get(botSlug);
    if (ports.closed() || creator === undefined || creator.paused === true)
      refuse('creator-unavailable', 'The creating PersonaBot is no longer active');
    if (creator) ports.team?.roles.require(humanContext(botOwner(creator)), 'bots.createPrivate');
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || [...displayName].length > MAX_CREATED_BOT_NAME_LENGTH)
      refuse(
        'invalid-input',
        `display_name must be 1 to ${MAX_CREATED_BOT_NAME_LENGTH} characters`,
      );
    const description = input.description?.trim();
    if (description !== undefined && [...description].length > MAX_CREATED_BOT_BIO_LENGTH)
      refuse(
        'invalid-input',
        `description must be at most ${MAX_CREATED_BOT_BIO_LENGTH} characters`,
      );
    const tags = [
      ...new Set((input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ];
    if (
      tags.length > MAX_CREATED_BOT_TAGS ||
      tags.some((tag) => [...tag].length > MAX_CREATED_BOT_TAG_LENGTH)
    )
      refuse(
        'invalid-input',
        `tags allows at most ${MAX_CREATED_BOT_TAGS} tags of at most ${MAX_CREATED_BOT_TAG_LENGTH} characters`,
      );
    const memoryLocation = input.memoryLocation?.trim();
    if (memoryLocation !== undefined && memoryLocation.length > 0 && !isAbsolute(memoryLocation))
      refuse('invalid-memory-dir', 'memory_location must be an absolute folder path');
    const avatar =
      input.avatarPath === undefined ? undefined : readCreatedAvatar(botSlug, input.avatarPath);
    if (memoryLocation) ports.grants?.validatePath?.(botSlug, memoryLocation, true);
    const slug = ports.createBotId();
    beforeSend();
    const created = ports.registry.create({
      slug,
      ownerHumanId: botOwner(creator!),
      displayName,
      ...(input.soul === undefined ? {} : { persona: input.soul }),
      ...(input.coreMemory === undefined ? {} : { coreMemory: input.coreMemory }),
      ...(tags.length === 0 ? {} : { roles: tags }),
      ...(description ? { description } : {}),
      ...(avatar === undefined ? {} : { avatar }),
      ...(memoryLocation ? { memoryLocation } : {}),
    });
    if (!created.ok)
      refuse(
        created.reason === 'invalid-memory-dir' ||
          created.reason === 'git-not-found' ||
          created.reason === 'memory-unavailable'
          ? created.reason
          : 'invalid-input',
        created.reason === 'invalid-memory-dir'
          ? 'memory_location must be an existing absolute folder that does not already hold this Bot'
          : created.reason === 'git-not-found'
            ? 'Git is required to create a Memory Repository'
            : (created.detail ?? 'The PersonaBot could not be created'),
      );
    const record = (created as Extract<typeof created, { ok: true }>).record;
    const dm = ports.channels.getOrCreateDm(
      humanContext(botOwner(record)),
      record.slug,
      record.displayName,
    );
    try {
      ports.channels.appendBotCreateAction?.({
        botSlug,
        causeSourceEventId: sourceEventId,
        created: { botSlug: record.slug, displayName: record.displayName },
      });
    } catch (error) {
      ports.warn?.(
        `bot-create-action-record-failed bot=${botSlug} created=${record.slug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
    return {
      botId: record.slug,
      displayName: record.displayName,
      dmChannelId: dm?.id ?? dmChannelId(record.slug),
      memoryDir: ports.registry.memoryDirFor(record.slug) ?? '',
      model: record.modelPlan === undefined && record.model === undefined ? 'host-default' : 'set',
    };
  }

  function readCreatedAvatar(botSlug: string, path: string): string {
    const refuse = (message: string): never => {
      throw new DirectBotToolError('invalid-avatar', `invalid-avatar: ${message}`);
    };
    if (!isAbsolute(path)) refuse('avatar_path must be an absolute file path');
    const roots = (ports.grants?.list(botSlug) ?? [])
      .filter((grant) => grant.revokedAt === undefined)
      .flatMap((grant) => {
        try {
          return [ports.grants!.requireActive(botSlug, grant.id).workspacePath];
        } catch {
          return [];
        }
      });
    const memory = ports.registry.memoryDirFor(botSlug);
    if (memory !== undefined) roots.push(memory);
    ports.grants?.validatePath?.(botSlug, path);
    if (authorizedPathRoot(roots, path) === undefined)
      refuse('avatar_path is outside your Memory Repository and Workspace Grants');
    let bytes: Buffer;
    try {
      const size = statSync(path).size;
      if (size > MAX_PERSONA_BOT_AVATAR_BYTES)
        refuse(`the image is larger than ${MAX_PERSONA_BOT_AVATAR_BYTES} bytes`);
      bytes = readFileSync(path);
    } catch (error) {
      if (error instanceof DirectBotToolError) throw error;
      return refuse('the image file cannot be read');
    }
    return personaBotAvatarFromBytes(bytes) ?? refuse('the image must be a PNG, JPEG or WebP file');
  }

  return { botCreatePreview, createBot };
}
