import {
  asObject,
  asSlug,
  invalidInput,
  parseOptional,
  parseRoles,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import {
  parseMarketplaceAvatarPublish,
  type MarketplaceAvatar,
  type MarketplaceAvatarApplyCandidate,
  type MarketplaceAvatarPage,
  type MarketplaceAvatarTag,
  MAX_MARKETPLACE_AVATAR_QUERY,
  MAX_MARKETPLACE_AVATAR_TAG_FILTER,
} from '@botharness/host-protocol/marketplace-avatar';
import { TeamError } from '../../team/error.js';
import { join } from 'node:path';
import { createBotImports } from '../../bots/imports.js';
import type {
  BotZipImportService,
  BotZipImportInput,
  BotZipImportReference,
  BotZipPreview,
} from '../../bots/zip-import.js';
import {
  BotZipUploadError,
  type BotZipUploadIdentity,
  type BotZipUploadStatus,
} from '../../bots/zip-upload.js';
import { ZipArchiveError } from '../../bots/zip-archive.js';
import { BotCreationError, type BotCreationReceipt } from '../../bots/creation.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceAuthorAccount,
  MarketplaceClient,
  MarketplaceDetail,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceResult,
  MarketplaceSection,
  MarketplaceTopic,
} from '../../marketplace/client.js';
import {
  MARKETPLACE_DIGEST_DAY,
  MARKETPLACE_INSTALL_SOURCES,
  MARKETPLACE_SECTIONS,
} from '../../marketplace/client.js';
import type { AltchaChallenge } from '../../marketplace/altcha.js';
import type {
  MarketplaceAccount,
  MarketplaceUploads,
  UploadPlan,
} from '../../marketplace/uploaded-bots.js';
import type {
  InstallReviewResult,
  MarketplaceInstallReviews,
} from '../../marketplace/install-review.js';
import {
  summarizeShareDraft,
  type ShareDraft,
  type ShareDrafts,
  type ShareDraftView,
} from '../../marketplace/share-draft.js';
import type { UploadFileKind } from '../../../../market/src/upload-files.js';
import { MARKETPLACE_LANGUAGES, type MarketplaceLanguage } from '../../marketplace/language.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { isPersonaBotAvatar } from '../../bots/persona-bot.js';
import type { BridgeMethodsDeps, PersonaBotDetail } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import { createMarketplaceAvatarApply } from './avatar-apply.js';

