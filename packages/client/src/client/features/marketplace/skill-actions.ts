import { marketplaceSkillUploadActions } from '@botharness/host-client/marketplace-skills';
import type { HostCall } from '@botharness/host-client/host-answer';
import type {
  MarketplaceSkill,
  MarketplaceSkillAddCandidates,
  MarketplaceSkillAddResult,
  MarketplaceSkillConflictChoice,
  MarketplaceSkillDetail,
  MarketplaceSkillPage,
  MarketplaceSkillSection,
  MarketplaceSkillPublication,
  MarketplaceSkillReplacement,
  MarketplaceSkillReview,
  MarketplaceSkillTargets,
} from '@botharness/host-protocol/marketplace-skill';
import type { InvokeAction } from '../../actions.js';

export interface MarketplaceSkillActions {
  marketplaceSkillList(query?: { q?: string; cursor?: string }): Promise<MarketplaceSkillPage>;
  marketplaceSkillSections(): Promise<MarketplaceSkillSection[]>;
  marketplaceSkillDetail(id: string): Promise<MarketplaceSkillDetail>;
  marketplaceSkillAddCandidates(): Promise<MarketplaceSkillAddCandidates>;
  marketplaceSkillReview(id: string): Promise<MarketplaceSkillReview>;
  marketplaceSkillAdd(
    id: string,
    reviewId: string,
    targets: MarketplaceSkillTargets,
    onConflict?: MarketplaceSkillConflictChoice,
  ): Promise<MarketplaceSkillAddResult>;
  marketplaceSkillPublish(input: MarketplaceSkillPublication): Promise<MarketplaceSkill>;
  marketplaceSkillReplace(input: MarketplaceSkillReplacement): Promise<MarketplaceSkill>;
  marketplaceSkillMine(): Promise<{ skills: MarketplaceSkill[] }>;
  marketplaceSkillDelete(id: string): Promise<{ deleted: true }>;
  marketplaceSkillReport(id: string, altcha: string, reason?: string): Promise<void>;
}

export function createMarketplaceSkillActions(
  invoke: InvokeAction,
  host: HostCall,
): MarketplaceSkillActions {
  return {
    ...marketplaceSkillUploadActions(host),
    marketplaceSkillList: (query = {}) =>
      invoke('marketplaceSkillList', {
        ...(query.q === undefined || query.q === '' ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
    marketplaceSkillSections: () => invoke('marketplaceSkillSections', {}),
    marketplaceSkillDetail: (id) => invoke('marketplaceSkillDetail', { id }),
    marketplaceSkillAddCandidates: () => invoke('marketplaceSkillAddCandidates', {}),
    marketplaceSkillReview: (id) => invoke('marketplaceSkillReview', { id }),
    marketplaceSkillAdd: (id, reviewId, targets, onConflict) =>
      invoke('marketplaceSkillAdd', {
        id,
        reviewId,
        ...(targets.bots.length === 0 ? {} : { bots: targets.bots }),
        ...(targets.global ? { global: true } : {}),
        ...(onConflict === undefined ? {} : { onConflict }),
      }),
  };
}
