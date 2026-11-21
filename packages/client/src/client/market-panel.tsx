import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type {
  MarketplaceEntry,
  MarketplaceInstallSource,
  MarketplaceSection,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { SegmentedControl } from './ds/segmented.js';
import { space } from './ds/tokens.stylex.js';
import { MarketAvatars } from './market-avatars.js';
import { joinClass } from './ds/class-name.js';
import { useTeamMode } from './team-state.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import type { DockPanel, DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketDailyPicks, MarketDigestPage, MarketPastPicksPage } from './market-digest.js';
import { MyUploadsDialog, onMarketUploadChange } from './market-mine.js';
import { useKeptScroll } from './market-page.js';
import { MarketRankingPage, MarketplaceSections, MarketplaceTile } from './market-rankings.js';
import { MarketUploadDialog } from './market-upload.js';
import { useMountedResource } from './mounted-resource.js';
import {
  MarketplaceBotFlow,
  MarketplaceBrowseControls,
  MarketplaceListStatus,
  MarketplaceLoadMore,
  marketplaceLanguage,
  useMarketplaceBrowse,
  type MarketplaceFlowStart,
} from './marketplace.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column' },
  tabs: { flexShrink: 0, marginBlockStart: space.x4, marginInline: space.x4 },
  panel: { flexGrow: 1, flexBasis: 0, minHeight: 0 },
});

export const MARKET_PANEL = 'bot-market';

type MarketSection = 'bots' | 'avatars';
type MarketNavigationState = {
  section: MarketSection;
  dialog: 'upload' | 'mine' | undefined;
  visitedAvatars: boolean;
};

function createMarketNavigation() {
  let state: MarketNavigationState = { section: 'bots', dialog: undefined, visitedAvatars: false };
  const listeners = new Set<() => void>();
  const set = (value: MarketNavigationState) => {
    state = value;
    for (const listener of listeners) listener();
  };
  return {
    read: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select: (section: MarketSection) =>
      set({
        section,
        dialog: undefined,
        visitedAvatars: state.visitedAvatars || section === 'avatars',
      }),
    open: (dialog: MarketNavigationState['dialog']) => set({ ...state, dialog }),
  };
}

type MarketNavigation = ReturnType<typeof createMarketNavigation>;

