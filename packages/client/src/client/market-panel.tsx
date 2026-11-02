import { useRef, useState, type ReactElement } from 'react';

import type {
  MarketplaceEntry,
  MarketplaceInstallSource,
  MarketplaceSection,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { Tooltip } from './ds/tooltip.js';
import type { DockPanel, DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketDailyPicks, MarketDigestPage, MarketPastPicksPage } from './market-digest.js';
import { MyUploadsDialog } from './market-mine.js';
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

export const MARKET_PANEL = 'bot-market';

type MarketRequest = 'upload' | 'mine';

const marketRequests = new Set<(request: MarketRequest) => void>();

function requestMarket(request: MarketRequest): void {
  for (const listener of marketRequests) listener(request);
}

export function MarketHeaderAction({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <>
      <Tooltip label={t('market.mine.open')} side="bottom" delayMs={500}>
        <IconButton
          size="row"
          tone="subtle"
          aria-label={t('market.mine.open')}
          aria-haspopup="dialog"
          onClick={() => requestMarket('mine')}
        >
          <ChannelSidebarIcon name="package" />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('market.panel.upload')} side="bottom" delayMs={500}>
        <IconButton
          size="row"
          tone="subtle"
          aria-label={t('market.panel.upload')}
          aria-haspopup="dialog"
          onClick={() => requestMarket('upload')}
        >
          <ChannelSidebarIcon name="upload" />
        </IconButton>
      </Tooltip>
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

export function MarketPanelView({
  actions,
  registry,
  t,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  const browse = useMarketplaceBrowse(actions, marketplaceLanguage(t), {
    includeUploads: true,
  });
  const lang = marketplaceLanguage(t);
  const keepHome = useKeptScroll<HTMLDivElement>();
  const [pages, setPages] = useState<readonly MarketPageEntry[]>([]);
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [mine, setMine] = useState(false);
  const pageKey = useRef(0);
  const listen = useMountedResource<HTMLDivElement>(() => {
    const listener = (request: MarketRequest): void => {
      if (request === 'upload') setUploading(true);
      else setMine(true);
    };
    marketRequests.add(listener);
    return () => {
      marketRequests.delete(listener);
    };
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
    <div className="bh-market-stack" data-market-panel ref={listen}>
      <div className="bh-market-page" ref={keepHome} hidden={pages.length > 0}>
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
        const hidden = index !== pages.length - 1;
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
      {mine ? (
        <MyUploadsDialog
          actions={actions}
          registry={registry}
          t={t}
          onUpdated={browse.prepend}
          onDeleted={browse.remove}
          onClose={() => setMine(false)}
        />
      ) : null}
      {uploading ? (
        <MarketUploadDialog
          actions={actions}
          registry={registry}
          t={t}
          onListed={browse.prepend}
          onClose={() => setUploading(false)}
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
  return {
    id: MARKET_PANEL,
    title: t('market.title'),
    icon: 'store',
    scope: 'global',
    order: 500,
    defaultPosition: { zone: 'right' },
    component: () => <MarketPanelView actions={actions} registry={registry} t={t} />,
    headerAction: () => <MarketHeaderAction t={t} />,
  };
}
