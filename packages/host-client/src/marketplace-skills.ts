import {
  parseMarketplaceSkill,
  parseMarketplaceSkillPage,
  type MarketplaceSkillPublication,
  type MarketplaceSkillReplacement,
} from '@botharness/host-protocol/marketplace-skill';
import { HostAnswerInvalid, record, type HostCall } from './host-answer';

export function marketplaceSkillUploadActions(host: HostCall) {
  const write = async (
    method: 'marketplaceSkillPublish' | 'marketplaceSkillReplace',
    input: MarketplaceSkillPublication | MarketplaceSkillReplacement,
  ) => {
    const skill = parseMarketplaceSkill(await host.call(method, { ...input }));
    if (skill?.upload === undefined)
      throw new HostAnswerInvalid(`${method} returned no uploaded Skill.`);
    return skill;
  };

  return {
    marketplaceSkillPublish(input: MarketplaceSkillPublication) {
      return write('marketplaceSkillPublish', input);
    },
    marketplaceSkillReplace(input: MarketplaceSkillReplacement) {
      return write('marketplaceSkillReplace', input);
    },
    async marketplaceSkillMine() {
      const result = record(await host.call('marketplaceSkillMine', {}));
      const page = parseMarketplaceSkillPage({ skills: result?.['skills'], nextCursor: null });
      if (page === undefined || page.skills.some((skill) => skill.upload === undefined))
        throw new HostAnswerInvalid('marketplaceSkillMine returned invalid uploads.');
      return { skills: page.skills };
    },
    async marketplaceSkillDelete(id: string): Promise<{ deleted: true }> {
      const result = record(await host.call('marketplaceSkillDelete', { id }));
      if (result?.['deleted'] !== true)
        throw new HostAnswerInvalid('marketplaceSkillDelete returned no receipt.');
      return { deleted: true };
    },
    async marketplaceSkillReport(id: string, altcha: string, reason?: string) {
      await host.call('marketplaceSkillReport', {
        id,
        altcha,
        ...(reason === undefined ? {} : { reason }),
      });
    },
  };
}
