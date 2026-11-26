import type {
  MarketplaceSkillAddCandidates,
  MarketplaceSkillAddResult,
  MarketplaceSkillConflictChoice,
  MarketplaceSkillDetail,
  MarketplaceSkillPage,
  MarketplaceSkillReview,
} from '@botharness/host-protocol/marketplace-skill';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';

export const marketplaceSkillRpc = {
  async marketplaceSkillList(q?: string, cursor?: string): Promise<MarketplaceSkillPage> {
    return unwrapAsync(this.methods.marketplaceSkillList({ q, cursor }));
  },

  async marketplaceSkillDetail(id: string): Promise<MarketplaceSkillDetail> {
    return unwrapAsync(this.methods.marketplaceSkillDetail({ id }));
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
