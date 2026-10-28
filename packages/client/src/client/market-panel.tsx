import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type {
  MarketplaceEntry,
  MarketplaceInstallSource,
  MarketplaceSection,
} from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { DockPanel, DockPanelRegistry } from './dock-panels.js';
import { PanelDialog } from './ds/panel-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketDigestHero } from './market-digest.js';
import { MyUploadsDialog } from './market-mine.js';
import { useKeptScroll } from './market-page.js';
import { MarketRankingPage, MarketplaceSections, MarketplaceTile } from './market-rankings.js';
import { MarketUploadDialog } from './market-upload.js';
import {
  MarketplaceBotFlow,
  MarketplaceBrowseControls,
  MarketplaceListStatus,
  MarketplaceLoadMore,
  MarketplaceSubmitField,
  marketplaceLanguage,
  useMarketplaceBrowse,
  useMarketplaceSubmit,
  type MarketplaceFlowStart,
} from './marketplace.js';
import { store, type BotSummary } from './store.js';

export const MARKET_PANEL = 'bot-market';

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
  const keepHome = useKeptScroll<HTMLDivElement>();
  const [pages, setPages] = useState<readonly MarketPageEntry[]>([]);
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [mine, setMine] = useState(false);
  const pageKey = useRef(0);
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
  const back = (): void => setPages((current) => current.slice(0, -1));
  const installed = (): void => {
    setFlow(undefined);
    setPages([]);
    registry.open(CHANNEL_BODY_PANEL);
  };
  return (
    <div className="bh-market-stack" data-market-panel>
      <div className="bh-market-page" ref={keepHome} hidden={pages.length > 0}>
        <div className="bh-market-panel" ref={browse.mount}>
          <MarketplaceBrowseControls
            browse={browse}
            t={t}
            action={
              <>
                <Button variant="outline" onClick={() => setMine(true)}>
                  {t('market.mine.open')}
                </Button>
                <Button variant="primary" onClick={() => setUploading(true)}>
                  {t('market.panel.upload')}
                </Button>
              </>
            }
          />
          {filters.query.length === 0 && filters.topic === undefined ? (
            <MarketDigestHero
              actions={actions}
              lang={marketplaceLanguage(t)}
              t={t}
              renderBot={(bot, close) => (
                <MarketplaceTile
                  bot={bot}
                  created={false}
                  t={t}
                  onOpen={() => {
                    close();
                    start(bot, 'detail', 'digest');
                  }}
                  onImport={() => {
                    close();
                    start(bot, 'install', 'digest');
                  }}
                />
              )}
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
          case 'archive':
            return null;
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
  };
}
