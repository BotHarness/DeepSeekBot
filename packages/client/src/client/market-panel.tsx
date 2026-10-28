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
  MarketplaceOwner,
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
  onOpen: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
  onImport: (bot: MarketplaceEntry, source: MarketplaceInstallSource) => void;
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
      {shown.map((section) => (
        <section
          key={section.section}
          className="bh-market-section"
          data-market-section={section.section}
          aria-label={t(SECTION_TITLES[section.section])}
        >
          <h3 className="bh-market-section-title">{t(SECTION_TITLES[section.section])}</h3>
          <div className="bh-market-carousel" role="list">
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
        </section>
      ))}
    </div>
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
          case 'digest':
          case 'archive':
          case 'ranking':
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
