import { loadSkillCatalog } from '@botharness/host-client/skill-catalog';
import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';

type SkillCatalogEntry = Awaited<ReturnType<typeof loadSkillCatalog>>[number];
type SkillOwner = SkillCatalogEntry['owner'];

export function parseSkillOwner(
  owner: Record<string, unknown> | undefined,
): SkillOwner | undefined {
  if (owner?.['kind'] === 'host') return { kind: 'host' };
  if (owner?.['kind'] === 'bot' && typeof owner['botSlug'] === 'string')
    return { kind: 'bot', botSlug: owner['botSlug'] };
  if (
    owner?.['kind'] === 'workspace' &&
    typeof owner['workspaceId'] === 'string' &&
    owner['workspaceId'] !== '' &&
    typeof owner['name'] === 'string'
  )
    return {
      kind: 'workspace',
      workspaceId: owner['workspaceId'],
      name: owner['name'],
    };
  return undefined;
}

export interface BotSkillRow {
  name: string;
  description: string;
  path: string;
  userInvocable: boolean;
}

export interface SkillDetailView {
  name: string;
  description: string;
  owner: SkillOwner;
  path?: string;
  content: string;
}

export async function loadBotSkills(call: BridgeCall, slug: string): Promise<BotSkillRow[]> {
  const value = asRecord(await unwrap(call, 'botSkills', { slug }));
  if (!Array.isArray(value?.['skills'])) throw new Error('invalid botSkills response');
  return value['skills'].flatMap((entry: unknown): BotSkillRow[] => {
    const item = asRecord(entry);
    const name = item?.['name'];
    const description = item?.['description'];
    const path = item?.['path'];
    if (typeof name !== 'string' || typeof description !== 'string' || typeof path !== 'string')
      return [];
    return [
      {
        name,
        description,
        path,
        userInvocable: item?.['userInvocable'] !== false,
      },
    ];
  });
}

export async function loadSkillDetail(
  call: BridgeCall,
  name: string,
  owner: string,
): Promise<SkillDetailView> {
  const skill = asRecord(asRecord(await unwrap(call, 'skillShow', { name, owner }))?.['skill']);
  const parsedOwner = parseSkillOwner(asRecord(skill?.['owner']));
  const content = skill?.['content'];
  if (
    typeof skill?.['name'] !== 'string' ||
    typeof content !== 'string' ||
    parsedOwner === undefined
  )
    throw new Error('invalid skillShow response');
  const path = skill['path'];
  return {
    name: skill['name'],
    description: typeof skill['description'] === 'string' ? skill['description'] : '',
    owner: parsedOwner,
    ...(typeof path === 'string' ? { path } : {}),
    content,
  };
}

export async function removeBotSkill(call: BridgeCall, slug: string, name: string): Promise<void> {
  await unwrap(call, 'botSkillRemove', { slug, name });
}

export async function loadChannelSkillCatalog(
  call: BridgeCall,
  channelId: string,
): Promise<SkillCatalogEntry[]> {
  return loadSkillCatalog(bridgeHost(call), channelId);
}

export async function loadSessionSkillCatalog(
  call: BridgeCall,
  slug: string,
  sessionId: string,
): Promise<SkillCatalogEntry[]> {
  return skillCatalogEntries(await unwrap(call, 'sessionSkillCatalog', { slug, sessionId }));
}

function skillCatalogEntries(response: unknown): SkillCatalogEntry[] {
  const value = asRecord(response);
  if (!Array.isArray(value?.['skills'])) throw new Error('invalid Skill catalog response');
  return value['skills'].flatMap((entry: unknown): SkillCatalogEntry[] => {
    const item = asRecord(entry);
    const owner = asRecord(item?.['owner']);
    const name = item?.['name'];
    const description = item?.['description'];
    if (typeof name !== 'string' || typeof description !== 'string') return [];
    const parsedOwner = parseSkillOwner(owner);
    if (parsedOwner === undefined) return [];
    const path = item?.['path'];
    return [
      {
        name,
        description,
        owner: parsedOwner,
        ...(typeof path === 'string' ? { path } : {}),
      },
    ];
  });
}
