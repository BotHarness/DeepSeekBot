import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type {
  MarketplaceAvatar,
  MarketplaceAvatarApplyCandidate,
  MarketplaceAvatarPage,
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
): Promise<MarketplaceAvatarPage> {
  return unwrapAsync(methods.marketplaceAvatarList(cursor === undefined ? {} : { cursor }));
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
