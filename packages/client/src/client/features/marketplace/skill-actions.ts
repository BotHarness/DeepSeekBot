import type {
  MarketplaceSkillAddCandidates,
  MarketplaceSkillAddResult,
  MarketplaceSkillConflictChoice,
  MarketplaceSkillDetail,
  MarketplaceSkillPage,
  MarketplaceSkillReview,
  MarketplaceSkillTargets,
} from '@botharness/host-protocol/marketplace-skill';
import type { InvokeAction } from '../../actions.js';

export interface MarketplaceSkillActions {
  marketplaceSkillList(query?: { q?: string; cursor?: string }): Promise<MarketplaceSkillPage>;
  marketplaceSkillDetail(id: string): Promise<MarketplaceSkillDetail>;
  marketplaceSkillAddCandidates(): Promise<MarketplaceSkillAddCandidates>;
  marketplaceSkillReview(id: string): Promise<MarketplaceSkillReview>;
  marketplaceSkillAdd(
    id: string,
    reviewId: string,
    targets: MarketplaceSkillTargets,
    onConflict?: MarketplaceSkillConflictChoice,
  ): Promise<MarketplaceSkillAddResult>;
}

export function createMarketplaceSkillActions(invoke: InvokeAction): MarketplaceSkillActions {
  return {
    marketplaceSkillList: (query = {}) =>
      invoke('marketplaceSkillList', {
        ...(query.q === undefined || query.q === '' ? {} : { q: query.q }),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
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
