import * as stylex from '@stylexjs/stylex';
import { useRef, useState, type ReactElement } from 'react';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';

import type { BridgeActions } from './actions.js';
import { Button } from './ds/button.js';
import { CatalogCard, CatalogGrid } from './ds/catalog-grid.js';
import { SearchField } from './ds/field.js';
import { BrandLogo } from './ds/brand-logo.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { Tag } from './ds/tag.js';
import { space } from './ds/tokens.stylex.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import type { BotHarnessTranslate } from './locale.js';
import type { MarketplaceSkillSection } from './features/marketplace/skill-actions.js';
import { MarketSectionHead, SECTION_TITLES } from './market-rankings.js';
import { MarketSkillDialog } from './market-skill-dialog.js';
import { marketplaceError } from './marketplace-feedback.js';
import { useMountedResource } from './mounted-resource.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  more: { alignSelf: 'center' },
  meta: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  contents: { display: 'contents' },
  ranking: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
});

const RANKED = 4;

export type MarketSkillActions = Pick<
  BridgeActions,
  | 'marketplaceSkillList'
  | 'marketplaceSkillDetail'
  | 'marketplaceSkillAddCandidates'
  | 'marketplaceSkillReview'
  | 'marketplaceSkillAdd'
  | 'marketplaceSkillReport'
  | 'marketplaceChallenge'
>;

type Page = { query: string; skills: MarketplaceSkill[]; next: string | null };

const SEARCH_DELAY_MS = 250;

export function SkillLogo(): ReactElement {
  return <BrandLogo src={undefined} size={40} fallbackIcon="book-open" />;
}

export function installsLabel(count: number, t: BotHarnessTranslate): string {
  return count === 1 ? t('market.skills.installsOne') : t('market.skills.installs', { count });
}

function SkillMeta({ skill, t }: { skill: MarketplaceSkill; t: BotHarnessTranslate }) {
  return (
    <span {...stylex.props(styles.meta)}>
      {skill.scripts.length > 0 ? <Tag tone="neutral">{t('market.skills.hasScripts')}</Tag> : null}
      {skill.scan === 'warning' ? <Tag tone="warning">{t('market.skills.warning')}</Tag> : null}
      <span>{installsLabel(skill.installs, t)}</span>
    </span>
  );
}

function SkillCard({
  skill,
  t,
  onOpen,
}: {
  skill: MarketplaceSkill;
  t: BotHarnessTranslate;
  onOpen: () => void;
}): ReactElement {
  return (
    <CatalogCard
      title={skill.name}
      subtitle={
        skill.upload === undefined
          ? skill.fullName
          : `${skill.upload.author.name} #${skill.upload.author.id}`
      }
      summary={skill.description}
      meta={<SkillMeta skill={skill} t={t} />}
      leading={<SkillLogo />}
      data={{ 'data-market-skill': skill.name }}
      onClick={onOpen}
    />
  );
}

export function MarketSkillRankings({
  sections,
  t,
  onOpen,
}: {
  sections: readonly MarketplaceSkillSection[];
  t: BotHarnessTranslate;
  onOpen: (skill: MarketplaceSkill) => void;
}): ReactElement | null {
  const shown = sections.filter((section) => section.entries.length > 0);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((section) => {
        const title = t(SECTION_TITLES[section.section]);
        return (
          <section
            key={section.section}
            {...stylex.props(styles.ranking)}
            aria-label={title}
            data-market-skill-ranking={section.section}
          >
            <MarketSectionHead title={title} target={section.section} t={t} />
            <CatalogGrid label={title}>
              {section.entries.slice(0, RANKED).map(({ skill }) => (
                <SkillCard key={skill.id} skill={skill} t={t} onOpen={() => onOpen(skill)} />
              ))}
            </CatalogGrid>
          </section>
        );
      })}
      <MarketSectionHead title={t('market.skills.all')} target="all" t={t} />
    </>
  );
}

