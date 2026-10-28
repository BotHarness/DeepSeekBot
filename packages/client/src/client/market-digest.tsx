import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceDigest,
  MarketplaceDigestSummary,
  MarketplaceEntry,
} from '../../../core/src/marketplace/client.js';
import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';
import type { BridgeActions } from './actions.js';
import { Note } from './ds/note.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { DigestCover, digestPickOf } from './market-cover.js';
import { MarketPage } from './market-page.js';
import { marketplaceError } from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

export const DAILY_PICKS_SHOWN = 7;

const NARROW = '@container bh-market (max-width: 480px)';

const styles = stylex.create({
  row: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0, flexShrink: 0 },
  rowHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
  },
  rowTitle: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  carousel: {
    display: 'flex',
    gap: space.x3,
    minWidth: 0,
    overflowX: 'auto',
    overscrollBehaviorX: 'contain',
    scrollSnapType: 'x proximity',
    scrollbarWidth: 'none',
  },
  card: {
    display: 'block',
    flexShrink: 0,
    width: 'min(184px, 64%)',
    height: '208px',
    scrollSnapAlign: 'start',
  },
  open: {
    display: 'block',
    width: '100%',
    height: '100%',
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
    color: color.fg,
    cursor: 'pointer',
    opacity: { default: 1, ':hover': 0.92 },
  },
  hiddenRow: { display: 'none' },
  hero: {
    width: { default: 'min(400px, 88%)', [NARROW]: '100%' },
    height: { default: '208px', [NARROW]: '232px' },
  },
  past: { display: { default: null, [NARROW]: 'none' } },
  narrowOnly: { display: { default: 'none', [NARROW]: 'inline-flex' } },
  moreItem: {
    display: { default: 'block', [NARROW]: 'none' },
    flexShrink: 0,
    width: '120px',
    height: '208px',
    scrollSnapAlign: 'start',
  },
  more: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    width: '100%',
    height: '100%',
    padding: space.x4,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.lg,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.accentText,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    cursor: 'pointer',
  },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: color.accentText,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    cursor: 'pointer',
    textDecoration: { default: 'none', ':hover': 'underline' },
  },
  header: { display: 'block', height: '200px', flexShrink: 0 },
  article: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
  date: { color: color.muted, fontSize: text.metaSize, lineHeight: text.metaLine },
  articleTitle: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  lede: { margin: 0, color: color.muted, fontSize: text.bodySize, lineHeight: text.bodyLine },
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  heading: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  body: { margin: 0, color: color.fg, fontSize: text.bodySize, lineHeight: text.bodyLine },
  bot: { maxWidth: '360px' },
  end: { display: 'flex', justifyContent: 'flex-start' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: space.x3,
    minWidth: 0,
  },
  gridCard: { width: '100%', height: 'auto', aspectRatio: '4 / 5' },
});

export function digestDate(day: string, lang: MarketplaceLanguage): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) return day;
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  }).format(at);
}

type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; cause: unknown }
  | { status: 'ready'; value: T };

function useLoaded<T>(
  load: () => Promise<T>,
  dependencies: readonly unknown[],
  onReady?: (value: T) => void,
): [Loaded<T>, (node: HTMLElement | null) => void] {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  const mount = useMountedResource<HTMLElement>(() => {
    let live = true;
    setState({ status: 'loading' });
    void load().then(
      (value) => {
        if (!live) return;
        setState({ status: 'ready', value });
        onReady?.(value);
      },
      (cause: unknown) => {
        if (live) setState({ status: 'error', cause });
      },
    );
    return () => {
      live = false;
    };
  }, dependencies);
  return [state, mount];
}

function SeePastPicks({
  t,
  onArchive,
}: {
  t: BotHarnessTranslate;
  onArchive: () => void;
}): ReactElement {
  return (
    <button type="button" {...stylex.props(styles.link)} data-market-past-picks onClick={onArchive}>
      {t('market.digest.seePast')}
      <IconChevronRightOutlineRegular size={14} />
    </button>
  );
}

function DigestCard({
  digest,
  lang,
  t,
  wide,
  grid,
  past = false,
  onOpen,
}: {
  digest: MarketplaceDigestSummary;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  wide: boolean;
  grid: boolean;
  past?: boolean;
  onOpen: () => void;
}): ReactElement {
  return (
    <div
      role="listitem"
      {...stylex.props(
        styles.card,
        wide && styles.hero,
        grid && styles.gridCard,
        past && styles.past,
      )}
    >
      <button
        type="button"
        {...stylex.props(styles.open)}
        aria-label={t('market.digest.read', { title: digest.title })}
        data-market-digest-day={digest.day}
        onClick={onOpen}
      >
        <DigestCover
          day={digest.day}
          title={digest.title}
          picks={digest.picks}
          lang={lang}
          t={t}
          avatarSize={wide ? 32 : 24}
        />
      </button>
    </div>
  );
}

