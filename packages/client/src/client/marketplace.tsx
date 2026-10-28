import { ReadFailure } from './ds/read-failure.js';
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import {
  Button,
  Input,
  MarkdownText,
  SegmentedControl,
  Tag,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { solveChallenge } from '../../../core/src/marketplace/altcha.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import type {
  MarketplaceDetail,
  MarketplaceEntry,
  MarketplaceFile,
  MarketplaceQuery,
  MarketplaceSort,
  MarketplaceTopic,
  MarketplaceInstallSource,
} from '../../../core/src/marketplace/client.js';
import type {
  InstallFinding,
  InstallReviewResult,
} from '../../../core/src/marketplace/install-review.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Callout } from './ds/callout.js';
import { formatStars } from './community-links.js';
import { formatRelativeTime } from './labels.js';
import { BotBannerArt } from './bot-banner.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { MarketplaceFileReader, MarketplaceFileTree } from './market-files.js';
import { MarketPage } from './market-page.js';
import { useMountedResource } from './mounted-resource.js';
import { personaBotCreateError } from './persona-bot-create.js';

const marketplaceErrorKeys: Record<string, BotHarnessKey> = {
  'marketplace-unavailable': 'market.error.unavailable',
  'invalid-repository-url': 'market.error.invalidUrl',
  'repository-not-found': 'market.error.notFound',
  'repository-private': 'market.error.private',
  'repository-archived': 'market.error.archived',
  'repository-missing-topic': 'market.error.missingTopic',
  'repository-blocked': 'market.error.blocked',
  'upstream-unavailable': 'market.error.upstream',
  'bot-not-found': 'market.error.botNotFound',
  'file-not-found': 'market.error.fileNotFound',
  'challenge-unavailable': 'market.error.challengeUnavailable',
  'challenge-invalid': 'market.error.challenge',
  'challenge-expired': 'market.error.challenge',
  'challenge-replayed': 'market.error.challenge',
  'rate-limited': 'market.error.rateLimited',
  'repository-rate-limited': 'market.error.repositoryRateLimited',
  'invalid-report': 'market.error.invalidReport',
  'sign-in-required': 'market.error.signIn',
  'sign-in-rejected': 'market.error.signInRejected',
  'author-required': 'market.error.authorRequired',
  'terms-required': 'market.error.terms',
  'invalid-author-name': 'market.error.authorName',
  'uploads-unavailable': 'market.error.uploadsUnavailable',
  'too-many-files': 'market.error.tooManyFiles',
  'too-large': 'market.error.tooLarge',
  'bot-limit': 'market.error.botLimit',
  'nothing-to-upload': 'market.error.nothingToUpload',
  'listing-not-installable': 'market.error.botNotFound',
  'not-an-uploaded-bot': 'market.error.botNotFound',
  'replace-limit': 'market.error.replaceLimit',
};

export const MAX_REPORT_REASON_LENGTH = 500;

