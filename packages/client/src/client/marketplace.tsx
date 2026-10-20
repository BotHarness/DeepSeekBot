import { useId, useMemo, useRef, useState, type ReactElement } from 'react';

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
  MarketplaceQuery,
  MarketplaceSort,
  MarketplaceTopic,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { BotBannerArt } from './bot-banner.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
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
  'challenge-unavailable': 'market.error.challengeUnavailable',
  'challenge-invalid': 'market.error.challenge',
  'challenge-expired': 'market.error.challenge',
  'challenge-replayed': 'market.error.challenge',
  'rate-limited': 'market.error.rateLimited',
  'repository-rate-limited': 'market.error.repositoryRateLimited',
  'invalid-report': 'market.error.invalidReport',
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

type Phase = 'idle' | 'verifying' | 'sending';

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

function MarketplaceName({ bot }: { bot: MarketplaceEntry }): ReactElement {
  return (
    <span className="bh-market-name">
      <span>{marketplaceName(bot)}</span>
      <span className="bh-market-owner">{bot.displayName === null ? bot.owner : bot.fullName}</span>
      {bot.roles.map((role) => (
        <Tag key={role} tone="outline">
          {role}
        </Tag>
      ))}
    </span>
  );
}

function MarketplaceDescription({
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

export const SEARCH_DEBOUNCE_MS = 300;
const VISIBLE_TOPICS = 12;
const MAX_QUERY_LENGTH = 100;

interface Filters {
  sort: MarketplaceSort;
  query: string;
  topic?: string;
}

function queryFor(filters: Filters, lang: MarketplaceLanguage, cursor?: string): MarketplaceQuery {
  return {
    sort: filters.sort,
    lang,
    ...(filters.query.length === 0 ? {} : { q: filters.query }),
    ...(filters.topic === undefined ? {} : { topic: filters.topic }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

type ListState =
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

function MarketplaceMeta({
  bot,
  t,
  topics = true,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
  topics?: boolean;
}): ReactElement {
  return (
    <span className="bh-market-meta">
      <span>{t('market.stars', { count: String(bot.stars) })}</span>
      <span>{t('market.updated', { date: day(bot.pushedAt) })}</span>
      {(topics ? bot.topics : []).map((topic) => (
        <Tag key={topic} tone="neutral">
          {topic}
        </Tag>
      ))}
    </span>
  );
}

function MarketplaceAvatar({
  bot,
  size,
  t,
}: {
  bot: MarketplaceEntry;
  size: number;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span className="bh-market-avatar" aria-hidden="true">
      <PersonaBotAvatar
        personaBotId=""
        name={marketplaceName(bot)}
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

function MarketplaceBanner({
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
  bot,
  state,
  t,
  onRetry,
  report,
}: {
  bot: MarketplaceEntry;
  state: DetailState;
  t: BotHarnessTranslate;
  onRetry: () => void;
  report: ReactElement | null;
}): ReactElement {
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
          <a className="bh-market-github" href={shown.htmlUrl} target="_blank" rel="noreferrer">
            {t('market.detail.github')}
          </a>
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
        <div className="bh-market-state" role="alert">
          <span>
            {t('market.detail.error', {
              error: marketplaceError(state.cause, t),
            })}
          </span>
          <Button variant="outline" onClick={onRetry}>
            {t('market.retry')}
          </Button>
        </div>
      ) : null}
      {state.status === 'ready' && state.detail.readme === null ? (
        <div className="bh-market-state">{t('market.detail.noReadme')}</div>
      ) : null}
      {state.status === 'ready' && state.detail.readme !== null ? (
        <div className="bh-market-readme" data-market-readme>
          <MarkdownText text={state.detail.readme} labels={labels} />
        </div>
      ) : null}
    </div>
  );
}

function InstallConfirmation({
  bot,
  t,
  cause,
}: {
  bot: MarketplaceEntry;
  t: BotHarnessTranslate;
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
      <div className="bh-market-risk" role="note">
        <strong>{t('market.confirm.riskTitle')}</strong>
        <span>{t('market.confirm.risk')}</span>
        <span>{t('market.confirm.newer')}</span>
      </div>
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
  const lang: MarketplaceLanguage = t('market.language') === 'en' ? 'en' : 'zh';
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [filters, setFilters] = useState<Filters>({
    sort: 'updated',
    query: '',
  });
  const [searchText, setSearchText] = useState('');
  const [topics, setTopics] = useState<MarketplaceTopic[]>([]);
  const [url, setUrl] = useState('');
  const [submitPhase, setSubmitPhase] = useState<Phase>('idle');
  const submitting = submitPhase !== 'idle';
  const [report, setReport] = useState<ReportState>({ status: 'closed' });
  const [submitCause, setSubmitCause] = useState<unknown | undefined>(undefined);
  const [submitted, setSubmitted] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<MarketplaceEntry | undefined>(undefined);
  const [viewing, setViewing] = useState<MarketplaceEntry | undefined>(undefined);
  const [detail, setDetail] = useState<DetailState>({ status: 'loading' });
  const detailGeneration = useRef(0);
  const [installing, setInstalling] = useState(false);
  const [installCause, setInstallCause] = useState<unknown | undefined>(undefined);
  const generation = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestFilters = useRef(filters);
  const sortId = useId();

  const load = (next: Filters = filters): void => {
    const ticket = ++generation.current;
    latestFilters.current = next;
    setFilters(next);
    setList({ status: 'loading' });
    void actions.marketplaceList(queryFor(next, lang)).then(
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

  const loadOnMount = useMountedResource<HTMLDivElement>(() => {
    load();
    void actions.marketplaceTopics().then(
      (loaded) => setTopics(loaded.slice(0, VISIBLE_TOPICS)),
      () => setTopics([]),
    );
    return () => {
      generation.current += 1;
      clearTimeout(searchTimer.current);
    };
  }, [lang]);

  const search = (text: string): void => {
    setSearchText(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const query = text.trim();
      const current = latestFilters.current;
      if (query !== current.query) load({ ...current, query });
    }, SEARCH_DEBOUNCE_MS);
  };

  const chooseTopic = (topic: string | undefined): void => {
    const { topic: _previous, ...rest } = filters;
    load(topic === undefined ? rest : { ...rest, topic });
  };

  const loadMore = (): void => {
    if (list.status !== 'ready' || list.nextCursor === undefined || list.loadingMore) return;
    const ticket = generation.current;
    const current = list;
    setList({ ...current, loadingMore: true });
    void actions.marketplaceList(queryFor(filters, lang, current.nextCursor)).then(
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
  };

  const detailLang = useRef(lang);
  const openDetail = (bot: MarketplaceEntry): void => {
    const ticket = ++detailGeneration.current;
    detailLang.current = lang;
    setViewing(bot);
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

  const reloadDetail = useMountedResource<HTMLDivElement>(() => {
    if (viewing !== undefined && detailLang.current !== lang) openDetail(viewing);
  }, [lang]);

  const submit = (): void => {
    const trimmed = url.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmitPhase('verifying');
    setSubmitCause(undefined);
    setSubmitted(undefined);
    void proveHuman(actions)
      .then((altcha) => {
        setSubmitPhase('sending');
        return actions.marketplaceSubmit(trimmed, altcha);
      })
      .then(
        (bot) => {
          setSubmitPhase('idle');
          setUrl('');
          setSubmitted(bot.fullName);
          setList((current) =>
            current.status === 'ready'
              ? {
                  ...current,
                  bots: [bot, ...current.bots.filter((item) => item.id !== bot.id)],
                }
              : { status: 'ready', bots: [bot], loadingMore: false },
          );
        },
        (cause: unknown) => {
          setSubmitPhase('idle');
          setSubmitCause(cause);
        },
      );
  };

  const sendReport = (bot: MarketplaceEntry): void => {
    if (report.status !== 'open' || report.phase !== 'idle') return;
    const reason = report.reason.trim();
    const ticket = detailGeneration.current;
    setReport({ status: 'open', reason: report.reason, phase: 'verifying' });
    void proveHuman(actions)
      .then((altcha) => {
        if (ticket === detailGeneration.current) {
          setReport({
            status: 'open',
            reason: report.reason,
            phase: 'sending',
          });
        }
        return actions.marketplaceReport(bot.id, altcha, reason.length === 0 ? undefined : reason);
      })
      .then(
        () => {
          if (ticket === detailGeneration.current) setReport({ status: 'done' });
        },
        (cause: unknown) => {
          if (ticket === detailGeneration.current) {
            setReport({
              status: 'open',
              reason: report.reason,
              phase: 'idle',
              cause,
            });
          }
        },
      );
  };

  const install = (): void => {
    if (selected === undefined || installing) return;
    setInstalling(true);
    setInstallCause(undefined);
    void actions
      .createBot({
        displayName: marketplaceName(selected),
        gitUrl: selected.cloneUrl,
        roles: selected.roles,
        origin: 'marketplace',
        ...(selected.description === null ? {} : { description: selected.description }),
      })
      .then(
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

  if (selected !== undefined) {
    return (
      <PanelDialog
        size="medium"
        fill
        onClose={() => {
          if (!installing) onClose();
        }}
        closeLabel={t('common.close')}
        title={t('market.confirm.title', { name: marketplaceName(selected) })}
        actions={
          <>
            <Button
              variant="outline"
              disabled={installing}
              onClick={() => {
                setSelected(undefined);
                setInstallCause(undefined);
              }}
            >
              {t('market.back')}
            </Button>
            <Button variant="primary" disabled={installing} onClick={install}>
              {installing ? t('market.confirm.installing') : t('market.confirm.install')}
            </Button>
          </>
        }
      >
        <InstallConfirmation bot={selected} t={t} cause={installCause} />
      </PanelDialog>
    );
  }

  if (viewing !== undefined) {
    const shown = detail.status === 'ready' ? detail.detail.bot : viewing;
    return (
      <PanelDialog
        size="medium"
        fill
        onClose={onClose}
        closeLabel={t('common.close')}
        title={marketplaceName(shown)}
        bodyRef={reloadDetail}
        {...(report.status === 'closed'
          ? {
              secondary: (
                <Button
                  variant="ghost"
                  onClick={() => setReport({ status: 'open', reason: '', phase: 'idle' })}
                >
                  {t('market.report.open')}
                </Button>
              ),
            }
          : {})}
        actions={
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
              <Button
                variant="outline"
                onClick={() => {
                  detailGeneration.current += 1;
                  setViewing(undefined);
                }}
              >
                {t('market.back')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setSelected(shown);
                  setInstallCause(undefined);
                }}
              >
                {t('market.install')}
              </Button>
            </>
          )
        }
      >
        <MarketplaceDetailView
          bot={viewing}
          state={detail}
          t={t}
          onRetry={() => openDetail(viewing)}
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
      </PanelDialog>
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
      bodyRef={loadOnMount}
      data={{ 'data-market': '' }}
      actions={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="bh-market-submit">
        <Input
          aria-label={t('market.submit.label')}
          placeholder={t('market.submit.placeholder')}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={url}
          disabled={submitting}
          onChange={(event) => setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submit();
          }}
        />
        <Button variant="primary" disabled={submitting || url.trim().length === 0} onClick={submit}>
          {submitPhase === 'verifying'
            ? t('market.challenge.verifying')
            : submitting
              ? t('market.submit.busy')
              : t('market.submit.action')}
        </Button>
      </div>
      <span className="bh-market-hint">
        {submitted === undefined
          ? t('market.submit.hint')
          : t('market.submit.done', { name: submitted })}
      </span>
      {submitCause === undefined ? null : (
        <Note tone="danger">{marketplaceError(submitCause, t)}</Note>
      )}
      <div className="bh-market-browse">
        <Input
          type="search"
          aria-label={t('market.search.label')}
          placeholder={t('market.search.placeholder')}
          autoComplete="off"
          maxLength={MAX_QUERY_LENGTH}
          value={searchText}
          onChange={(event) => search(event.currentTarget.value)}
        />
        <SegmentedControl
          id={sortId}
          label={t('market.sort.label')}
          value={filters.sort}
          options={[
            { value: 'updated', label: t('market.sort.updated') },
            { value: 'stars', label: t('market.sort.stars') },
          ]}
          disabled={filters.query.length > 0}
          onChange={(sort) => load({ ...filters, sort })}
        />
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
            onClick={() => chooseTopic(undefined)}
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
              onClick={() => chooseTopic(filters.topic === topic ? undefined : topic)}
            >
              {topic}
              <span className="bh-market-topic-count">{count}</span>
            </button>
          ))}
        </div>
      )}
      {list.status === 'loading' ? (
        <div className="bh-market-state" role="status">
          {t('market.loading')}
        </div>
      ) : null}
      {list.status === 'error' ? (
        <div className="bh-market-state" role="alert">
          <span>{t('market.error.load', { error: marketplaceError(list.cause, t) })}</span>
          <Button variant="outline" onClick={() => load()}>
            {t('market.retry')}
          </Button>
        </div>
      ) : null}
      {list.status === 'ready' && list.bots.length === 0 ? (
        <div className="bh-market-state">
          {filters.query.length > 0 || filters.topic !== undefined
            ? t('market.search.empty')
            : t('market.empty')}
        </div>
      ) : null}
      {list.status === 'ready' && list.bots.length > 0 ? (
        <div className="bh-market-list" role="list" aria-label={t('market.title')}>
          {list.bots.map((bot) => (
            <MarketplaceRow
              key={bot.id}
              bot={bot}
              t={t}
              onOpen={() => openDetail(bot)}
              onInstall={() => {
                setSelected(bot);
                setInstallCause(undefined);
              }}
            />
          ))}
        </div>
      ) : null}
      {list.status === 'ready' && list.nextCursor !== undefined ? (
        <Button variant="outline" disabled={list.loadingMore} onClick={loadMore}>
          {list.loadingMore ? t('market.loadingMore') : t('market.loadMore')}
        </Button>
      ) : null}
    </PanelDialog>
  );
}