export function MarketDailyPicks({
  actions,
  lang,
  t,
  onOpen,
  onArchive,
}: {
  actions: BridgeActions;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  onOpen: (day: string) => void;
  onArchive: () => void;
}): ReactElement {
  const [state, mount] = useLoaded(
    () => actions.marketplaceDigests(lang),
    [lang],
    (digests) => {
      if (digests.length > 0) actions.telemetryEvent('marketplace:digest_view');
    },
  );
  const digests = state.status === 'ready' ? state.value.slice(0, DAILY_PICKS_SHOWN) : [];
  return (
    <section
      {...stylex.props(styles.row, digests.length === 0 && styles.hiddenRow)}
      ref={mount}
      hidden={digests.length === 0}
      aria-label={t('market.digest.label')}
      data-market-daily-picks=""
    >
      <div {...stylex.props(styles.rowHead)}>
        <h3 {...stylex.props(styles.rowTitle)}>{t('market.digest.label')}</h3>
        <span {...stylex.props(styles.narrowOnly)}>
          <SeePastPicks t={t} onArchive={onArchive} />
        </span>
      </div>
      {digests.length === 0 ? null : (
        <div {...stylex.props(styles.carousel)} role="list">
          {digests.map((digest, index) => (
            <DigestCard
              key={digest.day}
              digest={digest}
              lang={lang}
              t={t}
              wide={index === 0}
              grid={false}
              past={index > 0}
              onOpen={() => onOpen(digest.day)}
            />
          ))}
          <div role="listitem" {...stylex.props(styles.moreItem)}>
            <button
              type="button"
              {...stylex.props(styles.more)}
              data-market-past-picks
              onClick={onArchive}
            >
              {t('market.digest.seePast')}
              <IconChevronRightOutlineRegular size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function LoadNote({
  state,
  t,
}: {
  state: Loaded<unknown>;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (state.status === 'loading') return <Note>{t('market.digest.loading')}</Note>;
  if (state.status === 'error')
    return <Note tone="danger">{marketplaceError(state.cause, t)}</Note>;
  return null;
}

export function MarketDigestPage({
  actions,
  day,
  lang,
  t,
  hidden,
  onBack,
  onArchive,
  renderBot,
}: {
  actions: BridgeActions;
  day: string;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  hidden: boolean;
  onBack: () => void;
  onArchive: () => void;
  renderBot: (bot: MarketplaceEntry) => ReactElement;
}): ReactElement {
  const [state, mount] = useLoaded<MarketplaceDigest>(
    () => actions.marketplaceDigest(day, lang),
    [day, lang],
  );
  const digest = state.status === 'ready' ? state.value : undefined;
  return (
    <MarketPage
      page={`digest:${day}`}
      title={digest?.title ?? t('market.digest.label')}
      hidden={hidden}
      t={t}
      onBack={onBack}
    >
      <article {...stylex.props(styles.article)} ref={mount} data-market-digest={day}>
        <LoadNote state={state} t={t} />
        {digest === undefined ? null : (
          <>
            <span {...stylex.props(styles.header)}>
              <DigestCover
                day={digest.day}
                title={digest.title}
                picks={digest.sections
                  .flatMap((section) => (section.bot === null ? [] : [digestPickOf(section.bot)]))
                  .slice(0, 4)}
                lang={lang}
                t={t}
                avatarSize={36}
                caption={false}
              />
            </span>
            <span {...stylex.props(styles.date)}>{digestDate(digest.day, lang)}</span>
            <h2 {...stylex.props(styles.articleTitle)}>{digest.title}</h2>
            <p {...stylex.props(styles.lede)}>{digest.lede}</p>
            {digest.sections.map((section) => (
              <section key={section.heading} {...stylex.props(styles.section)}>
                <h3 {...stylex.props(styles.heading)}>{section.heading}</h3>
                <p {...stylex.props(styles.body)}>{section.body}</p>
                {section.bot === null ? null : (
                  <div {...stylex.props(styles.bot)} role="list">
                    {renderBot(section.bot)}
                  </div>
                )}
              </section>
            ))}
            <div {...stylex.props(styles.end)}>
              <SeePastPicks t={t} onArchive={onArchive} />
            </div>
          </>
        )}
      </article>
    </MarketPage>
  );
}

export function MarketPastPicksPage({
  actions,
  lang,
  t,
  hidden,
  onBack,
  onOpen,
}: {
  actions: BridgeActions;
  lang: MarketplaceLanguage;
  t: BotHarnessTranslate;
  hidden: boolean;
  onBack: () => void;
  onOpen: (day: string) => void;
}): ReactElement {
  const [state, mount] = useLoaded(() => actions.marketplaceDigests(lang), [lang]);
  return (
    <MarketPage
      page="past-picks"
      title={t('market.digest.archive')}
      hidden={hidden}
      t={t}
      onBack={onBack}
    >
      <div ref={mount} data-market-digest="archive">
        <LoadNote state={state} t={t} />
        {state.status === 'ready' ? (
          state.value.length === 0 ? (
            <Note>{t('market.digest.none')}</Note>
          ) : (
            <div {...stylex.props(styles.grid)} role="list">
              {state.value.map((digest) => (
                <DigestCard
                  key={digest.day}
                  digest={digest}
                  lang={lang}
                  t={t}
                  wide={false}
                  grid
                  onOpen={() => onOpen(digest.day)}
                />
              ))}
            </div>
          )
        ) : null}
      </div>
    </MarketPage>
  );
}
