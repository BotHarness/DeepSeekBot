import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import type { MarketplaceAvatarEdit } from '@botharness/host-protocol/marketplace-avatar';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type {
  MarketplaceAvatar,
  MarketplaceAvatarApplyCandidate,
  MarketplaceAvatarPage,
  MarketplaceAvatarRanking,
  MarketplaceAvatarTag,
} from '@botharness/host-protocol/marketplace-avatar';
import type { BotCreationReceipt } from '../../bots/creation.js';
import type { BotZipUploadStatus } from '../../bots/zip-upload.js';
import type { BotZipPreview } from '../../bots/zip-import.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceAuthorAccount,
  MarketplaceDetail,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplaceInstallSource,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceSection,
  MarketplaceTopic,
} from '../../marketplace/client.js';
import type { AltchaChallenge } from '../../marketplace/altcha.js';
import type { MarketplaceAccount, UploadPlan } from '../../marketplace/uploaded-bots.js';
import type { InstallReviewResult } from '../../marketplace/install-review.js';
import type { ShareDraftView } from '../../marketplace/share-draft.js';
import type { MarketplaceLanguage } from '../../marketplace/language.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { MarketplaceBridgeMethods } from './methods.js';

export function zipUploadBegin(
  methods: MarketplaceBridgeMethods,
  uploadKey: string,
  sha256: string,
  sizeBytes: number,
): BotZipUploadStatus {
  return unwrap(methods.zipUploadBegin({ uploadKey, sha256, sizeBytes }));
}

export function zipUploadChunk(
  methods: MarketplaceBridgeMethods,
  uploadKey: string,
  sha256: string,
  sizeBytes: number,
  offset: number,
  dataBase64: string,
): BotZipUploadStatus {
  return unwrap(
    methods.zipUploadChunk({
      uploadKey,
      sha256,
      sizeBytes,
      offset,
      dataBase64,
    }),
  );
}

export function zipUploadPreview(
  methods: MarketplaceBridgeMethods,
  uploadKey: string,
  sha256: string,
  sizeBytes: number,
): BotZipPreview {
  return unwrap(methods.zipUploadPreview({ uploadKey, sha256, sizeBytes }));
}

export function zipImportLookup(
  methods: MarketplaceBridgeMethods,
  operationKey: string,
  sha256: string,
  displayName: string,
  roles?: string[],
  description?: string,
): { receipt: BotCreationReceipt | null } {
  return unwrap(
    methods.zipImportLookup({
      operationKey,
      sha256,
      displayName,
      roles,
      description,
    }),
  );
}

export async function zipImport(
  methods: MarketplaceBridgeMethods,
  operationKey: string,
  uploadKey: string,
  sha256: string,
  sizeBytes: number,
  displayName: string,
  roles?: string[],
  description?: string,
): Promise<{
  bot: PersonaBotDetail;
  channelId: string;
  receipt?: BotCreationReceipt;
}> {
  return unwrapAsync(
    methods.zipImport({
      operationKey,
      uploadKey,
      sha256,
      sizeBytes,
      displayName,
      roles,
      description,
    }),
  );
}

export async function marketplaceList(
  methods: MarketplaceBridgeMethods,
  query?: MarketplaceQuery,
): Promise<MarketplacePage> {
  return unwrapAsync(methods.marketplaceList(query ?? {}));
}

export async function marketplaceSubmit(
  methods: MarketplaceBridgeMethods,
  url: string,
  altcha: string,
): Promise<{ bot: MarketplaceEntry }> {
  return unwrapAsync(methods.marketplaceSubmit({ url, altcha }));
}

export async function marketplaceChallenge(
  methods: MarketplaceBridgeMethods,
): Promise<AltchaChallenge> {
  return unwrapAsync(methods.marketplaceChallenge());
}

export async function marketplaceReport(
  methods: MarketplaceBridgeMethods,
  id: string,
  altcha: string,
  reason?: string,
): Promise<{ received: true }> {
  return unwrapAsync(
    methods.marketplaceReport({
      id,
      altcha,
      ...(reason === undefined ? {} : { reason }),
    }),
  );
}

