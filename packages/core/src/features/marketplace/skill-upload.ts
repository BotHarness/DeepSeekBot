import { randomUUID } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, posix } from 'node:path';
import {
  MARKETPLACE_SKILL_ID,
  MARKETPLACE_SKILL_REVISION,
  type MarketplaceSkill,
} from '@botharness/host-protocol/marketplace-skill';
import {
  MAX_SKILL_BYTES,
  MAX_SKILL_FILES,
  MAX_SKILL_NAME,
  SKILL_NAME,
  scanSkillUpload,
} from '../../../../market/src/skill-scan.js';
import { listBotFiles } from '../../bots/bot-zip.js';
import type { HumanContext } from '../../humans/context.js';
import { asObject, invalidInput, type BridgeResult } from '../../kernel/method-utils.js';
import { readBotSkill } from '../../skills/bot-skills.js';
import { ownsBot } from '../../team-policy/bot-access.js';
import type { MarketplaceBridgeDeps } from './methods.js';

export type MarketplaceSkillUploadMethods = {
  marketplaceSkillPublish(payload: unknown): Promise<BridgeResult<MarketplaceSkill>>;
  marketplaceSkillReplace(payload: unknown): Promise<BridgeResult<MarketplaceSkill>>;
  marketplaceSkillMine(payload: unknown): Promise<BridgeResult<{ skills: MarketplaceSkill[] }>>;
  marketplaceSkillDelete(payload: unknown): Promise<BridgeResult<{ deleted: true }>>;
};

const refusal = (code: string, message = code): BridgeResult<never> => ({
  ok: false,
  error: { code, message },
});

const refusalMessages: Record<string, string> = {
  'skill-secret-detected':
    'A file contains a possible credential or private key. Remove it before publishing.',
  'skill-malicious-content':
    'The safety scan found a download-and-execute pattern. Remove it before publishing.',
  'invalid-skill-upload': 'Use supported text, script, or image files with safe filenames.',
  'invalid-skill-md': 'SKILL.md needs a valid name and description.',
  'skill-too-large': 'A Skill may contain up to 100 files totaling 1 MiB.',
  'author-required': 'Set up your Marketplace Author ID before publishing.',
  'sign-in-required': 'Sign in to Connect before publishing.',
  'skill-scan-failed': 'The safety scan could not check these files, so nothing was uploaded.',
  'skill-name-taken': 'This Skill name is already listed. Use skills mine to find its listing ID.',
};

const decoder = new TextDecoder();

function scanBeforeUpload(files: readonly { path: string; data: string }[]) {
  try {
    const result = scanSkillUpload(
      files.map(({ path, data }) => ({
        path,
        text: decoder.decode(Buffer.from(data, 'base64')),
      })),
    );
    return result.kind === 'accepted'
      ? undefined
      : refusal(result.code, refusalMessages[result.code]);
  } catch {
    return refusal('skill-scan-failed', refusalMessages['skill-scan-failed']);
  }
}

