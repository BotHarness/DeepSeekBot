import {
  loadMarketplaceDetail,
  loadMarketplaceFile,
  loadMarketplacePage,
  loadMarketplaceTopics,
  loadMarketplaceSections,
  loadMarketplaceDigests,
  loadMarketplaceDigest,
  submitMarketplaceRepository,
  loadMarketplaceChallenge,
  reportMarketplaceBot,
  installMarketplaceBot,
  reviewMarketplaceInstall,
  loadMyMarketplaceUploads,
  uploadMarketplaceBot,
  type BridgeCall,
} from './bridge.js';
import type { InvokeAction, BridgeActions } from './actions.js';
import type { createBotActions } from './actions-bots.js';

export interface MarketplaceActions {
  marketplaceReport(id: string, altcha: string, reason?: string): Promise<void>;
  marketplaceDelete(id: string): Promise<void>;
  shareDraftDiscard(slug: string): Promise<void>;
  shareDraftExport(slug: string): Promise<{ path: string; files: number }>;
}

export function createMarketplaceActions(
  call: BridgeCall,
  invoke: InvokeAction,
  openCreatedBot: ReturnType<typeof createBotActions>['openCreatedBot'],
) {
  return {
    marketplaceList: (query) => loadMarketplacePage(call, query),
    marketplaceChallenge: () => loadMarketplaceChallenge(call),
    marketplaceSubmit: (url, altcha) => submitMarketplaceRepository(call, url, altcha),
    marketplaceReport: (id, altcha, reason) => reportMarketplaceBot(call, id, altcha, reason),
    marketplaceTopics: () => loadMarketplaceTopics(call),
    marketplaceSections: (lang) => loadMarketplaceSections(call, lang),
    marketplaceDigests: (lang) => loadMarketplaceDigests(call, lang),
    marketplaceDigest: (day, lang) => loadMarketplaceDigest(call, day, lang),
    marketplaceDetail: (id, lang) => loadMarketplaceDetail(call, id, lang),
    marketplaceFile: (id, path) => loadMarketplaceFile(call, id, path),
    marketplaceAccount: () => invoke('marketplaceAccount', {}),
    marketplaceAuthorSave: (displayName, acceptTerms) =>
      invoke('marketplaceAuthorSave', { displayName, acceptTerms }),
    marketplaceAuthorAvatarSet: (avatar) => invoke('marketplaceAuthorAvatarSet', { avatar }),
    marketplaceUploadPlan: (slug) => invoke('marketplaceUploadPlan', { slug }),
    marketplaceUpload: (slug, presentation) => uploadMarketplaceBot(call, slug, presentation),
    marketplaceMine: (lang) => loadMyMarketplaceUploads(call, lang),
    async marketplaceDelete(id) {
      await invoke('marketplaceDelete', { id });
    },
    shareDraftStart: (slug) => invoke('shareDraftStart', { slug }),
    async shareDraftDiscard(slug) {
      await invoke('shareDraftDiscard', { slug });
    },
    shareDraftExport: (slug) => invoke('shareDraftExport', { slug }),
    marketplaceInstallReview: (id, lang) => reviewMarketplaceInstall(call, id, lang),
    async marketplaceInstall(id, reviewId, sectionId, source) {
      return openCreatedBot(await installMarketplaceBot(call, id, reviewId, source), sectionId);
    },
  } satisfies MarketplaceActions &
    Pick<
      BridgeActions,
      | 'marketplaceList'
      | 'marketplaceChallenge'
      | 'marketplaceSubmit'
      | 'marketplaceTopics'
      | 'marketplaceSections'
      | 'marketplaceDigests'
      | 'marketplaceDigest'
      | 'marketplaceDetail'
      | 'marketplaceFile'
      | 'marketplaceAccount'
      | 'marketplaceAuthorSave'
      | 'marketplaceAuthorAvatarSet'
      | 'marketplaceUploadPlan'
      | 'marketplaceUpload'
      | 'marketplaceMine'
      | 'shareDraftStart'
      | 'marketplaceInstallReview'
      | 'marketplaceInstall'
    >;
}
