import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { SegmentedControl } from './ds/segmented.js';
import { ReadFailure } from './ds/read-failure.js';
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

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
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Callout } from './ds/callout.js';
import { BridgeCallError } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { Note } from './ds/note.js';
import { Tooltip } from './ds/tooltip.js';
import { CommunityIcon } from './community-icons.js';
import { Select } from './ds/select.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { MarketplaceFileReader, MarketplaceFileTree } from './market-files.js';
import { MarketplaceSkills } from './bot-skills-card.js';
import { MarketPage } from './market-page.js';
import { useMountedResource } from './mounted-resource.js';

import {
  MarketplaceAvatar,
  MarketplaceBanner,
  MarketplaceDescription,
  marketplaceLanguage,
  MarketplaceMeta,
  MarketplaceName,
  marketplaceName,
} from './marketplace-listing.js';
import { marketplaceError } from './marketplace-feedback.js';
import {
  ReportActions,
  ReportButton,
  ReportPanel,
  useMarketplaceReport,
} from './marketplace-report.js';
import { MarketplaceListStatus, MarketplaceLoadMore } from './marketplace-list-status.js';
import {
  committedEnter,
  MarketplaceSubmitField,
  useMarketplaceSubmission,
  type MarketplaceSubmit,
} from './marketplace-submit.js';
import { InstallConfirmation } from './marketplace-install-confirmation.js';

export type { MarketplaceEntry, MarketplaceLanguage };
export { marketplaceError, type Phase } from './marketplace-feedback.js';
export { MAX_REPORT_REASON_LENGTH } from './marketplace-report.js';
export { MarketplaceListStatus, MarketplaceLoadMore } from './marketplace-list-status.js';
export {
  committedEnter,
  MarketplaceSubmitField,
  type MarketplaceSubmit,
} from './marketplace-submit.js';
export {
  MarketplaceAvatar,
  MarketplaceBanner,
  MarketplaceDescription,
  MarketplaceInstalls,
  marketplaceLanguage,
  MarketplaceMeta,
  marketplaceName,
  MarketplaceOwner,
  marketplaceOwner,
  shortSha,
} from './marketplace-listing.js';

type MarketplaceChallengeActions = Pick<BridgeActions, 'marketplaceChallenge'>;

export async function proveHuman(actions: MarketplaceChallengeActions): Promise<string> {
  const challenge = await actions.marketplaceChallenge();
  const payload = await solveChallenge(challenge, {
    yieldEvery: () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  if (payload === undefined)
    throw new BridgeCallError('challenge-invalid', 'challenge could not be solved');
  return payload;
}

const VISIBLE_TOPICS = 12;
const MAX_QUERY_LENGTH = 100;

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

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; detail: MarketplaceDetail };

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
          {shown.source === 'upload' ? null : (
            <Tooltip label={t('market.detail.github')} side="bottom" delayMs={500}>
              <a
                className="bh-market-github"
                href={shown.htmlUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('market.detail.github')}
              >
                <CommunityIcon name="github" size={18} />
              </a>
            </Tooltip>
          )}
        </div>
        <div className="bh-market-hero-name">
          <MarketplaceName bot={shown} />
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
          {t('market.detail.error', {
            error: marketplaceError(state.cause, t),
          })}
        </ReadFailure>
      ) : null}
      {state.status === 'ready' && reading !== undefined ? (
        <MarketplaceFileReader
          actions={actions}
          botId={shown.id}
          file={reading}
          t={t}
          describeError={(cause) => marketplaceError(cause, t)}
          onBack={() => setReading(undefined)}
        />
      ) : null}
      {state.status === 'ready' && reading === undefined && state.detail.files !== undefined ? (
        <MarketplaceSkills
          actions={actions}
          botId={shown.id}
          files={state.detail.files}
          t={t}
          describeError={(cause) => marketplaceError(cause, t)}
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
        title={t('market.review.found', {
          count: String(review.findings.length),
        })}
      >
        <InstallFindings findings={review.findings} t={t} />
      </Callout>
      {review.partial ? <Note tone="subtle">{t('market.review.partial')}</Note> : null}
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
  const [filters, setFilters] = useState<Filters>(() => ({
    sort: preferredSort(),
    query: '',
  }));
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
          ? {
              ...current,
              bots: [bot, ...current.bots.filter((item) => item.id !== bot.id)],
            }
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

export function useMarketplaceSubmit(
  actions: BridgeActions,
  onListed: (bot: MarketplaceEntry) => void,
): MarketplaceSubmit {
  return useMarketplaceSubmission(actions, onListed, proveHuman);
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
  const report = useMarketplaceReport(() => proveHuman(actions), actions.marketplaceReport);
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
    report.close();
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
          reviewView={
            <InstallReviewView state={review} t={t} onRetry={() => startReview(selected)} />
          }
          cause={installCause}
        />
      </PanelDialog>
    );

  if (confirm !== null && (page === undefined || viewing === undefined)) return confirm;

  const bot = viewing ?? start.bot;
  const shown = detail.status === 'ready' ? detail.detail.bot : bot;
  const secondary =
    report.state.status === 'closed' ? <ReportButton report={report} t={t} /> : undefined;
  const footer =
    report.state.status === 'open' ? (
      <ReportActions report={report} id={shown.id} t={t} />
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
      report={<ReportPanel report={report} t={t} />}
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
  target,
  actions,
  t,
  onClose,
  onInstalled,
}: {
  target?: ReactNode;
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
      {target}
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
