import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';
import type { MarketplaceAvatar } from '@botharness/host-protocol/marketplace-avatar';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';

import type { BridgeActions } from './actions.js';
import { appSummary, ConnectAppDialog, type PickedApp } from './app-connections-catalog.js';
import { CatalogCard, CatalogGrid } from './ds/catalog-grid.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { BridgeCallError } from './bridge.js';
import { marketplaceError } from './marketplace-feedback.js';
import { layer, radius, space } from './ds/tobs.stylex.js';
import type { ConnectorsView } from './features/connectors/bridge.js';
import { ConnectorLogo } from './features/connectors/logos.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { MarketAvatarDetail } from './market-avatars.js';
import { MarketSectionHead } from './market-rankings.js';
import { MarketSkillDialog } from './market-skill-dialog.js';
import { MarketYours, type MarketYoursActions } from './market-yours.js';
import { installsLabel, SkillLogo } from './market-skills.js';
import { MarketplaceInstalls, marketplaceOwner } from './marketplace-listing.js';
import {
  MarketplaceAvatar as BotAvatar,
  marketplaceLanguage,
  marketplaceName,
} from './marketplace.js';
import { useMountedResource } from './mounted-resource.js';

const PER_KIND = 4;
const LOGO = 40;

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x6, minWidth: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  thumbnail: {
    flexShrink: 0,
    width: LOGO,
    height: LOGO,
    borderRadius: radius.sm,
    objectFit: 'cover',
    backgroundColor: layer.well,
  },
});

export type MarketKind = 'bots' | 'skills' | 'apps' | 'avatars';

type MarketplaceEntry = Awaited<
  ReturnType<BridgeActions['marketplaceSections']>
>[number]['entries'][number]['bot'];
type App = ConnectorsView['catalog'][number];
type Read<T> =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; items: readonly T[] };

interface Lists {
  bots: Read<MarketplaceEntry>;
  skills: Read<MarketplaceSkill>;
  apps: Read<App>;
  avatars: Read<MarketplaceAvatar>;
}

const LOADING: Lists = {
  bots: { kind: 'loading' },
  skills: { kind: 'loading' },
  apps: { kind: 'loading' },
  avatars: { kind: 'loading' },
};

const KINDS: readonly MarketKind[] = ['bots', 'skills', 'apps', 'avatars'];

const TITLES: Record<MarketKind, BotHarnessKey> = {
  bots: 'market.avatar.bots',
  skills: 'market.skills',
  apps: 'botSettings.section.connectors',
  avatars: 'market.avatar.title',
};

const KIND_LABELS: Record<MarketKind, BotHarnessKey> = {
  bots: 'market.all.kind.bot',
  skills: 'market.all.kind.skill',
  apps: 'market.all.kind.app',
  avatars: 'market.all.kind.avatar',
};

const ready = <T,>(items: readonly T[]): Read<T> => ({
  kind: 'ready',
  items: items.slice(0, PER_KIND),
});

const ignoreRead = () => undefined;

export type MarketAllActions = MarketYoursActions &
  Pick<
    BridgeActions,
    | 'marketplaceSections'
    | 'marketplaceAvatarList'
    | 'marketplaceAvatarTags'
    | 'marketplaceAvatarDetail'
    | 'marketplaceAvatarReport'
    | 'marketplaceAvatarApplyCandidates'
    | 'marketplaceAvatarApply'
    | 'marketplaceSkillList'
    | 'marketplaceSkillDetail'
    | 'marketplaceSkillAddCandidates'
    | 'marketplaceSkillReview'
    | 'marketplaceSkillAdd'
    | 'marketplaceSkillReport'
    | 'marketplaceChallenge'
    | 'connectors'
    | 'connectorConnect'
    | 'connectorSearch'
    | 'connectorLogos'
    | 'connectorMcpSearch'
    | 'connectorMcpAdd'
    | 'connectorKeySet'
    | 'connectorKeyClear'
  >;