export async function marketplaceAvatarReport(
  methods: MarketplaceBridgeMethods,
  id: string,
  altcha: string,
  reason?: string,
): Promise<{ received: true }> {
  return unwrapAsync(
    methods.marketplaceAvatarReport({
      id,
      altcha,
      ...(reason === undefined ? {} : { reason }),
    }),
  );
}

export async function marketplaceTopics(
  methods: MarketplaceBridgeMethods,
): Promise<MarketplaceTopic[]> {
  return unwrapAsync(methods.marketplaceTopics());
}

export async function marketplaceSections(
  methods: MarketplaceBridgeMethods,
  lang?: MarketplaceLanguage,
): Promise<{ sections: MarketplaceSection[] }> {
  return unwrapAsync(methods.marketplaceSections(lang === undefined ? {} : { lang }));
}

export async function marketplaceDigests(
  methods: MarketplaceBridgeMethods,
  lang?: MarketplaceLanguage,
): Promise<{ digests: MarketplaceDigestSummary[] }> {
  return unwrapAsync(methods.marketplaceDigests(lang === undefined ? {} : { lang }));
}

export async function marketplaceDigest(
  methods: MarketplaceBridgeMethods,
  day?: string,
  lang?: MarketplaceLanguage,
): Promise<{ digest: MarketplaceDigest }> {
  return unwrapAsync(
    methods.marketplaceDigest({
      ...(day === undefined ? {} : { day }),
      ...(lang === undefined ? {} : { lang }),
    }),
  );
}

export async function marketplaceAvatarList(
  methods: MarketplaceBridgeMethods,
  cursor?: string,
  q?: string,
  tag?: string,
  sort?: MarketplaceAvatarRanking,
): Promise<MarketplaceAvatarPage> {
  return unwrapAsync(methods.marketplaceAvatarList({ cursor, q, tag, sort }));
}

export async function marketplaceAvatarTags(
  methods: MarketplaceBridgeMethods,
): Promise<MarketplaceAvatarTag[]> {
  return unwrapAsync(methods.marketplaceAvatarTags());
}

export async function marketplaceAvatarDetail(
  methods: MarketplaceBridgeMethods,
  id: string,
): Promise<MarketplaceAvatar> {
  return unwrapAsync(methods.marketplaceAvatarDetail({ id }));
}

export function marketplaceAvatarApplyCandidates(methods: MarketplaceBridgeMethods): {
  bots: MarketplaceAvatarApplyCandidate[];
} {
  return unwrap(methods.marketplaceAvatarApplyCandidates({}));
}

export async function marketplaceAvatarApply(
  methods: MarketplaceBridgeMethods,
  id: string,
  bot: string,
  operationKey?: string,
): Promise<{ applied: true }> {
  return unwrapAsync(methods.marketplaceAvatarApply({ id, bot, operationKey }));
}

export function marketplaceAvatarSource(
  methods: MarketplaceBridgeMethods,
  bot: string,
): {
  image: string;
} {
  return unwrap(methods.marketplaceAvatarSource({ bot }));
}

export async function marketplaceAvatarPublish(
  methods: MarketplaceBridgeMethods,
  name: string,
  image: string,
  requestKey: string,
  confirm: boolean,
  description?: string,
  tags?: string[],
  expectedAuthorId?: string,
): Promise<MarketplaceAvatar> {
  return unwrapAsync(
    methods.marketplaceAvatarPublish({
      name,
      image,
      requestKey,
      confirm,
      description,
      tags,
      expectedAuthorId,
    }),
  );
}

export async function marketplaceDetail(
  methods: MarketplaceBridgeMethods,
  id: string,
  lang?: MarketplaceLanguage,
): Promise<MarketplaceDetail> {
  return unwrapAsync(methods.marketplaceDetail(lang === undefined ? { id } : { id, lang }));
}

export async function marketplaceFileView(
  methods: MarketplaceBridgeMethods,
  id: string,
  path: string,
): Promise<MarketplaceFileView> {
  return unwrapAsync(methods.marketplaceFileView({ id, path }));
}

export async function marketplaceAccount(
  methods: MarketplaceBridgeMethods,
): Promise<MarketplaceAccount> {
  return unwrapAsync(methods.marketplaceAccount());
}

