import { isValidSlug } from '../bots/slug.js';

/** Who a Skill belongs to: the Host (user level) or one PersonaBot's Memory Repository. */
export type SkillOwner = { kind: 'host' } | { kind: 'bot'; botSlug: string };

export interface SkillCatalogEntry {
  name: string;
  description: string;
  owner: SkillOwner;
  path?: string;
}

export function skillOwnerKey(owner: SkillOwner): string {
  return owner.kind === 'host' ? 'host' : `bot:${owner.botSlug}`;
}

export function parseSkillOwnerKey(value: string): SkillOwner | undefined {
  if (value === 'host') return { kind: 'host' };
  if (!value.startsWith('bot:')) return undefined;
  const botSlug = value.slice(4);
  return isValidSlug(botSlug) ? { kind: 'bot', botSlug } : undefined;
}

/**
 * Orders catalog entries for a `/` query: name prefix, then name subsequence,
 * then description substring. Ties keep catalog order.
 */
export function rankSkillEntries<T extends { name: string; description: string }>(
  entries: readonly T[],
  rawQuery: string,
): T[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return [...entries];
  const subsequence = (text: string): boolean => {
    let index = 0;
    for (const char of text) if (char === query[index]) index += 1;
    return index === query.length;
  };
  const tier = (entry: T): number => {
    const name = entry.name.toLowerCase();
    if (name.startsWith(query)) return 0;
    if (subsequence(name)) return 1;
    if (entry.description.toLowerCase().includes(query)) return 2;
    return 3;
  };
  return entries
    .map((entry, index) => ({ entry, index, tier: tier(entry) }))
    .filter((item) => item.tier < 3)
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((item) => item.entry);
}