export function MarketAll({
  actions,
  t,
  refresh,
  onSeeAll,
  onOpenBot,
}: {
  actions: MarketAllActions;
  t: BotHarnessTranslate;
  refresh: number;
  onSeeAll: (kind: MarketKind) => void;
  onOpenBot: (bot: MarketplaceEntry) => void;
}): ReactElement {
  const lang = marketplaceLanguage(t);
  const [lists, setLists] = useState<Lists>(LOADING);
  const [view, setView] = useState<ConnectorsView>();
  const [reload, setReload] = useState(0);
  const [skill, setSkill] = useState<MarketplaceSkill>();
  const [app, setApp] = useState<PickedApp>();
  const [avatar, setAvatar] = useState<MarketplaceAvatar>();

  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    const settle = <K extends MarketKind>(kind: K, value: Lists[K]) => {
      if (live) setLists((current) => ({ ...current, [kind]: value }));
    };
    const failed = (kind: MarketKind) => (error: unknown) =>
      settle(kind, { kind: 'failed', error });
    setLists(LOADING);
    void actions
      .marketplaceSections(lang)
      .then(
        (sections) =>
          settle(
            'bots',
            ready(
              (sections.find((section) => section.section === 'hot')?.entries ?? []).map(
                ({ bot }) => bot,
              ),
            ),
          ),
        failed('bots'),
      );
    void actions
      .marketplaceSkillList({ q: '' })
      .then((page) => settle('skills', ready(page.skills)), failed('skills'));
    void actions
      .marketplaceAvatarList({ sort: 'hot' })
      .then((page) => settle('avatars', ready(page.avatars)), failed('avatars'));
    if (actions.connectors === undefined) settle('apps', ready([]));
    else
      void actions.connectors().then(
        (loaded) => {
          if (live) setView(loaded);
          settle('apps', ready(loaded.catalog));
        },
        (error: unknown) =>
          error instanceof BridgeCallError && error.code === 'permission-required'
            ? settle('apps', ready([]))
            : failed('apps')(error),
      );
    return () => {
      live = false;
    };
  }, [actions, lang, reload, refresh]);

  const byline = (kind: MarketKind, by: string) =>
    t('market.all.byline', { kind: t(KIND_LABELS[kind]), by });

  const connectedLabel = (service: string) => {
    const count =
      view?.accounts.filter((account) => account.service === service && account.status === 'active')
        .length ?? 0;
    return count > 0
      ? t('connectors.catalog.connected', { count })
      : t('connectors.catalog.available');
  };

  const cards = (kind: MarketKind): ReactElement[] => {
    switch (kind) {
      case 'bots':
        return lists.bots.kind !== 'ready'
          ? []
          : lists.bots.items.map((bot) => (
              <CatalogCard
                key={bot.id}
                title={marketplaceName(bot)}
                subtitle={byline('bots', marketplaceOwner(bot))}
                summary={bot.description ?? undefined}
                meta={<MarketplaceInstalls bot={bot} t={t} className="" />}
                leading={<BotAvatar bot={bot} size={LOGO} t={t} />}
                data={{ 'data-market-all-card': 'bot', 'data-market-bot': bot.fullName }}
                onClick={() => onOpenBot(bot)}
              />
            ));
      case 'skills':
        return lists.skills.kind !== 'ready'
          ? []
          : lists.skills.items.map((item) => (
              <CatalogCard
                key={item.id}
                title={item.name}
                subtitle={byline(
                  'skills',
                  item.upload === undefined ? item.fullName : item.upload.author.name,
                )}
                summary={item.description}
                meta={installsLabel(item.installs, t)}
                leading={<SkillLogo />}
                data={{ 'data-market-all-card': 'skill', 'data-market-skill': item.name }}
                onClick={() => setSkill(item)}
              />
            ));
      case 'apps':
        return lists.apps.kind !== 'ready'
          ? []
          : lists.apps.items.map((entry) => (
              <CatalogCard
                key={entry.service}
                title={entry.name}
                subtitle={byline('apps', 'Composio')}
                summary={appSummary(entry, t) || undefined}
                meta={connectedLabel(entry.service)}
                leading={
                  <ConnectorLogo
                    service={entry.service}
                    size={LOGO}
                    logos={actions.connectorLogos}
                  />
                }
                data={{ 'data-market-all-card': 'app', 'data-connector-service': entry.service }}
                onClick={() => setApp({ service: entry.service, name: entry.name })}
              />
            ));
      case 'avatars':
        return lists.avatars.kind !== 'ready'
          ? []
          : lists.avatars.items.map((item) => (
              <CatalogCard
                key={item.id}
                title={item.name}
                subtitle={byline('avatars', item.author.name)}
                meta={t('market.applyCount', { count: String(item.applyCount) })}
                leading={
                  <img
                    {...stylex.props(styles.thumbnail)}
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    width={LOGO}
                    height={LOGO}
                  />
                }
                data={{ 'data-market-all-card': 'avatar' }}
                onClick={() => setAvatar(item)}
              />
            ));
    }
  };

  const failure = (kind: MarketKind): ReactElement | undefined => {
    const read = lists[kind];
    return read.kind !== 'failed' ? undefined : (
      <ReadFailure retryLabel={t('market.retry')} onRetry={() => setReload((value) => value + 1)}>
        {t('market.error.load', { error: marketplaceError(read.error, t) })}
      </ReadFailure>
    );
  };

  const yours = (
    <MarketYours
      actions={actions}
      view={view}
      t={t}
      refresh={reload + refresh}
      onOpenSkill={setSkill}
      onChanged={() => setReload((value) => value + 1)}
    />
  );
  const shown = KINDS.filter((kind) => lists[kind].kind === 'failed' || cards(kind).length > 0);
  const loading = KINDS.some((kind) => lists[kind].kind === 'loading');

  return (
    <>
      <div className="bh-market-page" hidden={avatar !== undefined}>
        <div className="bh-market-panel" ref={mount} data-market-all="">
          <div {...stylex.props(styles.stack)}>
            {yours}
            {shown.length > 0 ? (
              shown.map((kind) => (
                <section
                  key={kind}
                  {...stylex.props(styles.section)}
                  aria-label={t(TITLES[kind])}
                  data-market-all-section={kind}
                >
                  <MarketSectionHead
                    title={t(TITLES[kind])}
                    target={kind}
                    t={t}
                    onSeeAll={() => onSeeAll(kind)}
                  />
                  {failure(kind) ?? (
                    <CatalogGrid label={t(TITLES[kind])}>{cards(kind)}</CatalogGrid>
                  )}
                </section>
              ))
            ) : loading ? (
              <LoadingSkeleton kind="sidebar" label={t('market.all')} />
            ) : (
              <Note inset>{t('market.all.empty')}</Note>
            )}
          </div>
        </div>
      </div>
      {avatar === undefined ? null : (
        <MarketAvatarDetail
          initial={avatar}
          actions={actions}
          onRead={ignoreRead}
          t={t}
          onBack={() => setAvatar(undefined)}
        />
      )}
      {skill === undefined ? null : (
        <MarketSkillDialog
          skill={skill}
          actions={actions}
          t={t}
          onClose={() => setSkill(undefined)}
          onAdded={() => setReload((value) => value + 1)}
        />
      )}
      {view === undefined || app === undefined ? null : (
        <ConnectAppDialog
          actions={actions}
          view={view}
          t={t}
          service={app}
          onClose={() => setApp(undefined)}
          onView={setView}
          onLinked={() => {
            setApp(undefined);
            setReload((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