function MarketHeaderAction({
  actions,
  navigation,
  t,
}: {
  actions: BridgeActions;
  navigation: MarketNavigation;
  t: BotHarnessTranslate;
}): ReactElement {
  const { section } = useSyncExternalStore(navigation.subscribe, navigation.read, navigation.read);
  const owner =
    useTeamMode(section === 'avatars' ? actions.teamCall : undefined)?.viewer.kind === 'owner';
  const uploadLabel = t(section === 'bots' ? 'market.panel.upload' : 'market.avatar.publish');
  return (
    <>
      {section === 'bots' && (
        <Tooltip label={t('market.mine.open')} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={t('market.mine.open')}
            aria-haspopup="dialog"
            onClick={() => navigation.open('mine')}
          >
            <ChannelSidebarIcon name="package" />
          </IconButton>
        </Tooltip>
      )}
      {(section === 'bots' || owner) && (
        <Tooltip label={uploadLabel} side="bottom" delayMs={500}>
          <IconButton
            size="row"
            tone="subtle"
            aria-label={uploadLabel}
            aria-haspopup="dialog"
            onClick={() => navigation.open('upload')}
          >
            <ChannelSidebarIcon name="upload" />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}

type MarketPageTarget =
  | {
      readonly kind: 'bot';
      readonly bot: MarketplaceEntry;
      readonly source: MarketplaceInstallSource;
    }
  | { readonly kind: 'digest'; readonly day: string }
  | { readonly kind: 'archive' }
  | { readonly kind: 'ranking'; readonly section: MarketplaceSection };

type MarketPageEntry = MarketPageTarget & { readonly key: number };

function MarketPanelView({
  actions,
  registry,
  navigation,
  t,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  navigation: MarketNavigation;
  t: BotHarnessTranslate;
}): ReactElement {
  const browse = useMarketplaceBrowse(actions, marketplaceLanguage(t), {
    includeUploads: true,
  });
  const lang = marketplaceLanguage(t);
  const keepHome = useKeptScroll<HTMLDivElement>();
  const { section, dialog, visitedAvatars } = useSyncExternalStore(
    navigation.subscribe,
    navigation.read,
    navigation.read,
  );
  const owner =
    useTeamMode(section === 'avatars' ? actions.teamCall : undefined)?.viewer.kind === 'owner';
  const [pages, setPages] = useState<readonly MarketPageEntry[]>([]);
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);

  const pageKey = useRef(0);
  const listen = useMountedResource<HTMLDivElement>(() => {
    return onMarketUploadChange((change) => {
      if (change.kind === 'deleted') browse.remove(change.id);
      else browse.prepend(change.bot);
    });
  }, []);
  const { list, filters } = browse;
  const push = (target: MarketPageTarget): void => {
    const key = ++pageKey.current;
    setPages((current) => [...current, { ...target, key }]);
  };
  const start = (
    bot: MarketplaceEntry,
    step: MarketplaceFlowStart['step'],
    source: MarketplaceInstallSource,
  ): void => {
    actions.telemetryEvent('marketplace:bot_open', { entry: source, step });
    if (step === 'install') {
      setFlow({ bot, step, source });
      return;
    }
    push({ kind: 'bot', bot, source });
  };
  const openDigest = (day: string, from: 'hero' | 'archive'): void => {
    actions.telemetryEvent('marketplace:digest_open', { entry: from });
    push({ kind: 'digest', day });
  };
  const openArchive = (): void => {
    actions.telemetryEvent('marketplace:digest_archive_open');
    push({ kind: 'archive' });
  };
  const back = (): void => setPages((current) => current.slice(0, -1));
  const installed = (): void => {
    setFlow(undefined);
    setPages([]);
    registry.open(CHANNEL_BODY_PANEL);
  };
  return (
    <div
      className={joinClass('bh-market-stack', stylex.props(styles.stack).className)}
      data-market-panel
      ref={listen}
    >
      <SegmentedControl
        id="bh-market-section"
        value={section}
        options={[
          { value: 'bots', label: t('market.avatar.bots') },
          { value: 'avatars', label: t('market.avatar.title') },
        ]}
        label={t('market.panel.title')}
        controlsPanel
        className={stylex.props(styles.tabs).className}
        onChange={navigation.select}
      />
      <div
        {...stylex.props(styles.panel)}
        id="bh-market-section-avatars-panel"
        aria-labelledby="bh-market-section-avatars"
        role="tabpanel"
        hidden={section !== 'avatars'}
      >
        {visitedAvatars && (
          <MarketAvatars
            actions={actions}
            t={t}
            publishing={section === 'avatars' && owner && dialog === 'upload'}
            onClosePublish={() => navigation.open(undefined)}
          />
        )}
      </div>
      <div
        className={joinClass('bh-market-page', stylex.props(styles.panel).className)}
        id="bh-market-section-bots-panel"
        aria-labelledby="bh-market-section-bots"
        role="tabpanel"
        ref={keepHome}
        hidden={section !== 'bots' || pages.length > 0}
      >
        <div className="bh-market-panel" ref={browse.mount}>
          <MarketplaceBrowseControls browse={browse} t={t} />
          {filters.query.length === 0 && filters.topic === undefined ? (
            <MarketDailyPicks
              actions={actions}
              lang={lang}
              t={t}
              onOpen={(day) => openDigest(day, 'hero')}
              onArchive={openArchive}
            />
          ) : null}
          {filters.query.length === 0 && filters.topic === undefined ? (
            <MarketplaceSections
              actions={actions}
              lang={marketplaceLanguage(t)}
              t={t}
              onOpen={(bot, source) => start(bot, 'detail', source)}
              onImport={(bot, source) => start(bot, 'install', source)}
              onSeeAll={(section) => push({ kind: 'ranking', section })}
            />
          ) : null}
          <MarketplaceListStatus browse={browse} t={t} />
          {list.status === 'ready' && list.bots.length > 0 ? (
            <div className="bh-market-grid" role="list" aria-label={t('market.title')}>
              {list.bots.map((bot) => (
                <MarketplaceTile
                  key={bot.id}
                  bot={bot}
                  created={filters.sort === 'created' && filters.query.length === 0}
                  t={t}
                  onOpen={() => start(bot, 'detail', 'list')}
                  onImport={() => start(bot, 'install', 'list')}
                />
              ))}
            </div>
          ) : null}
          <MarketplaceLoadMore browse={browse} t={t} />
        </div>
      </div>
      {pages.map((page, index) => {
        const hidden = section !== 'bots' || index !== pages.length - 1;
        switch (page.kind) {
          case 'bot':
            return (
              <MarketplaceBotFlow
                key={page.key}
                actions={actions}
                t={t}
                start={{ bot: page.bot, step: 'detail', source: page.source }}
                page={{ hidden }}
                onExit={back}
                onClose={back}
                onInstalled={installed}
              />
            );
          case 'ranking':
            return (
              <MarketRankingPage
                key={page.key}
                section={page.section}
                hidden={hidden}
                t={t}
                onBack={back}
                onOpen={(bot, source) => start(bot, 'detail', source)}
                onImport={(bot, source) => start(bot, 'install', source)}
              />
            );
          case 'digest':
            return (
              <MarketDigestPage
                key={page.key}
                actions={actions}
                day={page.day}
                lang={lang}
                t={t}
                hidden={hidden}
                onBack={back}
                onArchive={openArchive}
                renderBot={(bot) => (
                  <MarketplaceTile
                    bot={bot}
                    created={false}
                    t={t}
                    onOpen={() => start(bot, 'detail', 'digest')}
                    onImport={() => start(bot, 'install', 'digest')}
                  />
                )}
              />
            );
          case 'archive':
            return (
              <MarketPastPicksPage
                key={page.key}
                actions={actions}
                lang={lang}
                t={t}
                hidden={hidden}
                onBack={back}
                onOpen={(day) => openDigest(day, 'archive')}
              />
            );
        }
      })}
      {flow === undefined ? null : (
        <MarketplaceBotFlow
          actions={actions}
          t={t}
          start={flow}
          onExit={() => setFlow(undefined)}
          onClose={() => setFlow(undefined)}
          onInstalled={installed}
        />
      )}
      {section === 'bots' && dialog === 'mine' ? (
        <MyUploadsDialog
          actions={actions}
          registry={registry}
          t={t}
          onUpdated={browse.prepend}
          onDeleted={browse.remove}
          onClose={() => navigation.open(undefined)}
        />
      ) : null}
      {section === 'bots' && dialog === 'upload' ? (
        <MarketUploadDialog
          actions={actions}
          registry={registry}
          t={t}
          onListed={browse.prepend}
          onClose={() => navigation.open(undefined)}
        />
      ) : null}
    </div>
  );
}

export function createMarketPanel(
  actions: BridgeActions,
  registry: DockPanelRegistry,
  t: BotHarnessTranslate,
): DockPanel {
  const navigation = createMarketNavigation();
  return {
    id: MARKET_PANEL,
    title: t('market.panel.title'),
    icon: 'store',
    scope: 'global',
    order: 500,
    defaultPosition: { zone: 'right' },
    component: () => (
      <MarketPanelView actions={actions} registry={registry} navigation={navigation} t={t} />
    ),
    headerAction: () => <MarketHeaderAction actions={actions} navigation={navigation} t={t} />,
  };
}
