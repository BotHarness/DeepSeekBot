import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { SkillCatalogEntry } from '../../skills/catalog.js';
import type { BotSkill } from '../../skills/bot-skills.js';
import type { SkillDetail, SkillsBridgeMethods } from './methods.js';

export async function channelSkillCatalog(
  methods: () => SkillsBridgeMethods,
  channelId: string,
): Promise<{ skills: SkillCatalogEntry[] }> {
  return unwrap(await methods().channelSkillCatalog({ channelId }));
}

export async function sessionSkillCatalog(
  methods: () => SkillsBridgeMethods,
  slug: string,
  sessionId: string,
): Promise<{ skills: SkillCatalogEntry[] }> {
  return unwrap(await methods().sessionSkillCatalog({ slug, sessionId }));
}

export async function botSkills(
  methods: () => SkillsBridgeMethods,
  slug: string,
): Promise<{ skills: BotSkill[] }> {
  return unwrap(await methods().botSkills({ slug }));
}

export async function skillShow(
  methods: () => SkillsBridgeMethods,
  name: string,
  owner: string,
): Promise<{ skill: SkillDetail }> {
  return unwrap(await methods().skillShow({ name, owner }));
}

export async function botSkillRemove(
  methods: () => SkillsBridgeMethods,
  slug: string,
  name: string,
): Promise<{ name: string; removed: string }> {
  return unwrap(await methods().botSkillRemove({ slug, name }));
}

export const skillRpc = {
  channelSkillCatalog(channelId: string): Promise<{ skills: SkillCatalogEntry[] }> {
    return channelSkillCatalog(() => this.methods, channelId);
  },

  sessionSkillCatalog(slug: string, sessionId: string): Promise<{ skills: SkillCatalogEntry[] }> {
    return sessionSkillCatalog(() => this.methods, slug, sessionId);
  },

  botSkills(slug: string): Promise<{ skills: BotSkill[] }> {
    return botSkills(() => this.methods, slug);
  },

  skillShow(name: string, owner: string): Promise<{ skill: SkillDetail }> {
    return skillShow(() => this.methods, name, owner);
  },

  botSkillRemove(slug: string, name: string): Promise<{ name: string; removed: string }> {
    return botSkillRemove(() => this.methods, slug, name);
  },
} satisfies ThisType<BridgeRpcReceiver>;
