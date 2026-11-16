import { isValidSlug } from '../../../../packages/core/src/bots/slug';
import {
  isSkillWorkspaceId,
  type SkillCatalogEntry,
  type SkillOwner,
} from '../../../../packages/core/src/skills/entries';
import type { HostClient } from './client';
import type { WireSkillInvocation } from './wire';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function skillOwnerOf(value: unknown): SkillOwner | undefined {
  const owner = record(value);
  if (owner?.['kind'] === 'host') return { kind: 'host' };
  if (
    owner?.['kind'] === 'bot' &&
    typeof owner['botSlug'] === 'string' &&
    isValidSlug(owner['botSlug'])
  )
    return { kind: 'bot', botSlug: owner['botSlug'] };
  if (
    owner?.['kind'] === 'workspace' &&
    isSkillWorkspaceId(owner['workspaceId']) &&
    typeof owner['name'] === 'string'
  )
    return { kind: 'workspace', workspaceId: owner['workspaceId'], name: owner['name'] };
  return undefined;
}

export function skillInvocationsOf(body: string, value: unknown): WireSkillInvocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    const name = item?.['name'];
    const start = item?.['start'];
    const end = item?.['end'];
    const owner = skillOwnerOf(item?.['owner']);
    if (
      typeof name !== 'string' ||
      !SKILL_NAME.test(name) ||
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      owner === undefined ||
      body.slice(start, end) !== '/' + name
    )
      return [];
    return [{ name, owner, start, end }];
  });
}

export function skillCatalogOf(value: unknown): SkillCatalogEntry[] {
  const skills = record(value)?.['skills'];
  if (!Array.isArray(skills)) throw new Error('invalid channelSkillCatalog response');
  return skills.flatMap((entry) => {
    const item = record(entry);
    const name = item?.['name'];
    const description = item?.['description'];
    const owner = skillOwnerOf(item?.['owner']);
    if (
      typeof name !== 'string' ||
      !SKILL_NAME.test(name) ||
      typeof description !== 'string' ||
      owner === undefined
    )
      return [];
    return [{ name, description, owner }];
  });
}

export async function loadSkillCatalog(
  client: Pick<HostClient, 'call'>,
  channelId: string,
): Promise<SkillCatalogEntry[]> {
  return skillCatalogOf(await client.call<unknown>('channelSkillCatalog', { channelId }));
}
