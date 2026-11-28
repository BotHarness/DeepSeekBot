import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MARKETPLACE_SKILL_ID,
  type MarketplaceSkillAdded,
} from '@botharness/host-protocol/marketplace-skill';
import { parseSkillDocument, readSkillDocumentMetadata } from '../skills/skill-document.js';

export async function addedMarketplaceSkills(
  skillsDir: string,
  target: MarketplaceSkillAdded['target'],
): Promise<MarketplaceSkillAdded[]> {
  const folders = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    folders
      .filter((folder) => folder.isDirectory() && !folder.name.startsWith('.'))
      .map(async (folder): Promise<MarketplaceSkillAdded | undefined> => {
        const text = await readFile(join(skillsDir, folder.name, 'SKILL.md'), 'utf8').catch(
          () => undefined,
        );
        if (text === undefined) return undefined;
        const { source, hash } = readSkillDocumentMetadata(text);
        const document = parseSkillDocument(text);
        if (source === undefined || !MARKETPLACE_SKILL_ID.test(source) || document === undefined)
          return undefined;
        return {
          id: source,
          name: document.name,
          description: document.description,
          target,
          hash: hash ?? '',
        };
      }),
  );
  return found
    .filter((skill) => skill !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}