async function collectSkillFiles(memoryDir: string, name: string) {
  const root = await realpath(memoryDir);
  const skill = await readBotSkill(root, name);
  if (skill === undefined) return refusal('skill-not-found');
  const parent = posix.dirname(skill.path);
  const skillRoots = await Promise.all(
    ['.agents', '.dsh'].map((base) => realpath(join(root, base, 'skills')).catch(() => undefined)),
  );
  const folder =
    posix.basename(skill.path) === 'SKILL.md' && !skillRoots.includes(join(root, parent));
  const scope = folder ? parent : skill.path;
  const paths = listBotFiles(root, scope);
  if (!paths.includes(skill.path)) return refusal('skill-files-unavailable');
  if (paths.length > MAX_SKILL_FILES)
    return refusal('skill-too-large', refusalMessages['skill-too-large']);

  const files: { path: string; data: string }[] = [];
  const buffer = Buffer.alloc(MAX_SKILL_BYTES + 1);
  let total = 0;
  for (const path of paths) {
    const full = join(root, path);
    if ((await realpath(full)) !== full || !(await lstat(full)).isFile())
      return refusal('invalid-skill-upload', refusalMessages['invalid-skill-upload']);
    const file = await open(full, 'r');
    try {
      const size = (await file.stat()).size;
      if (size + total > MAX_SKILL_BYTES)
        return refusal('skill-too-large', refusalMessages['skill-too-large']);
      let offset = 0;
      while (offset <= size) {
        const { bytesRead } = await file.read(buffer, offset, size + 1 - offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== size) return refusal('skill-files-changed');
      files.push({
        path: folder ? posix.relative(scope, path) : 'SKILL.md',
        data: buffer.subarray(0, size).toString('base64'),
      });
      total += size;
    } finally {
      await file.close();
    }
  }
  return { ok: true, value: files } as const;
}

export function createMarketplaceSkillUploadMethods(
  human: HumanContext,
  deps: Pick<MarketplaceBridgeDeps, 'marketplaceUploads' | 'registry'>,
  isHostOwner: () => boolean,
): MarketplaceSkillUploadMethods {
  const { marketplaceUploads: uploads } = deps;
  const permitted = () => isHostOwner() && human.caller !== 'bot';
  const denied = () =>
    refusal('permission-required', 'Only the Host owner may manage Marketplace Skill uploads');
  const unavailable = () => refusal('marketplace-unavailable');

  const write = async (
    payload: unknown,
    replacing: boolean,
  ): Promise<BridgeResult<MarketplaceSkill>> => {
    if (!permitted()) return denied();
    if (uploads === undefined) return unavailable();
    const { bot, name, id, expectedAuthorId, requestKey } = asObject(payload);
    if (
      typeof bot !== 'string' ||
      typeof name !== 'string' ||
      !SKILL_NAME.test(name) ||
      name.length > MAX_SKILL_NAME
    )
      return invalidInput('a Bot and Skill name are required');
    if (replacing && (typeof id !== 'string' || !MARKETPLACE_SKILL_ID.test(id)))
      return invalidInput('invalid Skill ID');
    if (expectedAuthorId !== undefined && typeof expectedAuthorId !== 'string')
      return invalidInput('invalid Author ID');
    if (
      requestKey !== undefined &&
      (typeof requestKey !== 'string' || !MARKETPLACE_SKILL_REVISION.test(requestKey))
    )
      return invalidInput('invalid request key');

    const record = deps.registry.get(bot);
    const memoryDir = deps.registry.memoryDirFor(bot);
    if (record === undefined || memoryDir === undefined || !ownsBot(human, record))
      return refusal('skill-not-found');

    const account = await uploads.account();
    if (!account.ok) return refusal(account.code, refusalMessages[account.code]);
    if (!account.value.signedIn)
      return refusal('sign-in-required', refusalMessages['sign-in-required']);
    if (account.value.author?.termsAcceptedAt == null)
      return refusal('author-required', refusalMessages['author-required']);
    if (expectedAuthorId !== undefined && expectedAuthorId !== account.value.author.id)
      return refusal('author-changed');

    const files = await collectSkillFiles(memoryDir, name).catch(() =>
      refusal('skill-files-unavailable'),
    );
    if (!files.ok) return files;
    const refused = scanBeforeUpload(files.value);
    if (refused !== undefined) return refused;
    const result = await uploads.writeSkill(
      {
        files: files.value,
        requestKey: requestKey ?? randomUUID().replaceAll('-', ''),
        expectedAuthorId: account.value.author.id,
      },
      replacing && typeof id === 'string' ? id : undefined,
    );
    if (!result.ok && result.code === 'skill-name-taken' && result.listingId !== undefined)
      return refusal(
        result.code,
        `This Skill name is already listed. Use skills replace ${result.listingId} ${name} --bot ${bot} --confirm.`,
      );
    return result.ok ? result : refusal(result.code, refusalMessages[result.code]);
  };

  return {
    marketplaceSkillPublish: (payload) => write(payload, false),
    marketplaceSkillReplace: (payload) => write(payload, true),
    async marketplaceSkillMine() {
      if (!permitted()) return denied();
      if (uploads === undefined) return unavailable();
      const result = await uploads.mineSkills();
      return result.ok ? { ok: true, value: { skills: result.value } } : refusal(result.code);
    },
    async marketplaceSkillDelete(payload) {
      if (!permitted()) return denied();
      if (uploads === undefined) return unavailable();
      const { id } = asObject(payload);
      if (typeof id !== 'string' || !MARKETPLACE_SKILL_ID.test(id))
        return invalidInput('invalid Skill ID');
      const result = await uploads.removeSkill(id);
      return result.ok ? result : refusal(result.code);
    },
  };
}
