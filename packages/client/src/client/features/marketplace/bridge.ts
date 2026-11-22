import { loadMarketplaceChallenge as readMarketplaceChallenge } from '@botharness/host-client/marketplace-avatars';
import { parseStandingUsage } from '@botharness/host-client/memory';
import {
  asRecord,
  bridgeHost,
  BridgeCallError,
  unwrap,
  type BridgeCall,
} from '../../bridge-transport.js';
import type { BotSummary } from '../../store.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplaceFileView,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceSection,
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceTopic,
  MarketplaceInstallSource,
  UploadPlan,
  InstallFinding,
  InstallReview,
  InstallReviewResult,
  AltchaChallenge,
  MarketplaceLanguage,
  MarketplaceBridgeReaders,
} from '../../bridge.js';

export interface BotZipFileListing {
  files: Array<{ path: string; size: number }>;
  always: string[];
}

export interface BotZipExportChoice {
  include?: readonly string[];
  history?: boolean;
}
const INSTALL_FINDING_KINDS = new Set(['prompt-injection', 'exfiltration', 'script']);
export function createMarketplaceBridge({
  parseMarketplaceDetail,
  parseAuthoredBots,
  parseMarketplaceFileView,
  parseMarketplacePage,
  parseMarketplaceSection,
  parseMarketplaceDigest,
  parseMarketplaceDigests,
  parseMarketplaceSubmission,
  parseMarketplaceTopics,
  parseBotSummary,
}: MarketplaceBridgeReaders) {
  function botZipUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`./api/botharness/${path}`, document.baseURI);
    url.search = new URLSearchParams(params).toString();
    return url.href;
  }

  async function botZipError(response: Response): Promise<BridgeCallError> {
    let code = response.status === 413 ? 'too-large' : 'unavailable';
    let message = `Bot zip request failed (${response.status})`;
    try {
      const error = asRecord(asRecord(await response.json())?.['error']);
      if (typeof error?.['code'] === 'string') code = error['code'];
      if (typeof error?.['message'] === 'string') message = error['message'];
    } catch {}
    return new BridgeCallError(code, message);
  }

  function attachmentFileName(header: string | null, fallback: string): string {
    const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(header ?? '')?.[1];
    if (encoded !== undefined) {
      try {
        return decodeURIComponent(encoded);
      } catch {}
    }
    return fallback;
  }

  async function importBotZip(file: File, signal?: AbortSignal): Promise<BotSummary> {
    const response = await fetch(botZipUrl('bot-zip/import', { name: file.name }), {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw await botZipError(response);
    const bot = parseBotSummary(asRecord(await response.json())?.['bot']);
    if (bot === undefined) throw new Error('invalid Bot zip import response');
    return bot;
  }

  async function previewBotZip(file: File, signal?: AbortSignal) {
    const response = await fetch(botZipUrl('bot-zip/import', {}), {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.botharness.bot-zip-preview' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw await botZipError(response);
    return parseStandingUsage(asRecord(await response.json())?.['standing']);
  }

  async function loadBotZipFiles(slug: string, signal?: AbortSignal): Promise<BotZipFileListing> {
    const response = await fetch(botZipUrl('bot-zip/files', { slug }), {
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw await botZipError(response);
    const value = asRecord(await response.json());
    const files: BotZipFileListing['files'] = [];
    for (const item of Array.isArray(value?.['files']) ? value['files'] : []) {
      const entry = asRecord(item);
      if (typeof entry?.['path'] === 'string' && typeof entry['size'] === 'number') {
        files.push({ path: entry['path'], size: entry['size'] });
      }
    }
    const always = Array.isArray(value?.['always'])
      ? value['always'].filter((path): path is string => typeof path === 'string')
      : [];
    return { files, always };
  }

  async function downloadBotZip(
    slug: string,
    fallbackName: string,
    choice: BotZipExportChoice = {},
    signal?: AbortSignal,
  ): Promise<{ blob: Blob; name: string }> {
    const { include } = choice;
    const query =
      include === undefined ? { slug, ...(choice.history ? { history: '1' } : {}) } : {};
    const response = await fetch(botZipUrl('bot-zip', query), {
      credentials: 'same-origin',
      ...(include === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug, include }),
          }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw await botZipError(response);
    return {
      blob: await response.blob(),
      name: attachmentFileName(response.headers.get('content-disposition'), `${fallbackName}.zip`),
    };
  }

  async function loadMarketplacePage(
    call: BridgeCall,
    query: MarketplaceQuery = {},
  ): Promise<MarketplacePage> {
    const page = parseMarketplacePage(await unwrap(call, 'marketplaceList', { query }));
    if (page === undefined) throw new Error('invalid marketplaceList response');
    return page;
  }

  async function loadMarketplaceDetail(
    call: BridgeCall,
    id: string,
    lang?: MarketplaceLanguage,
  ): Promise<MarketplaceDetail> {
    const detail = parseMarketplaceDetail(
      await unwrap(call, 'marketplaceDetail', lang === undefined ? { id } : { id, lang }),
    );
    if (detail === undefined) throw new Error('invalid marketplaceDetail response');
    return detail;
  }

  async function loadMarketplaceFile(
    call: BridgeCall,
    id: string,
    path: string,
  ): Promise<MarketplaceFileView> {
    const file = parseMarketplaceFileView({
      file: await unwrap(call, 'marketplaceFileView', { id, path }),
    });
    if (file === undefined) throw new Error('invalid marketplaceFileView response');
    return file;
  }

  async function loadMarketplaceTopics(call: BridgeCall): Promise<MarketplaceTopic[]> {
    const topics = parseMarketplaceTopics({
      topics: await unwrap(call, 'marketplaceTopics', {}),
    });
    if (topics === undefined) throw new Error('invalid marketplaceTopics response');
    return topics;
  }

  async function loadMarketplaceSections(
    call: BridgeCall,
    lang?: MarketplaceLanguage,
  ): Promise<MarketplaceSection[]> {
    const body = await unwrap(call, 'marketplaceSections', lang === undefined ? {} : { lang });
    const raw = (body as { sections?: unknown } | null)?.sections;
    const sections = Array.isArray(raw) ? raw.map(parseMarketplaceSection) : undefined;
    if (sections === undefined || sections.some((section) => section === undefined))
      throw new Error('invalid marketplaceSections response');
    return sections as MarketplaceSection[];
  }

  async function loadMarketplaceDigests(
    call: BridgeCall,
    lang?: MarketplaceLanguage,
  ): Promise<MarketplaceDigestSummary[]> {
    const digests = parseMarketplaceDigests(
      await unwrap(call, 'marketplaceDigests', lang === undefined ? {} : { lang }),
    );
    if (digests === undefined) throw new Error('invalid marketplaceDigests response');
    return digests;
  }

  async function loadMarketplaceDigest(
    call: BridgeCall,
    day?: string,
    lang?: MarketplaceLanguage,
  ): Promise<MarketplaceDigest> {
    const digest = parseMarketplaceDigest(
      await unwrap(call, 'marketplaceDigest', {
        ...(day === undefined ? {} : { day }),
        ...(lang === undefined ? {} : { lang }),
      }),
    );
    if (digest === undefined) throw new Error('invalid marketplaceDigest response');
    return digest;
  }

  async function loadMarketplaceChallenge(call: BridgeCall): Promise<AltchaChallenge> {
    return readMarketplaceChallenge(bridgeHost(call));
  }

  async function submitMarketplaceRepository(
    call: BridgeCall,
    url: string,
    altcha: string,
  ): Promise<MarketplaceEntry> {
    const result = parseMarketplaceSubmission(
      await unwrap(call, 'marketplaceSubmit', { url, altcha }),
    );
    if (result === undefined) throw new Error('invalid marketplaceSubmit response');
    return result.bot;
  }

  function parseInstallFinding(value: unknown): InstallFinding | undefined {
    const finding = asRecord(value);
    const kind = finding?.['kind'];
    const path = finding?.['path'];
    const note = finding?.['note'];
    if (typeof kind !== 'string' || !INSTALL_FINDING_KINDS.has(kind) || typeof path !== 'string')
      return undefined;
    return {
      kind: kind as InstallFinding['kind'],
      path,
      ...(typeof note === 'string' && note.length > 0 ? { note } : {}),
    };
  }

  function parseInstallReviewResult(value: unknown): InstallReviewResult | undefined {
    const result = asRecord(value);
    const review = asRecord(result?.['review']);
    const reviewId = result?.['reviewId'];
    const listing = parseMarketplaceSubmission({ bot: result?.['listing'] })?.bot;
    if (typeof reviewId !== 'string' || listing === undefined || review === undefined)
      return undefined;
    const findings = Array.isArray(review['findings'])
      ? review['findings'].map(parseInstallFinding)
      : undefined;
    if (findings === undefined || findings.some((finding) => finding === undefined))
      return undefined;
    const files = typeof review['files'] === 'number' ? review['files'] : 0;
    let parsed: InstallReview;
    if (review['status'] === 'reviewed') {
      parsed = {
        status: 'reviewed',
        findings: findings as InstallFinding[],
        files,
        read: typeof review['read'] === 'number' ? review['read'] : files,
        partial: review['partial'] === true,
        ...(typeof review['model'] === 'string' ? { model: review['model'] } : {}),
      };
    } else if (review['status'] === 'unavailable' && typeof review['reason'] === 'string') {
      parsed = {
        status: 'unavailable',
        reason: review['reason'] as Extract<InstallReview, { status: 'unavailable' }>['reason'],
        findings: findings as InstallFinding[],
        files,
      };
    } else return undefined;
    return {
      reviewId,
      listing,
      review: parsed,
      ...(result?.['standing'] === undefined
        ? {}
        : { standing: parseStandingUsage(result['standing']) }),
    };
  }

  async function reviewMarketplaceInstall(
    call: BridgeCall,
    id: string,
    lang?: MarketplaceLanguage,
  ): Promise<InstallReviewResult> {
    const result = parseInstallReviewResult(
      await unwrap(call, 'marketplaceInstallReview', lang === undefined ? { id } : { id, lang }),
    );
    if (result === undefined) throw new Error('invalid marketplaceInstallReview response');
    return result;
  }

  async function installMarketplaceBot(
    call: BridgeCall,
    id: string,
    reviewId: string,
    source?: MarketplaceInstallSource,
  ): Promise<BotSummary> {
    const value = await unwrap(call, 'marketplaceInstall', {
      id,
      reviewId,
      ...(source === undefined ? {} : { source }),
    });
    const bot = parseBotSummary(asRecord(value)?.['bot']);
    if (bot === undefined) throw new Error('invalid marketplaceInstall response');
    return bot;
  }

  async function loadMyMarketplaceUploads(
    call: BridgeCall,
    lang?: MarketplaceLanguage,
  ): Promise<MarketplaceAuthoredBot[]> {
    const bots = parseAuthoredBots(
      await unwrap(call, 'marketplaceMine', lang === undefined ? {} : { lang }),
    );
    if (bots === undefined) throw new Error('invalid marketplaceMine response');
    return bots;
  }

  async function uploadMarketplaceBot(
    call: BridgeCall,
    slug: string,
    presentation: {
      displayName: string;
      bio?: string;
      tags?: string[];
      replaces?: string;
    },
  ): Promise<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }> {
    const value = asRecord(await unwrap(call, 'marketplaceUpload', { slug, ...presentation }));
    const parsed = parseMarketplaceSubmission(value);
    if (parsed === undefined) throw new Error('invalid marketplaceUpload response');
    return {
      bot: parsed.bot,
      skipped: Array.isArray(value?.['skipped']) ? (value['skipped'] as UploadPlan['skipped']) : [],
    };
  }

  async function reportMarketplaceBot(
    call: BridgeCall,
    id: string,
    altcha: string,
    reason?: string,
  ): Promise<void> {
    await unwrap(call, 'marketplaceReport', {
      id,
      altcha,
      ...(reason === undefined ? {} : { reason }),
    });
  }
  return {
    importBotZip,
    previewBotZip,
    loadBotZipFiles,
    downloadBotZip,
    loadMarketplacePage,
    loadMarketplaceDetail,
    loadMarketplaceFile,
    loadMarketplaceTopics,
    loadMarketplaceSections,
    loadMarketplaceDigests,
    loadMarketplaceDigest,
    loadMarketplaceChallenge,
    submitMarketplaceRepository,
    parseInstallReviewResult,
    reviewMarketplaceInstall,
    installMarketplaceBot,
    loadMyMarketplaceUploads,
    uploadMarketplaceBot,
    reportMarketplaceBot,
  };
}