export async function marketplaceAuthorSave(
  methods: MarketplaceBridgeMethods,
  displayName: string,
  acceptTerms?: boolean,
): Promise<MarketplaceAuthorAccount> {
  return unwrapAsync(methods.marketplaceAuthorSave({ displayName, acceptTerms }));
}

export async function marketplaceAuthorAvatarSet(
  methods: MarketplaceBridgeMethods,
  avatar: string | null,
): Promise<MarketplaceAuthorAccount> {
  return unwrapAsync(methods.marketplaceAuthorAvatarSet({ avatar }));
}

export function marketplaceUploadPlan(methods: MarketplaceBridgeMethods, slug: string): UploadPlan {
  return unwrap(methods.marketplaceUploadPlan({ slug }));
}

export async function marketplaceUpload(
  methods: MarketplaceBridgeMethods,
  slug: string,
  displayName: string,
  bio?: string,
  tags?: string[],
  replaces?: string,
): Promise<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }> {
  return unwrapAsync(
    methods.marketplaceUpload({
      slug,
      displayName,
      bio,
      tags,
      replaces,
    }),
  );
}

export async function marketplaceMine(
  methods: MarketplaceBridgeMethods,
  lang?: MarketplaceLanguage,
): Promise<{ bots: MarketplaceAuthoredBot[] }> {
  return unwrapAsync(methods.marketplaceMine(lang === undefined ? {} : { lang }));
}

export async function marketplaceDelete(
  methods: MarketplaceBridgeMethods,
  id: string,
): Promise<{ deleted: true }> {
  return unwrapAsync(methods.marketplaceDelete({ id }));
}

export async function marketplaceInstallReview(
  methods: MarketplaceBridgeMethods,
  id: string,
  lang?: 'en' | 'zh',
): Promise<InstallReviewResult> {
  return unwrapAsync(methods.marketplaceInstallReview(lang === undefined ? { id } : { id, lang }));
}

export function shareDraftStart(methods: MarketplaceBridgeMethods, slug: string): ShareDraftView {
  return unwrap(methods.shareDraftStart({ slug }));
}

export function shareDraftGet(methods: MarketplaceBridgeMethods, slug: string): ShareDraftView {
  return unwrap(methods.shareDraftGet({ slug }));
}

export function shareDraftFile(
  methods: MarketplaceBridgeMethods,
  slug: string,
  path: string,
): { path: string; kind: string; text?: string } {
  return unwrap(methods.shareDraftFile({ slug, path }));
}

export function shareDraftDecide(
  methods: MarketplaceBridgeMethods,
  slug: string,
  path: string,
  decision: 'keep' | 'drop' | 'rewrite',
  text?: string,
): ShareDraftView {
  return unwrap(methods.shareDraftDecide({ slug, path, decision, text }));
}

export function shareDraftFinish(methods: MarketplaceBridgeMethods, slug: string): ShareDraftView {
  return unwrap(methods.shareDraftFinish({ slug }));
}

export function shareDraftDiscard(
  methods: MarketplaceBridgeMethods,
  slug: string,
): { discarded: boolean } {
  return unwrap(methods.shareDraftDiscard({ slug }));
}

export async function shareDraftExport(
  methods: MarketplaceBridgeMethods,
  slug: string,
): Promise<{ path: string; files: number }> {
  return unwrapAsync(methods.shareDraftExport({ slug }));
}

export async function marketplaceInstall(
  methods: MarketplaceBridgeMethods,
  id: string,
  reviewId: string,
  operationKey?: string,
  source?: MarketplaceInstallSource,
): Promise<{
  bot: PersonaBotDetail;
  channelId: string;
  receipt?: BotCreationReceipt;
  listing: MarketplaceEntry;
}> {
  return unwrapAsync(methods.marketplaceInstall({ id, reviewId, operationKey, source }));
}

export async function marketplaceAvatarMine(
  methods: MarketplaceBridgeMethods,
): Promise<{ avatars: MarketplaceAvatar[] }> {
  return unwrapAsync(methods.marketplaceAvatarMine({}));
}

export async function marketplaceAvatarEdit(
  methods: MarketplaceBridgeMethods,
  id: string,
  patch: MarketplaceAvatarEdit,
): Promise<MarketplaceAvatar> {
  return unwrapAsync(methods.marketplaceAvatarEdit({ id, ...patch }));
}

