import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceEntry,
  MarketplaceInstallSource,
  MarketplaceSection,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketPage } from './market-page.js';
import {
  MarketplaceAvatar,
  MarketplaceBanner,
  MarketplaceDescription,
  MarketplaceInstalls,
  MarketplaceMeta,
  marketplaceLanguage,
  marketplaceName,
  MarketplaceOwner,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

const POSTER_AVATAR = 40;
const COMPACT_AVATAR = 48;

const styles = stylex.create({
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
  },
  title: {
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  seeAll: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x1,
    flexShrink: 0,
    paddingBlock: space.x1,
    paddingInline: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.accentText,
    font: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    cursor: 'pointer',
  },
  carousel: {
    display: 'grid',
    gridAutoFlow: 'column',
    gap: space.x3,
    overflowX: 'auto',
    overscrollBehaviorX: 'contain',
    scrollSnapType: 'x proximity',
    scrollbarWidth: 'none',
  },
  posterRow: { gridAutoColumns: 'min(168px, 45%)' },
  compactRow: { gridAutoColumns: 'min(300px, 85%)' },
  poster: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    aspectRatio: '2 / 3',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.surface,
    scrollSnapAlign: 'start',
  },
  posterOpen: {
    position: 'relative',
    display: 'block',
    flexGrow: 1,
    minHeight: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
  },
  posterBanner: {
    position: 'absolute',
    inset: 0,
    display: 'block',
    overflow: 'hidden',
    backgroundColor: color.accentTint,
    backgroundImage: `linear-gradient(160deg, ${color.accentTint}, ${color.hover})`,
  },
  posterCaption: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: space.x2,
    paddingTop: space.x6,
    paddingInline: space.x4,
    paddingBottom: space.x2,
    backgroundImage: `linear-gradient(to bottom, transparent, ${color.surface} 70%)`,
  },
  name: {
    maxWidth: '100%',
    overflow: 'hidden',
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  foot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  posterFoot: {
    paddingInline: space.x4,
    paddingBottom: space.x4,
    flexShrink: 0,
  },
  compact: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    scrollSnapAlign: 'start',
  },
  compactOpen: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.x4,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  author: {
    overflow: 'hidden',
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  bio: {
    display: '-webkit-box',
    marginTop: space.x2,
    overflow: 'hidden',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  compactFoot: {
    marginTop: 'auto',
    paddingInlineStart: `calc(${COMPACT_AVATAR}px + ${space.x1} * 2 + ${space.x4})`,
  },
});

function className(style: stylex.StyleXStyles): string {
  return stylex.props(style).className ?? '';
}

export function MarketplaceTile({
  bot,
  created,
  t,
  onOpen,
  onImport,
}: {
  bot: MarketplaceEntry;
  created: boolean;
  t: BotHarnessTranslate;
  onOpen: () => void;
  onImport: () => void;
}): ReactElement {
  return (
    <div className="bh-market-tile" role="listitem" data-market-bot={bot.fullName}>
      <button
        type="button"
        className="bh-market-open bh-market-tile-open"
        aria-label={t('market.detail.open', { name: bot.fullName })}
        onClick={onOpen}
      >
        <MarketplaceBanner bot={bot} className="bh-market-tile-banner" />
        <span className="bh-market-tile-head">
          <MarketplaceAvatar bot={bot} size={40} t={t} />
          <span className="bh-market-copy">
            <span className="bh-market-card-name">{marketplaceName(bot)}</span>
            <span className="bh-market-owner">
              {bot.source === 'upload' ? <MarketplaceOwner bot={bot} /> : bot.fullName}
            </span>
          </span>
        </span>
      </button>
      {bot.description === null ? null : <MarketplaceDescription bot={bot} t={t} />}
      <div className="bh-market-tile-foot">
        <MarketplaceMeta bot={bot} t={t} topics={false} created={created} />
        <Button size="sm" variant="primary" onClick={onImport}>
          {t('market.import')}
        </Button>
      </div>
    </div>
  );
}

interface RankingCardProps {
  readonly bot: MarketplaceEntry;
  readonly t: BotHarnessTranslate;
  readonly onOpen: () => void;
  readonly onImport: () => void;
}

function PosterCard({ bot, t, onOpen, onImport }: RankingCardProps): ReactElement {
  return (
    <div
      {...stylex.props(styles.poster)}
      role="listitem"
      data-market-bot={bot.fullName}
      data-market-card="poster"
    >
      <button
        type="button"
        {...stylex.props(styles.posterOpen)}
        aria-label={t('market.detail.open', { name: bot.fullName })}
        onClick={onOpen}
      >
        <MarketplaceBanner bot={bot} className={className(styles.posterBanner)} />
        <span {...stylex.props(styles.posterCaption)}>
          <MarketplaceAvatar bot={bot} size={POSTER_AVATAR} t={t} />
          <span {...stylex.props(styles.name)}>{marketplaceName(bot)}</span>
        </span>
      </button>
      <div {...stylex.props(styles.foot, styles.posterFoot)}>
        <MarketplaceInstalls bot={bot} t={t} className="" />
        <Button size="sm" variant="primary" onClick={onImport}>
          {t('market.import')}
        </Button>
      </div>
    </div>
  );
}