export function MarketSkills({
  actions,
  t,
}: {
  actions: MarketSkillActions & Partial<Pick<BridgeActions, 'marketplaceSkillSections'>>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState<unknown>();
  const [reload, setReload] = useState(0);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<MarketplaceSkill>();
  const [rankings, setRankings] = useState<readonly MarketplaceSkillSection[]>([]);
  const latest = useRef(0);

  const ranked = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void (actions.marketplaceSkillSections?.() ?? Promise.resolve([])).then((sections) => {
      if (live) setRankings(sections);
    });
    return () => {
      live = false;
    };
  }, [actions, reload]);

  const mount = useMountedResource<HTMLDivElement>(() => {
    const request = ++latest.current;
    const load = () =>
      actions.marketplaceSkillList({ q: query.trim() }).then(
        (result) => {
          if (latest.current !== request) return;
          setError(undefined);
          setPage({ query, skills: result.skills, next: result.nextCursor });
        },
        (failure: unknown) => {
          if (latest.current === request) setError(failure);
        },
      );
    if (query.trim() === '') {
      void load();
      return undefined;
    }
    const timer = setTimeout(() => void load(), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [actions, query, reload]);

  const loadMore = () => {
    if (page?.next === null || page === undefined || more) return;
    const request = latest.current;
    setMore(true);
    actions
      .marketplaceSkillList({ q: page.query.trim(), cursor: page.next })
      .then(
        (result) => {
          if (latest.current !== request) return;
          setPage((current) =>
            current === undefined
              ? current
              : {
                  ...current,
                  skills: [...current.skills, ...result.skills],
                  next: result.nextCursor,
                },
          );
        },
        (failure: unknown) => {
          if (latest.current === request) setError(failure);
        },
      )
      .finally(() => setMore(false));
  };

  const added = (skill: MarketplaceSkill) =>
    void actions.marketplaceSkillDetail(skill.id).then(
      (detail) =>
        setPage((current) =>
          current === undefined
            ? current
            : {
                ...current,
                skills: current.skills.map((item) =>
                  item.id === skill.id ? { ...item, installs: detail.skill.installs } : item,
                ),
              },
        ),
      () => undefined,
    );

  return (
    <div ref={mount} {...stylex.props(styles.stack)} data-market-skills>
      <SearchField label={t('market.skills.search')} value={query} onChange={setQuery} />
      <div ref={ranked} {...stylex.props(styles.contents)}>
        {query.trim() === '' ? (
          <MarketSkillRankings sections={rankings} t={t} onOpen={setOpen} />
        ) : null}
      </div>
      {error !== undefined ? (
        <ReadFailure
          retryLabel={t('market.retry')}
          onRetry={() => {
            setError(undefined);
            setReload((value) => value + 1);
          }}
        >
          {t('market.error.load', { error: marketplaceError(error, t) })}
        </ReadFailure>
      ) : page === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('market.skills.search')} />
      ) : page.skills.length === 0 ? (
        <Note inset>
          {page.query.trim() === '' ? t('market.skills.empty') : t('market.skills.noMatch')}
        </Note>
      ) : (
        <CatalogGrid label={t('market.skills')} data={{ 'data-market-skill-grid': 'listed' }}>
          {page.skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} t={t} onOpen={() => setOpen(skill)} />
          ))}
        </CatalogGrid>
      )}
      {page?.next === null ||
      page === undefined ||
      page.query !== query ||
      error !== undefined ? null : (
        <Button variant="outline" size="sm" disabled={more} onClick={loadMore} xstyle={styles.more}>
          {t('market.skills.more')}
        </Button>
      )}
      <Note inset tone="subtle">
        {t('market.skills.publishHint')}
      </Note>
      {open === undefined ? null : (
        <MarketSkillDialog
          skill={open}
          actions={actions}
          t={t}
          onClose={() => setOpen(undefined)}
          onAdded={() => added(open)}
        />
      )}
    </div>
  );
}
