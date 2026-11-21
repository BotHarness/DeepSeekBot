import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import {
  parseSkillOwnerKey,
  sessionSkills,
  skillOwnerKey,
  type SkillCatalog,
  type SkillCatalogEntry,
  type SkillOwner,
} from '../../skills/catalog.js';
import {
  BotSkillIgnoredFilesError,
  BotSkillNotFoundError,
  listBotSkills,
  readBotSkill,
  removeBotSkill,
  type BotSkill,
} from '../../skills/bot-skills.js';

export interface SkillDetail {
  name: string;
  description: string;
  owner: SkillOwner;
  path?: string;
  content: string;
}

export interface SkillsBridgeDeps {
  skills?: SkillCatalog;
}

export interface SkillsBridgeMethods {
  channelSkillCatalog(payload: unknown): Promise<BridgeResult<{ skills: SkillCatalogEntry[] }>>;
  sessionSkillCatalog(payload: unknown): Promise<BridgeResult<{ skills: SkillCatalogEntry[] }>>;
  botSkills(payload: unknown): Promise<BridgeResult<{ skills: BotSkill[] }>>;
  skillShow(payload: unknown): Promise<BridgeResult<{ skill: SkillDetail }>>;
  botSkillRemove(payload: unknown): Promise<BridgeResult<{ name: string; removed: string }>>;
}

export function createSkillsBridgeMethods(
  deps: SkillsBridgeDeps & {
    channels: Pick<ChannelStore, 'get'>;
    ownership: Pick<SessionOwnership, 'resolve'>;
    registry: Pick<PersonaBotRegistry, 'get' | 'list' | 'memoryDirFor'>;
  },
  channelSkillBots: (channel: ChannelRecord) => string[],
  requireOwnedBot: (slug: string) => void,
): SkillsBridgeMethods {
  return {
    async channelSkillCatalog(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const channel = deps.channels.get(channelId);
      if (channel === undefined) return unknownChannel(channelId);
      if (deps.skills === undefined) return { ok: true, value: { skills: [] } };
      const bots = channelSkillBots(channel);
      try {
        return { ok: true, value: { skills: await deps.skills.list(bots) } };
      } catch (error) {
        return {
          ok: false,
          error: { code: 'skills-unavailable', message: (error as Error).message },
        };
      }
    },
    async sessionSkillCatalog(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      if (deps.skills === undefined) return { ok: true, value: { skills: [] } };
      const cwd = owner.cwdReference;
      const workspaceIds = new Set(
        deps.skills
          .workspaces([slug])
          .filter((workspace) => cwd !== undefined && workspace.path === cwd)
          .map((workspace) => workspace.workspaceId),
      );
      try {
        return {
          ok: true,
          value: { skills: sessionSkills(await deps.skills.list([slug]), slug, workspaceIds) },
        };
      } catch (error) {
        return {
          ok: false,
          error: { code: 'skills-unavailable', message: (error as Error).message },
        };
      }
    },
    async botSkills(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const memoryDir =
        deps.registry.get(slug) === undefined ? undefined : deps.registry.memoryDirFor(slug);
      if (memoryDir === undefined) return unknownBot(slug);
      try {
        return { ok: true, value: { skills: await listBotSkills(memoryDir) } };
      } catch (error) {
        return {
          ok: false,
          error: { code: 'skills-unavailable', message: (error as Error).message },
        };
      }
    },
    async skillShow(payload) {
      const source = asObject(payload);
      const name = asNonBlank(source, 'name');
      const ownerKey = asNonBlank(source, 'owner');
      const owner = ownerKey === undefined ? undefined : parseSkillOwnerKey(ownerKey);
      if (name === undefined || owner === undefined)
        return invalidInput('name and owner (host, bot:<slug> or workspace:<id>) are required');
      const missing = (): BridgeResult<never> => ({
        ok: false,
        error: { code: 'skill-not-found', message: `Skill not found: ${ownerKey}/${name}` },
      });
      try {
        if (owner.kind === 'bot') {
          const memoryDir =
            deps.registry.get(owner.botSlug) === undefined
              ? undefined
              : deps.registry.memoryDirFor(owner.botSlug);
          if (memoryDir === undefined) return unknownBot(owner.botSlug);
          const skill = await readBotSkill(memoryDir, name);
          if (skill === undefined) return missing();
          return {
            ok: true,
            value: {
              skill: {
                name: skill.name,
                description: skill.description,
                owner,
                path: skill.path,
                content: skill.content,
              },
            },
          };
        }
        if (deps.skills === undefined) return missing();
        const bots = deps.registry
          .list()
          .filter((bot) => bot.paused !== true)
          .map((bot) => bot.slug);
        const viewer = bots[0];
        if (viewer === undefined) return missing();
        const resolved = await deps.skills.resolve(name, owner, viewer, bots);
        if (resolved === undefined) return missing();
        const listed = (await deps.skills.list(bots)).find(
          (entry) =>
            entry.name === name && skillOwnerKey(entry.owner) === skillOwnerKey(resolved.owner),
        );
        return {
          ok: true,
          value: {
            skill: {
              name: resolved.name,
              description: listed?.description ?? '',
              owner: resolved.owner,
              ...(resolved.path === undefined ? {} : { path: resolved.path }),
              content: resolved.content,
            },
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: { code: 'skills-unavailable', message: (error as Error).message },
        };
      }
    },
    async botSkillRemove(payload) {
      const slug = asSlug(payload);
      const name = asNonBlank(asObject(payload), 'name');
      if (slug === undefined || name === undefined)
        return invalidInput('slug and name are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      try {
        requireOwnedBot(slug);
      } catch {
        return unknownBot(slug);
      }
      const memoryDir = deps.registry.memoryDirFor(slug);
      if (memoryDir === undefined) return unknownBot(slug);
      try {
        const result = await removeBotSkill(memoryDir, name);
        return { ok: true, value: result };
      } catch (error) {
        if (error instanceof BotSkillNotFoundError)
          return { ok: false, error: { code: 'skill-not-found', message: error.message } };
        if (error instanceof BotSkillIgnoredFilesError)
          return { ok: false, error: { code: 'skill-has-ignored-files', message: error.message } };
        return {
          ok: false,
          error: { code: 'skills-unavailable', message: (error as Error).message },
        };
      } finally {
        deps.skills?.invalidateMemory(slug);
      }
    },
  };
}