export interface MarketplaceBridgeMethods {
  zipUploadBegin(payload: unknown): BridgeResult<BotZipUploadStatus>;
  zipUploadChunk(payload: unknown): BridgeResult<BotZipUploadStatus>;
  zipUploadPreview(payload: unknown): BridgeResult<BotZipPreview>;
  zipImportLookup(payload: unknown): BridgeResult<{ receipt: BotCreationReceipt | null }>;
  zipImport(payload: unknown): Promise<
    BridgeResult<{
      bot: PersonaBotDetail;
      channelId: string;
      receipt?: BotCreationReceipt;
    }>
  >;
  marketplaceList(payload: unknown): Promise<BridgeResult<MarketplacePage>>;
  marketplaceSubmit(payload: unknown): Promise<BridgeResult<{ bot: MarketplaceEntry }>>;
  marketplaceTopics(): Promise<BridgeResult<MarketplaceTopic[]>>;
  marketplaceSections(payload: unknown): Promise<BridgeResult<{ sections: MarketplaceSection[] }>>;
  marketplaceDigests(
    payload: unknown,
  ): Promise<BridgeResult<{ digests: MarketplaceDigestSummary[] }>>;
  marketplaceDigest(payload: unknown): Promise<BridgeResult<{ digest: MarketplaceDigest }>>;
  marketplaceAvatarList(payload: unknown): Promise<BridgeResult<MarketplaceAvatarPage>>;
  marketplaceAvatarTags(): Promise<BridgeResult<MarketplaceAvatarTag[]>>;
  marketplaceAvatarDetail(payload: unknown): Promise<BridgeResult<MarketplaceAvatar>>;
  marketplaceAvatarApplyCandidates(
    payload: unknown,
  ): BridgeResult<{ bots: MarketplaceAvatarApplyCandidate[] }>;
  marketplaceAvatarApply(payload: unknown): Promise<BridgeResult<{ applied: true }>>;
  marketplaceAvatarPublish(payload: unknown): Promise<BridgeResult<MarketplaceAvatar>>;
  marketplaceAvatarSource(payload: unknown): BridgeResult<{ image: string }>;
  marketplaceDetail(payload: unknown): Promise<BridgeResult<MarketplaceDetail>>;
  marketplaceFileView(payload: unknown): Promise<BridgeResult<MarketplaceFileView>>;
  marketplaceChallenge(): Promise<BridgeResult<AltchaChallenge>>;
  marketplaceAvatarReport(payload: unknown): Promise<BridgeResult<{ received: true }>>;
  marketplaceReport(payload: unknown): Promise<BridgeResult<{ received: true }>>;
  marketplaceAccount(): Promise<BridgeResult<MarketplaceAccount>>;
  marketplaceAuthorSave(payload: unknown): Promise<BridgeResult<MarketplaceAuthorAccount>>;
  marketplaceAuthorAvatarSet(payload: unknown): Promise<BridgeResult<MarketplaceAuthorAccount>>;
  marketplaceUploadPlan(payload: unknown): BridgeResult<UploadPlan>;
  marketplaceUpload(
    payload: unknown,
  ): Promise<BridgeResult<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }>>;
  marketplaceInstallReview(payload: unknown): Promise<BridgeResult<InstallReviewResult>>;
  marketplaceMine(payload: unknown): Promise<BridgeResult<{ bots: MarketplaceAuthoredBot[] }>>;
  marketplaceDelete(payload: unknown): Promise<BridgeResult<{ deleted: true }>>;
  shareDraftStart(payload: unknown): BridgeResult<ShareDraftView>;
  shareDraftGet(payload: unknown): BridgeResult<ShareDraftView>;
  shareDraftFile(
    payload: unknown,
  ): BridgeResult<{ path: string; kind: UploadFileKind; text?: string }>;
  shareDraftDecide(payload: unknown): BridgeResult<ShareDraftView>;
  shareDraftFinish(payload: unknown): BridgeResult<ShareDraftView>;
  shareDraftDiscard(payload: unknown): BridgeResult<{ discarded: boolean }>;
  shareDraftExport(payload: unknown): Promise<BridgeResult<{ path: string; files: number }>>;
  marketplaceInstall(payload: unknown): Promise<
    BridgeResult<{
      bot: PersonaBotDetail;
      channelId: string;
      receipt?: BotCreationReceipt;
      listing: MarketplaceEntry;
    }>
  >;
}

export interface MarketplaceBridgeDeps {
  zipImports?: BotZipImportService;
  marketplace?: MarketplaceClient;
  marketplaceUploads?: MarketplaceUploads;
  marketplaceInstallReviews?: MarketplaceInstallReviews;
  shareDrafts?: ShareDrafts;
}
function marketplaceLang(value: unknown): MarketplaceLanguage | undefined | false {
  if (value === undefined) return undefined;
  return MARKETPLACE_LANGUAGES.find((language) => language === value) ?? false;
}

function parseZipUpload(payload: unknown): BotZipUploadIdentity | undefined {
  const source = asObject(payload);
  const uploadKey = source['uploadKey'];
  const sha256 = source['sha256'];
  const sizeBytes = source['sizeBytes'];
  return typeof uploadKey === 'string' &&
    typeof sha256 === 'string' &&
    typeof sizeBytes === 'number'
    ? { uploadKey, sha256, sizeBytes }
    : undefined;
}

function parseZipImport(payload: unknown): BotZipImportReference | undefined {
  const source = asObject(payload);
  const operationKey = source['operationKey'];
  const sha256 = source['sha256'];
  const displayName = source['displayName'];
  const roles = parseRoles(source);
  const description = parseOptional(source, 'description');
  if (
    typeof operationKey !== 'string' ||
    typeof sha256 !== 'string' ||
    typeof displayName !== 'string' ||
    !roles.ok ||
    !description.ok
  )
    return undefined;
  return {
    operationKey,
    sha256,
    displayName,
    ...(roles.value === undefined ? {} : { roles: roles.value }),
    ...(description.value === undefined ? {} : { description: description.value }),
  };
}

