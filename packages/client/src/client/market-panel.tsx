import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceEntry, MarketplaceSection } from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { DockPanel, DockPanelRegistry } from './dock-panels.js';
import { PanelDialog } from './ds/panel-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketDigestHero } from './market-digest.js';
import { MyUploadsDialog } from './market-mine.js';
import { useMountedResource } from './mounted-resource.js';
import { MarketUploadDialog } from './market-upload.js';
import {
  MarketplaceAvatar,
  MarketplaceBanner,
  MarketplaceBotFlow,
  MarketplaceBrowseControls,
  MarketplaceDescription,
  MarketplaceListStatus,
  MarketplaceLoadMore,
  MarketplaceMeta,
  MarketplaceSubmitField,
  marketplaceLanguage,
  marketplaceName,
  marketplaceOwner,
  useMarketplaceBrowse,
  useMarketplaceSubmit,
  type MarketplaceFlowStart,
} from './marketplace.js';
import { store, type BotSummary } from './store.js';

export const MARKET_PANEL = 'bot-market';

function MarketplaceTile({
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
              {bot.source === 'upload' ? marketplaceOwner(bot) : bot.fullName}
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

const SECTION_TITLES = {
  hot: 'market.section.hot',
  new: 'market.section.new',
  rising: 'market.section.rising',
} as const;

function MarketplaceSections({
  actions,
  lang,
  t,
  onOpen,
  onImport,
}: {
  actions: BridgeActions;
  lang: ReturnType<typeof marketplaceLanguage>;
  t: BotHarnessTranslate;
  onOpen: (bot: MarketplaceEntry) => void;
  onImport: (bot: MarketplaceEntry) => void;
}): ReactElement {
  const [sections, setSections] = useState<MarketplaceSection[]>([]);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let live = true;
    void actions.marketplaceSections(lang).then(
      (loaded) => {
        if (live) setSections(loaded);
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
      {shown.map((section) => (
        <section
          key={section.section}
          className="bh-market-section"
          data-market-section={section.section}
          aria-label={t(SECTION_TITLES[section.section])}
        >
          <h3 className="bh-market-section-title">{t(SECTION_TITLES[section.section])}</h3>
          <div className="bh-market-row" role="list">
            {section.entries.map(({ bot }) => (
              <MarketplaceTile
                key={bot.id}
                bot={bot}
                created={false}
                t={t}
                onOpen={() => onOpen(bot)}
                onImport={() => onImport(bot)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function MarketPanelView({
  actions,
  registry,
  t,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  const browse = useMarketplaceBrowse(actions, marketplaceLanguage(t), { includeUploads: true });
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [mine, setMine] = useState(false);
  const { list, filters } = browse;
  return (
    <div className="bh-market-panel" ref={browse.mount} data-market-panel>
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
                setFlow({ bot, step: 'detail' });
              }}
              onImport={() => {
                close();
                setFlow({ bot, step: 'install' });
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
          onOpen={(bot) => setFlow({ bot, step: 'detail' })}
          onImport={(bot) => setFlow({ bot, step: 'install' })}
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
              onOpen={() => setFlow({ bot, step: 'detail' })}
              onImport={() => setFlow({ bot, step: 'install' })}
            />
          ))}
        </div>
      ) : null}
      <MarketplaceLoadMore browse={browse} t={t} />
      {flow === undefined ? null : (
        <MarketplaceBotFlow
          actions={actions}
          t={t}
          start={flow}
          onExit={() => setFlow(undefined)}
          onClose={() => setFlow(undefined)}
          onInstalled={() => {
            setFlow(undefined);
            registry.open(CHANNEL_BODY_PANEL);
          }}
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
