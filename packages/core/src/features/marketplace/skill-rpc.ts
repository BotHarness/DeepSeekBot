import type {
  MarketplaceSkill,
  MarketplaceSkillAddCandidates,
  MarketplaceSkillAddedList,
  MarketplaceSkillAddResult,
  MarketplaceSkillConflictChoice,
  MarketplaceSkillDetail,
  MarketplaceSkillPage,
  MarketplaceSkillSection,
  MarketplaceSkillReview,
} from '@botharness/host-protocol/marketplace-skill';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../kernel/rpc-result.js';

export const marketplaceSkillRpc = {
  async marketplaceSkillPublish(
    bot: string,
    name: string,
    expectedAuthorId?: string,
    requestKey?: string,
  ): Promise<MarketplaceSkill> {
    return unwrapAsync(
      this.methods.marketplaceSkillPublish({ bot, name, expectedAuthorId, requestKey }),
    );
  },
  async marketplaceSkillReplace(
    id: string,
    bot: string,
    name: string,
    expectedAuthorId?: string,
  ): Promise<MarketplaceSkill> {
    return unwrapAsync(this.methods.marketplaceSkillReplace({ id, bot, name, expectedAuthorId }));
  },
  async marketplaceSkillMine(): Promise<{ skills: MarketplaceSkill[] }> {
    return unwrapAsync(this.methods.marketplaceSkillMine({}));
  },
  async marketplaceSkillDelete(id: string): Promise<{ deleted: true }> {
    return unwrapAsync(this.methods.marketplaceSkillDelete({ id }));
  },
  async marketplaceSkillReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return unwrapAsync(this.methods.marketplaceSkillReport({ id, altcha, reason }));
  },
  async marketplaceSkillList(q?: string, cursor?: string): Promise<MarketplaceSkillPage> {
    return unwrapAsync(this.methods.marketplaceSkillList({ q, cursor }));
  },

  async marketplaceSkillSections(): Promise<MarketplaceSkillSection[]> {
    return unwrapAsync(this.methods.marketplaceSkillSections({}));
  },

  async marketplaceSkillDetail(id: string): Promise<MarketplaceSkillDetail> {
    return unwrapAsync(this.methods.marketplaceSkillDetail({ id }));
  },

  async marketplaceSkillAdded(): Promise<MarketplaceSkillAddedList> {
    return unwrapAsync(this.methods.marketplaceSkillAdded({}));
  },

  marketplaceSkillAddCandidates(): MarketplaceSkillAddCandidates {
    return unwrap(this.methods.marketplaceSkillAddCandidates({}));
  },

  async marketplaceSkillReview(id: string): Promise<MarketplaceSkillReview> {
    return unwrapAsync(this.methods.marketplaceSkillReview({ id }));
  },

  async marketplaceSkillAdd(
    id: string,
    reviewId: string,
    bots?: string[],
    global?: boolean,
    onConflict?: MarketplaceSkillConflictChoice,
  ): Promise<MarketplaceSkillAddResult> {
    return unwrapAsync(
      this.methods.marketplaceSkillAdd({ id, reviewId, bots, global, onConflict }),
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;