function zipFailure(error: unknown): BridgeResult<never> {
  if (error instanceof TeamError)
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  return {
    ok: false,
    error: {
      code:
        error instanceof BotZipUploadError ||
        error instanceof BotCreationError ||
        error instanceof ZipArchiveError
          ? error.code
          : 'upload-unavailable',
      message: 'The Zip operation could not be completed.',
    },
  };
}

export function createMarketplaceBridgeMethods(
  human: HumanContext,
  deps: MarketplaceBridgeDeps &
    Pick<
      BridgeMethodsDeps,
      | 'registry'
      | 'creations'
      | 'imports'
      | 'warn'
      | 'telemetry'
      | 'tob'
      | 'team'
      | 'marketplaceReceipts'
    >,
  globalRegistry: BridgeMethodsDeps['registry'],
  isHostOwner: () => boolean,
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
  sendReceipt: (listingId: string) => void,
) {
  const marketplaceCall = async <T>(
    operation: (client: MarketplaceClient) => Promise<MarketplaceResult<T>>,
  ): Promise<BridgeResult<T>> => {
    if (deps.marketplace === undefined) {
      return {
        ok: false,
        error: {
          code: 'marketplace-unavailable',
          message: 'Bot Marketplace is unavailable',
        },
      };
    }
    const result = await operation(deps.marketplace);
    if (result.ok) return result;
    deps.warn?.(
      JSON.stringify({
        module: 'marketplace',
        initiator: 'client',
        phase: 'request-refused',
        reason: result.code,
      }),
    );
    return { ok: false, error: { code: result.code, message: result.code } };
  };
  const withInstalls = (entry: MarketplaceEntry): MarketplaceEntry => {
    if (entry.source !== 'upload') return entry;
    const copies = deps.registry
      .list()
      .flatMap((record) => (record.marketplaceListing?.id === entry.id ? [record] : []));
    if (copies.length === 0) return entry;
    return {
      ...entry,
      installed: {
        bots: copies.map((record) => record.slug),
        authorUpdated: copies.some(
          (record) => Date.parse(record.marketplaceListing!.pushedAt) < Date.parse(entry.pushedAt),
        ),
      },
    };
  };
  const marketplaceUnavailable = (): {
    ok: false;
    error: { code: string; message: string };
  } => ({
    ok: false,
    error: {
      code: 'marketplace-unavailable',
      message: 'Bot Marketplace is unavailable',
    },
  });
  const avatarPublishPermission = (): BridgeResult<never> | undefined =>
    isHostOwner() && human.caller !== 'bot'
      ? undefined
      : {
          ok: false,
          error: {
            code: 'permission-required',
            message: 'Only the Host owner may publish Marketplace Avatars',
          },
        };
  const shareDraftSlug = (payload: unknown): string | undefined => {
    const slug = asSlug(payload);
    return slug === undefined ||
      deps.registry.get(slug) === undefined ||
      deps.tob?.isTob(slug) === true
      ? undefined
      : slug;
  };
  const draftResult = (
    result: { ok: true; value: ShareDraft } | { ok: false; code: string; path?: string },
  ): BridgeResult<ShareDraftView> =>
    uploadResult(
      result.ok
        ? {
            ok: true,
            value: {
              ...result.value,
              summary: summarizeShareDraft(result.value),
            },
          }
        : result,
    );
  const uploadResult = <T>(
    result: { ok: true; value: T } | { ok: false; code: string; path?: string },
  ): BridgeResult<T> => {
    if (result.ok) return result;
    deps.warn?.(
      JSON.stringify({
        module: 'marketplace',
        initiator: 'client',
        phase: 'upload-refused',
        reason: result.code,
      }),
    );
    return {
      ok: false,
      error: {
        code: result.code,
        message: result.path === undefined ? result.code : `${result.code}: ${result.path}`,
      },
    };
  };
  const report = (payload: unknown, kind: 'bot' | 'avatar') => {
    const { id, altcha, reason } = asObject(payload);
    if (typeof id !== 'string' || id.trim().length === 0) {
      return Promise.resolve(invalidInput('id is required'));
    }
    if (typeof altcha !== 'string' || altcha.length === 0) {
      return Promise.resolve(invalidInput('altcha is required'));
    }
    if (reason !== undefined && typeof reason !== 'string') {
      return Promise.resolve(invalidInput('invalid reason'));
    }
    const trimmed = reason?.trim() ?? '';
    return marketplaceCall((client) =>
      client.report(
        id.trim(),
        {
          altcha,
          ...(trimmed.length === 0 ? {} : { reason: trimmed }),
        },
        kind,
      ),
    );
  };

  return {
    marketplaceZip: {
      zipUploadBegin(payload) {
        const input = parseZipUpload(payload);
        if (!input) return invalidInput('An upload identity is required');
        if (!deps.zipImports) return unavailable();
        try {
          return { ok: true, value: deps.zipImports.begin(input) };
        } catch (error) {
          return zipFailure(error);
        }
      },
      zipUploadChunk(payload) {
        const input = parseZipUpload(payload);
        const source = asObject(payload);
        const offset = source['offset'];
        const dataBase64 = source['dataBase64'];
        if (!input || typeof offset !== 'number' || typeof dataBase64 !== 'string')
          return invalidInput('An upload chunk is required');
        if (!deps.zipImports) return unavailable();
        try {
          return {
            ok: true,
            value: deps.zipImports.chunk({ ...input, offset, dataBase64 }),
          };
        } catch (error) {
          return zipFailure(error);
        }
      },
      zipUploadPreview(payload) {
        const input = parseZipUpload(payload);
        if (!input) return invalidInput('An upload identity is required');
        if (!deps.zipImports) return unavailable();
        try {
          return { ok: true, value: deps.zipImports.preview(input) };
        } catch (error) {
          return zipFailure(error);
        }
      },
      zipImportLookup(payload) {
        const input = parseZipImport(payload);
        if (!input) return invalidInput('The original import input is required');
        if (!deps.zipImports) return unavailable();
        try {
          return {
            ok: true,
            value: { receipt: deps.zipImports.lookup(input) ?? null },
          };
        } catch (error) {
          return zipFailure(error);
        }
      },
      async zipImport(payload) {
        const identity = parseZipUpload(payload);
        const reference = parseZipImport(payload);
        if (!identity || !reference) return invalidInput('The original import input is required');
        if (!deps.zipImports) return unavailable();
        const input: BotZipImportInput = { ...identity, ...reference };
        try {
          const created = await deps.zipImports.create(input);
          return {
            ok: true,
            value: {
              ...detailOf(created.record),
              channelId: created.channelId,
              ...(created.receipt === undefined ? {} : { receipt: created.receipt }),
            },
          };
        } catch (error) {
          return zipFailure(error);
        }
      },
    } satisfies Pick<
      MarketplaceBridgeMethods,
      'zipUploadBegin' | 'zipUploadChunk' | 'zipUploadPreview' | 'zipImportLookup' | 'zipImport'
    >,
    marketplaceReads: {
      marketplaceList(payload) {
        const source = asObject(payload);
        const query: MarketplaceQuery = {};
        for (const key of ['cursor', 'q', 'topic'] as const) {
          const value = parseOptional(source, key);
          if (!value.ok) return Promise.resolve(invalidInput(`invalid ${key}`));
          const trimmed = value.value?.trim();
          if (trimmed !== undefined && trimmed.length > 0) query[key] = trimmed;
        }
        const sort = source['sort'];
        if (sort !== undefined && sort !== 'updated' && sort !== 'created' && sort !== 'stars') {
          return Promise.resolve(invalidInput('invalid sort'));
        }
        if (sort !== undefined) query.sort = sort;
        const lang = marketplaceLang(source['lang']);
        if (lang === false) return Promise.resolve(invalidInput('invalid lang'));
        if (lang !== undefined) query.lang = lang;
        if (source['includeUploads'] !== undefined && typeof source['includeUploads'] !== 'boolean')
          return Promise.resolve(invalidInput('invalid includeUploads'));
        if (source['includeUploads'] === true) query.includeUploads = true;
        return marketplaceCall(async (client) => {
          const page = await client.list(query);
          return page.ok
            ? {
                ok: true,
                value: { ...page.value, bots: page.value.bots.map(withInstalls) },
              }
            : page;
        });
      },
      marketplaceTopics() {
        return marketplaceCall((client) => client.topics());
      },
      marketplaceDigests(payload) {
        const lang = marketplaceLang(asObject(payload)['lang']);
        if (lang === false) return Promise.resolve(invalidInput('invalid lang'));
        return marketplaceCall(async (client) => {
          const digests = await client.digests(lang);
          return digests.ok ? { ok: true, value: { digests: digests.value } } : digests;
        });
      },
      marketplaceDigest(payload) {
        const source = asObject(payload);
        const lang = marketplaceLang(source['lang']);
        if (lang === false) return Promise.resolve(invalidInput('invalid lang'));
        const day = source['day'] ?? 'latest';
        if (typeof day !== 'string' || (day !== 'latest' && !MARKETPLACE_DIGEST_DAY.test(day)))
          return Promise.resolve(invalidInput('invalid day'));
        return marketplaceCall(async (client) => {
          const digest = await client.digest(day, lang);
          if (!digest.ok) return digest;
          return {
            ok: true,
            value: {
              digest: {
                ...digest.value,
                sections: digest.value.sections.map((section) => ({
                  ...section,
                  bot: section.bot === null ? null : withInstalls(section.bot),
                })),
              },
            },
          };
        });
      },
      marketplaceSections(payload) {
        const lang = marketplaceLang(asObject(payload)['lang']);
        if (lang === false) return Promise.resolve(invalidInput('invalid lang'));
        return marketplaceCall(async (client) => {
          const results = await Promise.all(
            MARKETPLACE_SECTIONS.map((name) => client.section(name, lang)),
          );
          const sections: MarketplaceSection[] = [];
          for (const result of results) {
            if (!result.ok) return result;
            sections.push({
              ...result.value,
              entries: result.value.entries.map((entry) => ({
                ...entry,
                bot: withInstalls(entry.bot),
              })),
            });
          }
          return { ok: true, value: { sections } };
        });
      },
    } satisfies Pick<
      MarketplaceBridgeMethods,
      | 'marketplaceList'
      | 'marketplaceTopics'
      | 'marketplaceDigests'
      | 'marketplaceDigest'
      | 'marketplaceSections'
    >,
    marketplaceSharing: {
      ...createMarketplaceAvatarApply(
        human,
        { ...deps, registry: globalRegistry },
        isHostOwner,
        marketplaceCall,
      ),
      marketplaceAvatarList(payload) {
        const { cursor, q, tag } = asObject(payload);
        if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 100))
          return Promise.resolve(invalidInput('invalid cursor'));
        if (
          q !== undefined &&
          (typeof q !== 'string' || q.trim().length > MAX_MARKETPLACE_AVATAR_QUERY)
        )
          return Promise.resolve(invalidInput('invalid query'));
        if (
          tag !== undefined &&
          (typeof tag !== 'string' || [...tag.trim()].length > MAX_MARKETPLACE_AVATAR_TAG_FILTER)
        )
          return Promise.resolve(invalidInput('invalid tag'));
        return marketplaceCall((client) =>
          client.avatarList({
            ...(cursor === undefined ? {} : { cursor }),
            ...(q === undefined ? {} : { q: q.trim() }),
            ...(tag === undefined ? {} : { tag: tag.trim() }),
          }),
        );
      },
      marketplaceAvatarTags() {
        return marketplaceCall((client) => client.avatarTags());
      },
      marketplaceAvatarDetail(payload) {
        const { id } = asObject(payload);
        if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id))
          return Promise.resolve(invalidInput('invalid Avatar ID'));
        return marketplaceCall((client) => client.avatarDetail(id));
      },
      marketplaceAvatarSource(payload) {
        const denied = avatarPublishPermission();
        if (denied) return denied;
        const { bot: slug } = asObject(payload);
        if (typeof slug !== 'string' || !slug.trim()) return invalidInput('A Bot slug is required');
        const bot = globalRegistry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        if (!isPersonaBotAvatar(bot.avatar))
          return {
            ok: false,
            error: { code: 'no-stored-avatar', message: 'This Bot has no stored Avatar image' },
          };
        return { ok: true, value: { image: bot.avatar } };
      },
      async marketplaceAvatarPublish(payload) {
        const denied = avatarPublishPermission();
        if (denied) return denied;
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const input = parseMarketplaceAvatarPublish(asObject(payload));
        if (input === undefined) return invalidInput('invalid Marketplace Avatar publish payload');
        return uploadResult(await deps.marketplaceUploads.publishAvatar(input));
      },
      marketplaceDetail(payload) {
        const { id, lang: langValue } = asObject(payload);
        if (typeof id !== 'string' || id.trim().length === 0) {
          return Promise.resolve(invalidInput('id is required'));
        }
        const lang = marketplaceLang(langValue);
        if (lang === false) return Promise.resolve(invalidInput('invalid lang'));
        return marketplaceCall(async (client) => {
          const detail = await client.detail(id.trim(), lang);
          return detail.ok
            ? {
                ok: true,
                value: { ...detail.value, bot: withInstalls(detail.value.bot) },
              }
            : detail;
        });
      },
      marketplaceFileView(payload) {
        const { id, path } = asObject(payload);
        if (typeof id !== 'string' || id.trim().length === 0) {
          return Promise.resolve(invalidInput('id is required'));
        }
        if (typeof path !== 'string' || path.length === 0) {
          return Promise.resolve(invalidInput('path is required'));
        }
        return marketplaceCall((client) => client.fileView(id.trim(), path));
      },
      marketplaceSubmit(payload) {
        const { url, altcha } = asObject(payload);
        if (typeof url !== 'string' || url.trim().length === 0) {
          return Promise.resolve(invalidInput('url is required'));
        }
        if (typeof altcha !== 'string' || altcha.length === 0) {
          return Promise.resolve(invalidInput('altcha is required'));
        }
        return marketplaceCall((client) => client.submit(url.trim(), altcha));
      },
      marketplaceChallenge() {
        return marketplaceCall((client) => client.challenge());
      },
      marketplaceReport: (payload) => report(payload, 'bot'),
      marketplaceAvatarReport: (payload) => report(payload, 'avatar'),
      async marketplaceAccount() {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        return uploadResult(await deps.marketplaceUploads.account());
      },
      async marketplaceAuthorSave(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const { displayName, acceptTerms } = asObject(payload);
        if (
          typeof displayName !== 'string' ||
          (acceptTerms !== undefined && typeof acceptTerms !== 'boolean')
        )
          return invalidInput('displayName is required');
        return uploadResult(
          await deps.marketplaceUploads.saveAuthor({
            displayName: displayName.trim(),
            acceptTerms: acceptTerms === true,
          }),
        );
      },
      async marketplaceAuthorAvatarSet(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const { avatar } = asObject(payload);
        const image =
          typeof avatar === 'string'
            ? /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(avatar)?.[1]
            : undefined;
        if (avatar !== null && image === undefined)
          return invalidInput('avatar must be a PNG, JPEG or WebP data URL, or null');
        return uploadResult(
          await deps.marketplaceUploads.saveAuthorAvatar(
            image === undefined ? null : Buffer.from(image, 'base64'),
          ),
        );
      },
      marketplaceUploadPlan(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const slug = asSlug(payload);
        if (slug === undefined || deps.registry.get(slug) === undefined)
          return invalidInput('slug is required');
        return uploadResult(deps.marketplaceUploads.plan(slug));
      },
      async marketplaceUpload(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const slug = asSlug(payload);
        const source = asObject(payload);
        const record = slug === undefined ? undefined : deps.registry.get(slug);
        if (slug === undefined || record === undefined || deps.tob?.isTob(slug) === true)
          return invalidInput('slug must name one of your Bots');
        const displayName = source['displayName'];
        const bio = parseOptional(source, 'bio');
        const tags = source['tags'];
        if (
          typeof displayName !== 'string' ||
          displayName.trim().length === 0 ||
          !bio.ok ||
          (tags !== undefined &&
            (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')))
        )
          return invalidInput('invalid upload payload');
        const replaces = source['replaces'];
        if (
          replaces !== undefined &&
          (typeof replaces !== 'string' || replaces.trim().length === 0)
        )
          return invalidInput('invalid replaces');
        const trimmedBio = bio.value?.trim();
        const uploaded = await deps.marketplaceUploads.upload(slug, {
          displayName: displayName.trim(),
          ...(trimmedBio === undefined || trimmedBio.length === 0 ? {} : { bio: trimmedBio }),
          ...(tags === undefined ? {} : { tags: tags as string[] }),
          ...(replaces === undefined ? {} : { replaces: replaces.trim() }),
        });
        if (uploaded.ok) {
          const { id, pushedAt } = uploaded.value.bot;
          try {
            deps.registry.setMarketplaceUpload(slug, { id, pushedAt });
            for (const other of deps.registry.list())
              if (other.slug !== slug && other.marketplaceUpload?.id === id)
                deps.registry.setMarketplaceUpload(other.slug, undefined);
          } catch (failure) {
            deps.warn?.(
              JSON.stringify({
                module: 'marketplace',
                initiator: 'client',
                phase: 'upload-link-not-saved',
                reason: failure instanceof Error ? failure.message : String(failure),
              }),
            );
          }
        }
        return uploadResult(uploaded);
      },
      async marketplaceMine(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const lang = marketplaceLang(asObject(payload)['lang']);
        if (lang === false) return invalidInput('invalid lang');
        const mine = await deps.marketplaceUploads.mine(lang);
        return uploadResult(
          mine.ok
            ? {
                ok: true,
                value: {
                  bots: mine.value.map((entry) => ({
                    ...entry,
                    bot: withInstalls(entry.bot),
                  })),
                },
              }
            : mine,
        );
      },
      async marketplaceDelete(payload) {
        if (deps.marketplaceUploads === undefined) return marketplaceUnavailable();
        const { id } = asObject(payload);
        if (typeof id !== 'string' || id.trim().length === 0) return invalidInput('id is required');
        return uploadResult(await deps.marketplaceUploads.remove(id.trim()));
      },
      shareDraftStart(payload) {
        const slug = shareDraftSlug(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined) return invalidInput('slug must name one of your Bots');
        return draftResult(deps.shareDrafts.start(slug));
      },
      shareDraftGet(payload) {
        const slug = shareDraftSlug(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined) return invalidInput('slug must name one of your Bots');
        return draftResult(deps.shareDrafts.get(slug));
      },
      shareDraftFile(payload) {
        const slug = shareDraftSlug(payload);
        const { path } = asObject(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined || typeof path !== 'string' || path.length === 0)
          return invalidInput('slug and path are required');
        return uploadResult(deps.shareDrafts.read(slug, path));
      },
      shareDraftDecide(payload) {
        const slug = shareDraftSlug(payload);
        const { path, decision, text } = asObject(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined || typeof path !== 'string' || path.length === 0)
          return invalidInput('slug and path are required');
        if (decision === 'keep')
          return draftResult(deps.shareDrafts.decide(slug, path, { keep: true }));
        if (decision === 'drop')
          return draftResult(deps.shareDrafts.decide(slug, path, { drop: true }));
        if (decision === 'rewrite' && typeof text === 'string')
          return draftResult(deps.shareDrafts.decide(slug, path, { rewrite: text }));
        return invalidInput('decision must be keep, drop, or rewrite with text');
      },
      shareDraftFinish(payload) {
        const slug = shareDraftSlug(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined) return invalidInput('slug must name one of your Bots');
        return draftResult(deps.shareDrafts.finish(slug));
      },
      shareDraftDiscard(payload) {
        const slug = shareDraftSlug(payload);
        if (deps.shareDrafts === undefined) return marketplaceUnavailable();
        if (slug === undefined) return invalidInput('slug must name one of your Bots');
        return uploadResult(deps.shareDrafts.discard(slug));
      },
      async shareDraftExport(payload) {
        const slug = shareDraftSlug(payload);
        if (deps.shareDrafts === undefined || deps.tob === undefined)
          return marketplaceUnavailable();
        if (slug === undefined) return invalidInput('slug must name one of your Bots');
        const home = await deps.tob.ensure(human);
        return uploadResult(
          deps.shareDrafts.exportTo(slug, join(home.workspacePath, 'share-exports', slug)),
        );
      },
      async marketplaceInstallReview(payload) {
        if (deps.marketplaceInstallReviews === undefined) return marketplaceUnavailable();
        const { id, lang } = asObject(payload);
        if (typeof id !== 'string' || id.trim().length === 0) return invalidInput('id is required');
        if (lang !== undefined && lang !== 'en' && lang !== 'zh')
          return invalidInput('invalid lang');
        return uploadResult(await deps.marketplaceInstallReviews.review(id.trim(), lang));
      },
      async marketplaceInstall(payload) {
        if (deps.marketplaceInstallReviews === undefined) return marketplaceUnavailable();
        const { id, reviewId, operationKey, source: installSource } = asObject(payload);
        if (typeof id !== 'string' || id.trim().length === 0) return invalidInput('id is required');
        if (
          installSource !== undefined &&
          !(MARKETPLACE_INSTALL_SOURCES as readonly unknown[]).includes(installSource)
        )
          return invalidInput('invalid source');
        if (typeof reviewId !== 'string' || reviewId.length === 0)
          return {
            ok: false,
            error: {
              code: 'review-required',
              message: 'Run marketplaceInstallReview first',
            },
          };
        if (operationKey !== undefined && typeof operationKey !== 'string')
          return invalidInput('invalid operationKey');
        const imports =
          deps.imports ??
          (deps.creations
            ? createBotImports(deps.creations, deps.warn === undefined ? {} : { log: deps.warn })
            : undefined);
        if (imports === undefined) return invalidInput('Bot import is unavailable');
        const prepared = deps.marketplaceInstallReviews.staged(id.trim(), reviewId);
        if (!prepared.ok) return uploadResult(prepared);
        try {
          const created = await imports.create(
            operationKey ?? `marketplace:${reviewId}`,
            prepared.value.input,
          );
          sendReceipt(prepared.value.listing.id);
          try {
            deps.telemetry?.capture?.(
              'marketplace:bot_install',
              typeof installSource === 'string' ? { entry: installSource } : undefined,
            );
          } catch {}
          const listing = prepared.value.listing;
          const marked = deps.registry.setMarketplaceListing(created.record.slug, {
            id: listing.id,
            pushedAt: listing.pushedAt,
          });
          return {
            ok: true,
            value: {
              ...detailOf(marked.ok ? marked.record : created.record),
              channelId: created.channelId,
              ...(created.receipt === undefined ? {} : { receipt: created.receipt }),
              listing: prepared.value.listing,
            },
          };
        } catch (error) {
          if (error instanceof BotCreationError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      },
    } satisfies Pick<
      MarketplaceBridgeMethods,
      | 'marketplaceAvatarApplyCandidates'
      | 'marketplaceAvatarApply'
      | 'marketplaceAvatarList'
      | 'marketplaceAvatarTags'
      | 'marketplaceAvatarDetail'
      | 'marketplaceAvatarPublish'
      | 'marketplaceAvatarSource'
      | 'marketplaceDetail'
      | 'marketplaceFileView'
      | 'marketplaceSubmit'
      | 'marketplaceChallenge'
      | 'marketplaceReport'
      | 'marketplaceAvatarReport'
      | 'marketplaceAccount'
      | 'marketplaceAuthorSave'
      | 'marketplaceAuthorAvatarSet'
      | 'marketplaceUploadPlan'
      | 'marketplaceUpload'
      | 'marketplaceMine'
      | 'marketplaceDelete'
      | 'shareDraftStart'
      | 'shareDraftGet'
      | 'shareDraftFile'
      | 'shareDraftDecide'
      | 'shareDraftFinish'
      | 'shareDraftDiscard'
      | 'shareDraftExport'
      | 'marketplaceInstallReview'
      | 'marketplaceInstall'
    >,
  };
}