export async function marketplaceAvatarDelete(
  methods: MarketplaceBridgeMethods,
  id: string,
): Promise<{ deleted: true }> {
  return unwrapAsync(methods.marketplaceAvatarDelete({ id }));
}

export const zipImportRpc = {
  zipUploadBegin(uploadKey: string, sha256: string, sizeBytes: number): BotZipUploadStatus {
    return zipUploadBegin(this.methods, uploadKey, sha256, sizeBytes);
  },

  zipUploadChunk(
    uploadKey: string,
    sha256: string,
    sizeBytes: number,
    offset: number,
    dataBase64: string,
  ): BotZipUploadStatus {
    return zipUploadChunk(this.methods, uploadKey, sha256, sizeBytes, offset, dataBase64);
  },

  zipUploadPreview(uploadKey: string, sha256: string, sizeBytes: number): BotZipPreview {
    return zipUploadPreview(this.methods, uploadKey, sha256, sizeBytes);
  },

  zipImportLookup(
    operationKey: string,
    sha256: string,
    displayName: string,
    roles?: string[],
    description?: string,
  ): { receipt: BotCreationReceipt | null } {
    return zipImportLookup(this.methods, operationKey, sha256, displayName, roles, description);
  },

  async zipImport(
    operationKey: string,
    uploadKey: string,
    sha256: string,
    sizeBytes: number,
    displayName: string,
    roles?: string[],
    description?: string,
  ): Promise<{
    bot: PersonaBotDetail;
    channelId: string;
    receipt?: BotCreationReceipt;
  }> {
    return zipImport(
      this.methods,
      operationKey,
      uploadKey,
      sha256,
      sizeBytes,
      displayName,
      roles,
      description,
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const marketplaceServiceRpc = {
  async marketplaceList(query?: MarketplaceQuery): Promise<MarketplacePage> {
    return marketplaceList(this.methods, query);
  },

  async marketplaceSubmit(url: string, altcha: string): Promise<{ bot: MarketplaceEntry }> {
    return marketplaceSubmit(this.methods, url, altcha);
  },

  async marketplaceChallenge(): Promise<AltchaChallenge> {
    return marketplaceChallenge(this.methods);
  },

  async marketplaceReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return marketplaceReport(this.methods, id, altcha, reason);
  },

  async marketplaceAvatarReport(
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<{ received: true }> {
    return marketplaceAvatarReport(this.methods, id, altcha, reason);
  },

  async marketplaceTopics(): Promise<MarketplaceTopic[]> {
    return marketplaceTopics(this.methods);
  },

  async marketplaceSections(
    lang?: MarketplaceLanguage,
  ): Promise<{ sections: MarketplaceSection[] }> {
    return marketplaceSections(this.methods, lang);
  },

  async marketplaceDigests(
    lang?: MarketplaceLanguage,
  ): Promise<{ digests: MarketplaceDigestSummary[] }> {
    return marketplaceDigests(this.methods, lang);
  },

  async marketplaceDigest(
    day?: string,
    lang?: MarketplaceLanguage,
  ): Promise<{ digest: MarketplaceDigest }> {
    return marketplaceDigest(this.methods, day, lang);
  },

  async marketplaceAvatarList(
    cursor?: string,
    q?: string,
    tag?: string,
    sort?: MarketplaceAvatarRanking,
  ): Promise<MarketplaceAvatarPage> {
    return marketplaceAvatarList(this.methods, cursor, q, tag, sort);
  },

  async marketplaceAvatarTags(): Promise<MarketplaceAvatarTag[]> {
    return marketplaceAvatarTags(this.methods);
  },

  async marketplaceAvatarDetail(id: string): Promise<MarketplaceAvatar> {
    return marketplaceAvatarDetail(this.methods, id);
  },

  marketplaceAvatarApplyCandidates(): { bots: MarketplaceAvatarApplyCandidate[] } {
    return marketplaceAvatarApplyCandidates(this.methods);
  },

  async marketplaceAvatarApply(
    id: string,
    bot: string,
    operationKey?: string,
  ): Promise<{ applied: true }> {
    return marketplaceAvatarApply(this.methods, id, bot, operationKey);
  },

  marketplaceAvatarSource(bot: string): { image: string } {
    return marketplaceAvatarSource(this.methods, bot);
  },

  async marketplaceAvatarPublish(
    name: string,
    image: string,
    requestKey: string,
    confirm: boolean,
    description?: string,
    tags?: string[],
    expectedAuthorId?: string,
  ): Promise<MarketplaceAvatar> {
    return marketplaceAvatarPublish(
      this.methods,
      name,
      image,
      requestKey,
      confirm,
      description,
      tags,
      expectedAuthorId,
    );
  },

  async marketplaceAvatarMine(): Promise<{ avatars: MarketplaceAvatar[] }> {
    return marketplaceAvatarMine(this.methods);
  },

  async marketplaceAvatarEdit(
    id: string,
    patch: MarketplaceAvatarEdit,
  ): Promise<MarketplaceAvatar> {
    return marketplaceAvatarEdit(this.methods, id, patch);
  },

  async marketplaceAvatarDelete(id: string): Promise<{ deleted: true }> {
    return marketplaceAvatarDelete(this.methods, id);
  },

  async marketplaceDetail(id: string, lang?: MarketplaceLanguage): Promise<MarketplaceDetail> {
    return marketplaceDetail(this.methods, id, lang);
  },

  async marketplaceFileView(id: string, path: string): Promise<MarketplaceFileView> {
    return marketplaceFileView(this.methods, id, path);
  },

  async marketplaceAccount(): Promise<MarketplaceAccount> {
    return marketplaceAccount(this.methods);
  },

  async marketplaceAuthorSave(
    displayName: string,
    acceptTerms?: boolean,
  ): Promise<MarketplaceAuthorAccount> {
    return marketplaceAuthorSave(this.methods, displayName, acceptTerms);
  },

  async marketplaceAuthorAvatarSet(avatar: string | null): Promise<MarketplaceAuthorAccount> {
    return marketplaceAuthorAvatarSet(this.methods, avatar);
  },

  marketplaceUploadPlan(slug: string): UploadPlan {
    return marketplaceUploadPlan(this.methods, slug);
  },

  async marketplaceUpload(
    slug: string,
    displayName: string,
    bio?: string,
    tags?: string[],
    replaces?: string,
  ): Promise<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }> {
    return marketplaceUpload(this.methods, slug, displayName, bio, tags, replaces);
  },

  async marketplaceMine(lang?: MarketplaceLanguage): Promise<{ bots: MarketplaceAuthoredBot[] }> {
    return marketplaceMine(this.methods, lang);
  },

  async marketplaceDelete(id: string): Promise<{ deleted: true }> {
    return marketplaceDelete(this.methods, id);
  },

  async marketplaceInstallReview(id: string, lang?: 'en' | 'zh'): Promise<InstallReviewResult> {
    return marketplaceInstallReview(this.methods, id, lang);
  },

  shareDraftStart(slug: string): ShareDraftView {
    return shareDraftStart(this.methods, slug);
  },

  shareDraftGet(slug: string): ShareDraftView {
    return shareDraftGet(this.methods, slug);
  },

  shareDraftFile(slug: string, path: string): { path: string; kind: string; text?: string } {
    return shareDraftFile(this.methods, slug, path);
  },

  shareDraftDecide(
    slug: string,
    path: string,
    decision: 'keep' | 'drop' | 'rewrite',
    text?: string,
  ): ShareDraftView {
    return shareDraftDecide(this.methods, slug, path, decision, text);
  },

  shareDraftFinish(slug: string): ShareDraftView {
    return shareDraftFinish(this.methods, slug);
  },

  shareDraftDiscard(slug: string): { discarded: boolean } {
    return shareDraftDiscard(this.methods, slug);
  },

  async shareDraftExport(slug: string): Promise<{ path: string; files: number }> {
    return shareDraftExport(this.methods, slug);
  },

  async marketplaceInstall(
    id: string,
    reviewId: string,
    operationKey?: string,
    source?: MarketplaceInstallSource,
  ): Promise<{
    bot: PersonaBotDetail;
    channelId: string;
    receipt?: BotCreationReceipt;
    listing: MarketplaceEntry;
  }> {
    return marketplaceInstall(this.methods, id, reviewId, operationKey, source);
  },
} satisfies ThisType<BridgeRpcReceiver>;