function CompactCard({ bot, t, onOpen, onImport }: RankingCardProps): ReactElement {
  return (
    <div
      {...stylex.props(styles.compact)}
      role="listitem"
      data-market-bot={bot.fullName}
      data-market-card="compact"
    >
      <button
        type="button"
        {...stylex.props(styles.compactOpen)}
        aria-label={t('market.detail.open', { name: bot.fullName })}
        onClick={onOpen}
      >
        <MarketplaceAvatar bot={bot} size={COMPACT_AVATAR} t={t} />
        <span {...stylex.props(styles.copy)}>
          <span {...stylex.props(styles.name)}>{marketplaceName(bot)}</span>
          <span {...stylex.props(styles.author)} data-market-author="">
            {bot.source === 'upload' ? <MarketplaceOwner bot={bot} /> : bot.fullName}
          </span>
          {bot.description === null ? null : (
            <span {...stylex.props(styles.bio)}>
              <MarketplaceDescription bot={bot} t={t} />
            </span>
          )}
        </span>
      </button>
      <div {...stylex.props(styles.foot, styles.compactFoot)}>
        <MarketplaceInstalls bot={bot} t={t} className="" />
        <Button size="sm" variant="primary" onClick={onImport}>
          {t('market.import')}
        </Button>
      </div>
    </div>
  );
}

export const SECTION_TITLES = {
  hot: 'market.section.hot',
  new: 'market.section.new',
  rising: 'market.section.rising',
} as const;

export function MarketplaceSections({
  actions,
  lang,
  t,
  onOpen,
  onImport,
  onSeeAll,
}: {
  actions: BridgeActions;
  lang: ReturnType<typeof marketplaceLanguage>;
  t: BotHarnessTranslate;
  onOpen: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
  onImport: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
  onSeeAll: (section: MarketplaceSection) => void;
}): ReactElement {
  const [sections, setSections] = useState<MarketplaceSection[]>([]);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    setSections([]);
    void actions.marketplaceSections(lang).then(
      (loaded) => {
        if (!live) return;
        setSections(loaded);
        if (loaded.some((section) => section.entries.length > 0))
          actions.telemetryEvent('marketplace:section_view');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [lang]);
  const shown = sections.filter((section) => section.entries.length > 0);
  return (
    <div className="bh-market-sections" ref={mount} hidden={shown.length === 0}>
      {shown.map((section) => {
        const title = t(SECTION_TITLES[section.section]);
        const Card = section.section === 'hot' ? PosterCard : CompactCard;
        return (
          <section
            key={section.section}
            className="bh-market-section"
            data-market-section={section.section}
            aria-label={title}
          >
            <div {...stylex.props(styles.head)}>
              <h3 {...stylex.props(styles.title)}>{title}</h3>
              <button
                type="button"
                {...stylex.props(styles.seeAll)}
                data-market-see-all={section.section}
                onClick={() => onSeeAll(section)}
              >
                {t('market.section.seeAll')}
                <IconChevronRightOutlineRegular size={12} />
              </button>
            </div>
            <div
              {...stylex.props(
                styles.carousel,
                section.section === 'hot' ? styles.posterRow : styles.compactRow,
              )}
              role="list"
            >
              {section.entries.map(({ bot }) => (
                <Card
                  key={bot.id}
                  bot={bot}
                  t={t}
                  onOpen={() => onOpen(bot, section.section)}
                  onImport={() => onImport(bot, section.section)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function MarketRankingPage({
  section,
  hidden,
  t,
  onBack,
  onOpen,
  onImport,
}: {
  section: MarketplaceSection;
  hidden: boolean;
  t: BotHarnessTranslate;
  onBack: () => void;
  onOpen: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
  onImport: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
}): ReactElement {
  const title = t(SECTION_TITLES[section.section]);
  return (
    <MarketPage page="ranking" title={title} hidden={hidden} t={t} onBack={onBack}>
      <div
        className="bh-market-grid"
        role="list"
        aria-label={title}
        data-market-ranking={section.section}
      >
        {section.entries.map(({ bot }) => (
          <MarketplaceTile
            key={bot.id}
            bot={bot}
            created={false}
            t={t}
            onOpen={() => onOpen(bot, section.section)}
            onImport={() => onImport(bot, section.section)}
          />
        ))}
      </div>
    </MarketPage>
  );
}
