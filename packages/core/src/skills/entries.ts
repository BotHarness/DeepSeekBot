import { isValidSlug } from '../bots/slug.js';

export type SkillOwner =
  | { kind: 'host' }
  | { kind: 'bot'; botSlug: string }
  | { kind: 'workspace'; workspaceId: string; name: string };

export function isSkillWorkspaceId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\s\p{Cc}]/u.test(value)
  );
}

export interface SkillCatalogEntry {
  name: string;
  description: string;
  owner: SkillOwner;
  path?: string;
}

export function skillOwnerKey(owner: SkillOwner): string {
  return owner.kind === 'host'
    ? 'host'
    : owner.kind === 'bot'
      ? `bot:${owner.botSlug}`
      : `workspace:${owner.workspaceId}`;
}

export function parseSkillOwnerKey(value: string): SkillOwner | undefined {
  if (value === 'host') return { kind: 'host' };
  if (value.startsWith('workspace:')) {
    const workspaceId = value.slice(10);
    return isSkillWorkspaceId(workspaceId)
      ? { kind: 'workspace', workspaceId, name: workspaceId }
      : undefined;
  }
  if (!value.startsWith('bot:')) return undefined;
  const botSlug = value.slice(4);
  return isValidSlug(botSlug) ? { kind: 'bot', botSlug } : undefined;
}

export function rankSkillEntries<T extends { name: string; description: string }>(
  entries: readonly T[],
  rawQuery: string,
  ownerNames?: (entry: T) => readonly string[],
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
    if (ownerNames?.(entry).some((name) => name.toLowerCase().includes(query))) return 2;
    if (entry.description.toLowerCase().includes(query)) return 3;
    return 4;
  };
  return entries
    .map((entry, index) => ({ entry, index, tier: tier(entry) }))
    .filter((item) => item.tier < 4)
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((item) => item.entry);
}