export async function proveHuman(actions: BridgeActions): Promise<string> {
  const challenge = await actions.marketplaceChallenge();
  const payload = await solveChallenge(challenge, {
    yieldEvery: () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  if (payload === undefined) {
    throw new BridgeCallError('challenge-invalid', 'challenge could not be solved');
  }
  return payload;
}

export type Phase = 'idle' | 'verifying' | 'sending';

type ReportState =
  | { status: 'closed' }
  | { status: 'open'; reason: string; phase: Phase; cause?: unknown }
  | { status: 'done' };

export function marketplaceError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    const key = marketplaceErrorKeys[error.code];
    if (key !== undefined) return t(key);
  }
  return errorMessage(error);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function marketplaceName(bot: MarketplaceEntry): string {
  return bot.displayName ?? bot.name;
}

export function marketplaceOwner(bot: MarketplaceEntry): string {
  if (bot.source === 'upload' && bot.author !== null) return `${bot.author.name} #${bot.author.id}`;
  return bot.displayName === null ? bot.owner : bot.fullName;
}

export function MarketplaceOwner({ bot }: { bot: MarketplaceEntry }): ReactElement {
  const avatar = bot.source === 'upload' ? bot.author?.avatar : null;
  return (
    <>
      {avatar == null ? null : (
        <img className="bh-market-author-avatar" src={avatar} alt="" data-market-author-avatar="" />
      )}
      {marketplaceOwner(bot)}
    </>
  );
}

function MarketplaceName({ bot }: { bot: MarketplaceEntry }): ReactElement {
  return (
    <span className="bh-market-name">
      <span>{marketplaceName(bot)}</span>
      <span className="bh-market-owner">
        <MarketplaceOwner bot={bot} />
      </span>
      {bot.roles.map((role) => (
        <Tag key={role} tone="outline">
          {role}
        </Tag>
      ))}
    </span>
  );
}

export function MarketplaceDescription({
  bot,
  t,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span className="bh-market-description">
      {bot.description}
      {bot.descriptionGenerated === true ? (
        <span className="bh-market-generated" title={t('market.descriptionGenerated')}>
          {t('market.descriptionGeneratedTag')}
        </span>
      ) : null}
    </span>
  );
}

function day(value: string): string {
  return value.slice(0, 10);
}

function ago(value: string, t: BotHarnessTranslate): string {
  const at = Date.parse(value);
  return Number.isNaN(at) ? day(value) : formatRelativeTime(at, Date.now(), t);
}

const VISIBLE_TOPICS = 12;
const MAX_QUERY_LENGTH = 100;

export function marketplaceLanguage(t: BotHarnessTranslate): MarketplaceLanguage {
  return t('market.language') === 'en' ? 'en' : 'zh';
}

export function committedEnter(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229;
}

export interface Filters {
  sort: MarketplaceSort;
  query: string;
  topic?: string;
}

function queryFor(
  filters: Filters,
  lang: MarketplaceLanguage,
  cursor?: string,
  includeUploads = false,
): MarketplaceQuery {
  return {
    sort: filters.sort,
    lang,
    ...(includeUploads ? { includeUploads: true } : {}),
    ...(filters.query.length === 0 ? {} : { q: filters.query }),
    ...(filters.topic === undefined ? {} : { topic: filters.topic }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export type ListState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | {
      status: 'ready';
      bots: MarketplaceEntry[];
      nextCursor?: string;
      loadingMore: boolean;
    };

function mergeBots(current: MarketplaceEntry[], next: MarketplaceEntry[]): MarketplaceEntry[] {
  const seen = new Set(next.map((bot) => bot.id));
  return [...current.filter((bot) => !seen.has(bot.id)), ...next];
}

export function MarketplaceInstalls({
  bot,
  t,
  className = 'bh-market-installs',
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  className?: string;
}): ReactElement {
  return (
    <span
      className={className}
      data-market-installs={bot.installs}
      aria-label={t('market.installs', { count: String(bot.installs) })}
      title={t('market.installs', { count: String(bot.installs) })}
    >
      {t('market.installsCount', { count: formatStars(bot.installs, marketplaceLanguage(t)) })}
    </span>
  );
}

export function MarketplaceMeta({
  bot,
  t,
  topics = true,
  created = false,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  topics?: boolean;
  created?: boolean;
}): ReactElement {
  return (
    <span className="bh-market-meta">
      {bot.source === 'upload' ? null : (
        <span>{t('market.stars', { count: String(bot.stars) })}</span>
      )}
      <MarketplaceInstalls bot={bot} t={t} />
      {bot.installed?.authorUpdated === true ? (
        <span data-market-author-updated="">
          <Tag tone="info">{t('market.authorUpdated')}</Tag>
        </span>
      ) : null}
      {created && bot.createdAt !== undefined ? (
        <span title={day(bot.createdAt)}>
          {t('market.created', { date: ago(bot.createdAt, t) })}
        </span>
      ) : (
        <span title={day(bot.pushedAt)}>{t('market.updated', { date: ago(bot.pushedAt, t) })}</span>
      )}
      {(topics ? bot.topics : []).map((topic) => (
        <Tag key={topic} tone="neutral">
          {topic}
        </Tag>
      ))}
    </span>
  );
}

export function MarketplaceAvatar({
  bot,
  size,
  t,
}: {
  bot: MarketplaceEntry;
  size: number;
  t: BotHarnessTranslate;
}): ReactElement {
  const avatar = bot.avatar;
  return (
    <span
      className="bh-market-avatar"
      aria-hidden="true"
      data-market-avatar={avatar === null ? 'seeded' : 'recipe' in avatar ? 'recipe' : 'image'}
    >
      <PersonaBotAvatar
        personaBotId=""
        name={marketplaceName(bot)}
        src={avatar !== null && 'image' in avatar ? avatar.image : undefined}
        appearance={
          avatar !== null && 'recipe' in avatar
            ? { recipe: avatar.recipe, revision: '0'.repeat(64) }
            : undefined
        }
        size={size}
        indicator={false}
        still
        t={t}
      />
    </span>
  );
}

function MarketplaceRow({
  bot,
  t,
  onOpen,
  onInstall,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  onOpen: () => void;
  onInstall: () => void;
}): ReactElement {
  return (
    <div
      className="bh-market-row"
      role="listitem"
      data-market-bot={bot.fullName}
      data-market-banner={bot.banner === null ? 'none' : 'shown'}
    >
      <MarketplaceBanner bot={bot} className="bh-market-banner-thumb" />
      <div className="bh-market-row-head">
        <MarketplaceAvatar bot={bot} size={64} t={t} />
        <button
          type="button"
          className="bh-market-copy bh-market-open"
          aria-label={t('market.detail.open', { name: bot.fullName })}
          onClick={onOpen}
        >
          <span className="bh-market-card-name">{marketplaceName(bot)}</span>
          <span className="bh-market-owner">{bot.fullName}</span>
        </button>
        <Button size="sm" variant="outline" onClick={onInstall}>
          {t('market.install')}
        </Button>
      </div>
      {bot.description === null ? null : <MarketplaceDescription bot={bot} t={t} />}
      <div className="bh-market-row-foot">
        {bot.roles.length === 0 ? null : (
          <span className="bh-market-card-tags">
            {bot.roles.map((role) => (
              <Tag key={role} tone="outline">
                {role}
              </Tag>
            ))}
          </span>
        )}
        <MarketplaceMeta bot={bot} t={t} topics={false} />
      </div>
    </div>
  );
}

export function MarketplaceBanner({
  bot,
  className,
}: {
  bot: MarketplaceEntry;
  className: string;
}): ReactElement {
  return (
    <span className={className} data-market-banner={bot.banner === null ? 'none' : 'shown'}>
      {bot.banner === null ? null : <BotBannerArt banner={bot.banner} />}
    </span>
  );
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; detail: MarketplaceDetail };

function ReportPanel({
  state,
  t,
  onReason,
}: {
  state: ReportState;
  t: BotHarnessTranslate;
  onReason: (reason: string) => void;
}): ReactElement | null {
  if (state.status === 'closed') return null;
  if (state.status === 'done') {
    return (
      <div className="bh-market-report" role="status" data-market-report="done">
        <strong>{t('market.report.doneTitle')}</strong>
        <span>{t('market.report.done')}</span>
      </div>
    );
  }
  return (
    <div className="bh-market-report" data-market-report="open">
      <strong>{t('market.report.title')}</strong>
      <span className="bh-market-hint">{t('market.report.hint')}</span>
      <label>
        <span>{t('market.report.reason')}</span>
        <textarea
          rows={3}
          maxLength={MAX_REPORT_REASON_LENGTH}
          placeholder={t('market.report.placeholder')}
          value={state.reason}
          disabled={state.phase !== 'idle'}
          onChange={(event) => onReason(event.currentTarget.value)}
        />
      </label>
      {state.phase === 'verifying' ? (
        <span className="bh-market-hint" role="status">
          {t('market.challenge.verifying')}
        </span>
      ) : null}
      {state.cause === undefined ? null : (
        <div className="bh-modal-error" role="alert">
          {marketplaceError(state.cause, t)}
        </div>
      )}
    </div>
  );
}

function MarketplaceDetailView({
  actions,
  bot,
  state,
  t,
  onRetry,
  report,
}: {
  actions: Pick<BridgeActions, 'marketplaceFile'>;
  bot: MarketplaceEntry;
  state: DetailState;
  t: BotHarnessTranslate;
  onRetry: () => void;
  report: ReactElement | null;
}): ReactElement {
  const [reading, setReading] = useState<MarketplaceFile | undefined>(undefined);
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: {
        copyLabel: t('message.code.copy'),
        copiedLabel: t('message.code.copied'),
      },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const shown = state.status === 'ready' ? state.detail.bot : bot;
  return (
    <div className="bh-market-detail" data-market-detail={shown.fullName}>
      <div className="bh-market-hero" data-market-banner={shown.banner === null ? 'none' : 'shown'}>
        <MarketplaceBanner bot={shown} className="bh-market-banner" />
        <div className="bh-market-row-head">
          <MarketplaceAvatar bot={shown} size={64} t={t} />
          <span className="bh-market-copy">
            <MarketplaceName bot={shown} />
          </span>
          {shown.source === 'upload' ? null : (
            <a className="bh-market-github" href={shown.htmlUrl} target="_blank" rel="noreferrer">
              {t('market.detail.github')}
            </a>
          )}
        </div>
        {shown.description === null ? null : <MarketplaceDescription bot={shown} t={t} />}
        <MarketplaceMeta bot={shown} t={t} />
      </div>
      {report}
      {state.status === 'loading' ? (
        <div className="bh-market-state" role="status">
          {t('market.detail.loading')}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <ReadFailure retryLabel={t('market.retry')} onRetry={onRetry}>
          {t('market.detail.error', { error: marketplaceError(state.cause, t) })}
        </ReadFailure>
      ) : null}
      {state.status === 'ready' && reading !== undefined ? (
        <MarketplaceFileReader
          actions={actions}
          botId={shown.id}
          file={reading}
          labels={labels}
          t={t}
          describeError={(cause) => marketplaceError(cause, t)}
          onBack={() => setReading(undefined)}
        />
      ) : null}
      {state.status === 'ready' && reading === undefined && state.detail.files !== undefined ? (
        <MarketplaceFileTree
          files={state.detail.files}
          {...(state.detail.fileSummary === undefined ? {} : { summary: state.detail.fileSummary })}
          t={t}
          onOpen={setReading}
        />
      ) : null}
      {state.status === 'ready' &&
      state.detail.readme === null &&
      state.detail.files === undefined ? (
        <div className="bh-market-state">{t('market.detail.noReadme')}</div>
      ) : null}
      {state.status === 'ready' && reading === undefined && state.detail.readme !== null ? (
        <div className="bh-market-readme" data-market-readme>
          <MarkdownText text={state.detail.readme} labels={labels} />
        </div>
      ) : null}
    </div>
  );
}

type ReviewState =
  | { status: 'reviewing' }
  | { status: 'ready'; result: InstallReviewResult }
  | { status: 'error'; cause: unknown };

const FINDING_ICONS: Record<InstallFinding['kind'], string> = {
  'prompt-injection': 'text-quote',
  exfiltration: 'globe',
  script: 'terminal',
};

function InstallFindings({
  findings,
  t,
}: {
  findings: readonly InstallFinding[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <ul className="bh-market-findings">
      {findings.map((finding) => (
        <li
          key={finding.kind + finding.path}
          className="bh-market-finding"
          data-market-finding={finding.kind}
        >
          <span className="bh-market-finding-icon" data-tone={finding.kind}>
            <ChannelSidebarIcon name={FINDING_ICONS[finding.kind]} size={14} />
          </span>
          <span className="bh-market-finding-body">
            <span className="bh-market-finding-head">
              <strong>{t(`market.review.kind.${finding.kind}`)}</strong>
              <code>{finding.path}</code>
            </span>
            {finding.note === undefined ? null : <span>{finding.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InstallReviewView({
  state,
  t,
  onRetry,
}: {
  state: ReviewState;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement {
  if (state.status === 'reviewing')
    return (
      <div className="bh-market-review" data-market-review="reviewing" role="status">
        <span className="bh-market-review-pulse" aria-hidden="true" />
        {t('market.review.reviewing')}
      </div>
    );
  if (state.status === 'error')
    return (
      <ReadFailure retryLabel={t('market.retry')} onRetry={onRetry}>
        {t('market.review.failed', { error: marketplaceError(state.cause, t) })}
      </ReadFailure>
    );
  const { review } = state.result;
  if (review.status === 'unavailable')
    return (
      <div className="bh-market-review-result" data-market-review="unavailable">
        <Callout tone="warning" role="alert" title={t('market.review.unavailable')}>
          {t('market.review.unavailableHint')}
        </Callout>
        {review.findings.length === 0 ? null : <InstallFindings findings={review.findings} t={t} />}
      </div>
    );
  if (review.findings.length === 0)
    return (
      <div className="bh-market-review" data-market-review="clean" data-tone="clean" role="status">
        <ChannelSidebarIcon name="shield-check" size={16} />
        {t('market.review.clean')}
        {review.partial ? <Note tone="subtle">{t('market.review.partial')}</Note> : null}
      </div>
    );
  return (
    <div className="bh-market-review-result" data-market-review="findings">
      <Callout
        tone="danger"
        role="alert"
        title={t('market.review.found', { count: String(review.findings.length) })}
      >
        <InstallFindings findings={review.findings} t={t} />
      </Callout>
      {review.partial ? <Note tone="subtle">{t('market.review.partial')}</Note> : null}
    </div>
  );
}

function InstallConfirmation({
  bot,
  t,
  review,
  onRetry,
  cause,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  review: ReviewState;
  onRetry: () => void;
  cause: unknown | undefined;
}): ReactElement {
  return (
    <div className="bh-market-confirm">
      <div className="bh-market-confirm-head">
        <PersonaBotAvatar
          personaBotId=""
          name={marketplaceName(bot)}
          size={44}
          indicator={false}
          t={t}
        />
        <span className="bh-market-copy">
          <MarketplaceName bot={bot} />
          {bot.description === null ? null : <MarketplaceDescription bot={bot} t={t} />}
        </span>
      </div>
      {bot.source === 'upload' ? (
        <dl className="bh-market-facts">
          <div>
            <dt>{t('market.confirm.author')}</dt>
            <dd data-market-author>
              <MarketplaceOwner bot={bot} />
            </dd>
          </div>
          <div>
            <dt>{t('market.confirm.uploaded')}</dt>
            <dd>{day(bot.pushedAt)}</dd>
          </div>
        </dl>
      ) : (
        <dl className="bh-market-facts">
          <div>
            <dt>{t('market.confirm.source')}</dt>
            <dd>
              <a href={bot.htmlUrl} target="_blank" rel="noreferrer">
                {bot.fullName}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('market.confirm.commit')}</dt>
            <dd data-market-commit>
              {bot.headCommit === null
                ? t('market.confirm.noCommit')
                : t('market.confirm.commitValue', {
                    sha: shortSha(bot.headCommit.sha),
                    date: day(bot.headCommit.committedAt),
                  })}
            </dd>
          </div>
        </dl>
      )}
      <InstallReviewView state={review} t={t} onRetry={onRetry} />
      {cause === undefined ? null : (
        <div className="bh-modal-error" role="alert">
          {t('market.install.failed', {
            error: personaBotCreateError(cause, t),
          })}
        </div>
      )}
    </div>
  );
}

function installLabel(review: ReviewState, installing: boolean, t: BotHarnessTranslate): string {
  if (installing) return t('market.confirm.installing');
  if (review.status !== 'ready') return t('market.confirm.reviewing');
  if (review.result.review.status === 'unavailable') return t('market.confirm.installUnreviewed');
  return review.result.review.findings.length === 0
    ? t('market.confirm.install')
    : t('market.confirm.installAnyway');
}

export interface MarketplaceBrowse {
  readonly list: ListState;
  readonly filters: Filters;
  readonly searchText: string;
  readonly topics: readonly MarketplaceTopic[];
  readonly mount: Ref<HTMLDivElement>;
  setSearchText(text: string): void;
  search(): void;
  chooseSort(sort: MarketplaceSort): void;
  chooseTopic(topic: string | undefined): void;
  retry(): void;
  loadMore(): void;
  prepend(bot: MarketplaceEntry): void;
  remove(id: string): void;
}

const SORT_STORAGE_KEY = 'botharness.marketplace.sort';

function preferredSort(): MarketplaceSort {
  try {
    const saved = globalThis.localStorage?.getItem(SORT_STORAGE_KEY);
    if (saved === 'stars' || saved === 'updated' || saved === 'created') return saved;
  } catch {}
  return 'stars';
}

export function useMarketplaceBrowse(
  actions: BridgeActions,
  lang: MarketplaceLanguage,
  options: { includeUploads?: boolean } = {},
): MarketplaceBrowse {
  const includeUploads = options.includeUploads === true;
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [filters, setFilters] = useState<Filters>(() => ({ sort: preferredSort(), query: '' }));
  const [searchText, setSearchText] = useState('');
  const [topics, setTopics] = useState<MarketplaceTopic[]>([]);
  const generation = useRef(0);
  const latestFilters = useRef(filters);

  const load = (next: Filters = latestFilters.current): void => {
    const ticket = ++generation.current;
    latestFilters.current = next;
    setFilters(next);
    setList({ status: 'loading' });
    void actions.marketplaceList(queryFor(next, lang, undefined, includeUploads)).then(
      (page) => {
        if (ticket !== generation.current) return;
        setList({
          status: 'ready',
          bots: page.bots,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          loadingMore: false,
        });
      },
      (cause: unknown) => {
        if (ticket === generation.current) setList({ status: 'error', cause });
      },
    );
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    load();
    void actions.marketplaceTopics().then(
      (loaded) => setTopics(loaded.slice(0, VISIBLE_TOPICS)),
      () => setTopics([]),
    );
    return () => {
      generation.current += 1;
    };
  }, [lang]);

  return {
    list,
    filters,
    searchText,
    topics,
    mount,
    setSearchText,
    search: () => load({ ...latestFilters.current, query: searchText.trim() }),
    chooseSort: (sort) => {
      try {
        globalThis.localStorage?.setItem(SORT_STORAGE_KEY, sort);
      } catch {}
      load({ ...latestFilters.current, sort });
    },
    chooseTopic: (topic) => {
      const { topic: _previous, ...rest } = latestFilters.current;
      load(topic === undefined ? rest : { ...rest, topic });
    },
    retry: () => load(),
    loadMore: () => {
      if (list.status !== 'ready' || list.nextCursor === undefined || list.loadingMore) return;
      const ticket = generation.current;
      const current = list;
      setList({ ...current, loadingMore: true });
      void actions
        .marketplaceList(queryFor(filters, lang, current.nextCursor, includeUploads))
        .then(
          (page) => {
            if (ticket !== generation.current) return;
            setList({
              status: 'ready',
              bots: mergeBots(current.bots, page.bots),
              ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
              loadingMore: false,
            });
          },
          (cause: unknown) => {
            if (ticket === generation.current) setList({ status: 'error', cause });
          },
        );
    },
    prepend: (bot) =>
      setList((current) =>
        current.status === 'ready'
          ? { ...current, bots: [bot, ...current.bots.filter((item) => item.id !== bot.id)] }
          : { status: 'ready', bots: [bot], loadingMore: false },
      ),
    remove: (id) =>
      setList((current) =>
        current.status === 'ready'
          ? { ...current, bots: current.bots.filter((item) => item.id !== id) }
          : current,
      ),
  };
}

export function MarketplaceBrowseControls({
  browse,
  t,
  action,
}: {
  browse: MarketplaceBrowse;
  t: BotHarnessTranslate;
  action?: ReactNode;
}): ReactElement {
  const sortId = useId();
  const { filters, topics } = browse;
  const sortOptions = [
    { value: 'created' as const, label: t('market.sort.created') },
    { value: 'updated' as const, label: t('market.sort.updated') },
    { value: 'stars' as const, label: t('market.sort.stars') },
  ];
  return (
    <>
      <div className="bh-market-browse">
        <Input
          type="search"
          aria-label={t('market.search.label')}
          placeholder={t('market.search.placeholder')}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_QUERY_LENGTH}
          value={browse.searchText}
          onChange={(event) => browse.setSearchText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!committedEnter(event)) return;
            event.preventDefault();
            browse.search();
          }}
        />
        {action}
        <div className="bh-market-sort">
          <SegmentedControl
            id={sortId}
            label={t('market.sort.label')}
            value={filters.sort}
            options={sortOptions}
            disabled={filters.query.length > 0}
            onChange={browse.chooseSort}
          />
          <span className="bh-market-sort-menu">
            <Select
              label={t('market.sort.label')}
              value={filters.sort}
              options={sortOptions}
              disabled={filters.query.length > 0}
              align="start"
              onChange={browse.chooseSort}
            />
          </span>
        </div>
      </div>
      {filters.query.length > 0 ? (
        <span className="bh-market-hint">{t('market.search.relevance')}</span>
      ) : null}
      {topics.length === 0 ? null : (
        <div className="bh-market-topics" role="group" aria-label={t('market.topics.label')}>
          <button
            type="button"
            className="bh-market-topic"
            aria-pressed={filters.topic === undefined}
            onClick={() => browse.chooseTopic(undefined)}
          >
            {t('market.topics.all')}
          </button>
          {topics.map(({ topic, count }) => (
            <button
              key={topic}
              type="button"
              className="bh-market-topic"
              data-market-topic={topic}
              aria-pressed={filters.topic === topic}
              onClick={() => browse.chooseTopic(filters.topic === topic ? undefined : topic)}
            >
              {topic}
              <span className="bh-market-topic-count">{count}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function MarketplaceListStatus({
  browse,
  t,
}: {
  browse: MarketplaceBrowse;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { list, filters } = browse;
  if (list.status === 'loading') {
    return (
      <div className="bh-market-state" role="status">
        {t('market.loading')}
      </div>
    );
  }
  if (list.status === 'error') {
    return (
      <ReadFailure retryLabel={t('market.retry')} onRetry={browse.retry}>
        {t('market.error.load', { error: marketplaceError(list.cause, t) })}
      </ReadFailure>
    );
  }
  if (list.bots.length > 0) return null;
  return (
    <div className="bh-market-state">
      {filters.query.length > 0 || filters.topic !== undefined
        ? t('market.search.empty')
        : t('market.empty')}
    </div>
  );
}

export function MarketplaceLoadMore({
  browse,
  t,
}: {
  browse: MarketplaceBrowse;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const { list } = browse;
  if (list.status !== 'ready' || list.nextCursor === undefined) return null;
  return (
    <Button variant="outline" disabled={list.loadingMore} onClick={browse.loadMore}>
      {list.loadingMore ? t('market.loadingMore') : t('market.loadMore')}
    </Button>
  );
}

export interface MarketplaceSubmit {
  readonly url: string;
  readonly phase: Phase;
  readonly cause: unknown | undefined;
  readonly submitted: string | undefined;
  setUrl(url: string): void;
  submit(): void;
}

export function useMarketplaceSubmit(
  actions: BridgeActions,
  onListed: (bot: MarketplaceEntry) => void,
): MarketplaceSubmit {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [cause, setCause] = useState<unknown | undefined>(undefined);
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  return {
    url,
    phase,
    cause,
    submitted,
    setUrl,
    submit: () => {
      const trimmed = url.trim();
      if (trimmed.length === 0 || phase !== 'idle') return;
      setPhase('verifying');
      setCause(undefined);
      setSubmitted(undefined);
      void proveHuman(actions)
        .then((altcha) => {
          setPhase('sending');
          return actions.marketplaceSubmit(trimmed, altcha);
        })
        .then(
          (bot) => {
            setPhase('idle');
            setUrl('');
            setSubmitted(bot.fullName);
            onListed(bot);
          },
          (failure: unknown) => {
            setPhase('idle');
            setCause(failure);
          },
        );
    },
  };
}

export function MarketplaceSubmitField({
  submit,
  t,
}: {
  submit: MarketplaceSubmit;
  t: BotHarnessTranslate;
}): ReactElement {
  const busy = submit.phase !== 'idle';
  return (
    <>
      <div className="bh-market-submit">
        <Input
          aria-label={t('market.submit.label')}
          placeholder={t('market.submit.placeholder')}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={submit.url}
          disabled={busy}
          onChange={(event) => submit.setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!committedEnter(event)) return;
            event.preventDefault();
            submit.submit();
          }}
        />
        <Button
          variant="primary"
          disabled={busy || submit.url.trim().length === 0}
          onClick={submit.submit}
        >
          {submit.phase === 'verifying'
            ? t('market.challenge.verifying')
            : busy
              ? t('market.submit.busy')
              : t('market.submit.action')}
        </Button>
      </div>
      <span className="bh-market-hint">
        {submit.submitted === undefined
          ? t('market.submit.hint')
          : t('market.submit.done', { name: submit.submitted })}
      </span>
      {submit.cause === undefined ? null : (
        <Note tone="danger">{marketplaceError(submit.cause, t)}</Note>
      )}
    </>
  );
}

export interface MarketplaceFlowStart {
  readonly bot: MarketplaceEntry;
  readonly step: 'detail' | 'install';
  readonly source?: MarketplaceInstallSource;
}

export function MarketplaceBotFlow({
  actions,
  t,
  start,
  onExit,
  onClose,
  onInstalled,
  page,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  start: MarketplaceFlowStart;
  onExit: () => void;
  onClose: () => void;
  onInstalled: () => void;
  page?: { readonly hidden: boolean } | undefined;
}): ReactElement {
  const lang = marketplaceLanguage(t);
  const viewing = start.step === 'detail' ? start.bot : undefined;
  const [selected, setSelected] = useState<MarketplaceEntry | undefined>(
    start.step === 'install' ? start.bot : undefined,
  );
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' });
  const [report, setReport] = useState<ReportState>({ status: 'closed' });
  const [installing, setInstalling] = useState(false);
  const [installCause, setInstallCause] = useState<unknown | undefined>(undefined);
  const [review, setReview] = useState<ReviewState>({ status: 'reviewing' });
  const detailGeneration = useRef(0);
  const reviewGeneration = useRef(0);

  const startReview = (bot: MarketplaceEntry): void => {
    const ticket = ++reviewGeneration.current;
    setReview({ status: 'reviewing' });
    void actions.marketplaceInstallReview(bot.id, lang).then(
      (result) => {
        if (ticket === reviewGeneration.current) setReview({ status: 'ready', result });
      },
      (cause: unknown) => {
        if (ticket === reviewGeneration.current) setReview({ status: 'error', cause });
      },
    );
  };

  const choose = (bot: MarketplaceEntry | undefined): void => {
    setSelected(bot);
    setInstallCause(undefined);
    if (bot === undefined) reviewGeneration.current += 1;
    else startReview(bot);
  };

  const loadReview = useMountedResource<HTMLDivElement>(() => {
    if (start.step === 'install') startReview(start.bot);
    return () => {
      reviewGeneration.current += 1;
    };
  }, []);

  const openDetail = (bot: MarketplaceEntry): void => {
    const ticket = ++detailGeneration.current;
    setReport({ status: 'closed' });
    setDetail({ status: 'loading' });
    void actions.marketplaceDetail(bot.id, lang).then(
      (loaded) => {
        if (ticket === detailGeneration.current) setDetail({ status: 'ready', detail: loaded });
      },
      (cause: unknown) => {
        if (ticket === detailGeneration.current) setDetail({ status: 'error', cause });
      },
    );
  };

  const loadDetail = useMountedResource<HTMLDivElement>(() => {
    if (viewing !== undefined) openDetail(viewing);
    return () => {
      detailGeneration.current += 1;
    };
  }, [lang]);

  const sendReport = (bot: MarketplaceEntry): void => {
    if (report.status !== 'open' || report.phase !== 'idle') return;
    const reason = report.reason.trim();
    const ticket = detailGeneration.current;
    setReport({ status: 'open', reason: report.reason, phase: 'verifying' });
    void proveHuman(actions)
      .then((altcha) => {
        if (ticket === detailGeneration.current) {
          setReport({ status: 'open', reason: report.reason, phase: 'sending' });
        }
        return actions.marketplaceReport(bot.id, altcha, reason.length === 0 ? undefined : reason);
      })
      .then(
        () => {
          if (ticket === detailGeneration.current) setReport({ status: 'done' });
        },
        (cause: unknown) => {
          if (ticket === detailGeneration.current) {
            setReport({ status: 'open', reason: report.reason, phase: 'idle', cause });
          }
        },
      );
  };

  const install = (): void => {
    if (selected === undefined || installing || review.status !== 'ready') return;
    setInstalling(true);
    setInstallCause(undefined);
    const installed: Promise<unknown> = actions.marketplaceInstall(
      selected.id,
      review.result.reviewId,
      undefined,
      start.source ?? 'list',
    );
    void installed.then(
      () => {
        setInstalling(false);
        onInstalled();
      },
      (cause: unknown) => {
        setInstalling(false);
        setInstallCause(cause);
      },
    );
  };

  const confirm =
    selected === undefined ? null : (
      <PanelDialog
        size="medium"
        fill
        onClose={() => {
          if (installing) return;
          if (page === undefined) onClose();
          else choose(undefined);
        }}
        closeLabel={t('common.close')}
        title={t('market.confirm.title', { name: marketplaceName(selected) })}
        bodyRef={loadReview}
        data={{ 'data-market-install': review.status }}
        actions={
          <>
            <Button
              variant="outline"
              disabled={installing}
              onClick={() => {
                if (viewing === undefined) onExit();
                else choose(undefined);
              }}
            >
              {t('market.back')}
            </Button>
            <Button
              variant={
                review.status === 'ready' &&
                review.result.review.status === 'reviewed' &&
                review.result.review.findings.length === 0
                  ? 'primary'
                  : 'outline'
              }
              disabled={installing || review.status !== 'ready'}
              onClick={install}
            >
              {installLabel(review, installing, t)}
            </Button>
          </>
        }
      >
        <InstallConfirmation
          bot={review.status === 'ready' ? review.result.listing : selected}
          t={t}
          review={review}
          onRetry={() => startReview(selected)}
          cause={installCause}
        />
      </PanelDialog>
    );

  if (confirm !== null && (page === undefined || viewing === undefined)) return confirm;

  const bot = viewing ?? start.bot;
  const shown = detail.status === 'ready' ? detail.detail.bot : bot;
  const secondary =
    report.status === 'closed' ? (
      <Button
        variant="ghost"
        onClick={() => setReport({ status: 'open', reason: '', phase: 'idle' })}
      >
        {t('market.report.open')}
      </Button>
    ) : undefined;
  const footer =
    report.status === 'open' ? (
      <>
        <Button
          variant="outline"
          disabled={report.phase !== 'idle'}
          onClick={() => setReport({ status: 'closed' })}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={report.phase !== 'idle'}
          onClick={() => sendReport(shown)}
        >
          {report.phase === 'verifying'
            ? t('market.challenge.verifying')
            : report.phase === 'sending'
              ? t('market.report.sending')
              : t('market.report.send')}
        </Button>
      </>
    ) : (
      <>
        {page === undefined ? (
          <Button variant="outline" onClick={onExit}>
            {t('market.back')}
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => choose(shown)}>
          {t('market.install')}
        </Button>
      </>
    );
  const body = (
    <MarketplaceDetailView
      actions={actions}
      bot={bot}
      state={detail}
      t={t}
      onRetry={() => openDetail(bot)}
      report={
        <ReportPanel
          state={report}
          t={t}
          onReason={(reason) =>
            setReport((current) =>
              current.status === 'open' ? { ...current, reason, cause: undefined } : current,
            )
          }
        />
      }
    />
  );

  if (page !== undefined) {
    return (
      <MarketPage
        page="bot"
        title={marketplaceName(shown)}
        hidden={page.hidden}
        t={t}
        onBack={onExit}
        pageRef={loadDetail}
        secondary={secondary}
        actions={footer}
      >
        {body}
        {confirm}
      </MarketPage>
    );
  }

  return (
    <PanelDialog
      size="medium"
      fill
      onClose={onClose}
      closeLabel={t('common.close')}
      title={marketplaceName(shown)}
      bodyRef={loadDetail}
      {...(secondary === undefined ? {} : { secondary })}
      actions={footer}
    >
      {body}
    </PanelDialog>
  );
}

export function MarketplaceModal({
  actions,
  t,
  onClose,
  onInstalled,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
  onInstalled: () => void;
}): ReactElement {
  const browse = useMarketplaceBrowse(actions, marketplaceLanguage(t));
  const submit = useMarketplaceSubmit(actions, browse.prepend);
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);
  const { list } = browse;

  if (flow !== undefined) {
    return (
      <MarketplaceBotFlow
        actions={actions}
        t={t}
        start={flow}
        onExit={() => setFlow(undefined)}
        onClose={onClose}
        onInstalled={onInstalled}
      />
    );
  }

  return (
    <PanelDialog
      size="medium"
      fill
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('market.title')}
      description={t('market.description')}
      bodyRef={browse.mount}
      data={{ 'data-market': '' }}
      actions={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <MarketplaceSubmitField submit={submit} t={t} />
      <MarketplaceBrowseControls browse={browse} t={t} />
      <MarketplaceListStatus browse={browse} t={t} />
      {list.status === 'ready' && list.bots.length > 0 ? (
        <div className="bh-market-list" role="list" aria-label={t('market.title')}>
          {list.bots.map((bot) => (
            <MarketplaceRow
              key={bot.id}
              bot={bot}
              t={t}
              onOpen={() => setFlow({ bot, step: 'detail' })}
              onInstall={() => setFlow({ bot, step: 'install' })}
            />
          ))}
        </div>
      ) : null}
      <MarketplaceLoadMore browse={browse} t={t} />
    </PanelDialog>
  );
}
