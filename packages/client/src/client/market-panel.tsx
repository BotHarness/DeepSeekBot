import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { errorMessage } from './bridge.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { appendConversationDraft, conversationDraftKey } from './conversation-draft.js';
import type { DockPanel, DockPanelRegistry } from './dock-panels.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import type { BotHarnessTranslate } from './locale.js';
import { MARKET_SHARE_PROMPT } from './market-share-prompt.js';
import {
  MarketplaceAvatar,
  MarketplaceBotFlow,
  MarketplaceBrowseControls,
  MarketplaceDescription,
  MarketplaceListStatus,
  MarketplaceLoadMore,
  MarketplaceMeta,
  MarketplaceSubmitField,
  marketplaceLanguage,
  marketplaceName,
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
        className="bh-market-open bh-market-tile-head"
        aria-label={t('market.detail.open', { name: bot.fullName })}
        onClick={onOpen}
      >
        <MarketplaceAvatar bot={bot} size={40} t={t} />
        <span className="bh-market-copy">
          <span className="bh-market-card-name">{marketplaceName(bot)}</span>
          <span className="bh-market-owner">{bot.fullName}</span>
        </span>
      </button>
      {bot.description === null ? null : <MarketplaceDescription bot={bot} t={t} />}
      <div className="bh-market-tile-foot">
        <MarketplaceMeta bot={bot} t={t} topics={false} created={created} />
        <Button size="sm" variant="outline" onClick={onImport}>
          {t('market.import')}
        </Button>
      </div>
    </div>
  );
}

function publishable(bots: readonly BotSummary[]): BotSummary[] {
  return bots.filter((bot) => !bot.deleted && bot.tob === undefined);
}

function UploadDialog({
  actions,
  registry,
  t,
  onListed,
  onClose,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
  onListed: (bot: MarketplaceEntry) => void;
  onClose: () => void;
}): ReactElement {
  const bots = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bots);
  const submit = useMarketplaceSubmit(actions, onListed);
  const [opening, setOpening] = useState<string | undefined>(undefined);
  const [cause, setCause] = useState<unknown | undefined>(undefined);
  const candidates = publishable(bots);

  const publish = async (bot: BotSummary): Promise<void> => {
    setOpening(bot.slug);
    setCause(undefined);
    try {
      await actions.openBot(bot.slug);
      const scope = conversationDraftKey(store.getSnapshot());
      if (scope !== undefined) {
        appendConversationDraft(scope, MARKET_SHARE_PROMPT[marketplaceLanguage(t)]);
      }
      registry.open(CHANNEL_BODY_PANEL);
      onClose();
    } catch (failure) {
      setCause(failure);
    } finally {
      setOpening(undefined);
    }
  };

  return (
    <PanelDialog
      size="medium"
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('market.upload.title')}
      description={t('market.upload.description')}
      scroll
      data={{ 'data-market-upload': '' }}
      actions={
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <section className="bh-market-upload-section">
        <strong>{t('market.upload.byBot')}</strong>
        <span className="bh-market-hint">{t('market.upload.byBotHint')}</span>
        {candidates.length === 0 ? (
          <span className="bh-market-state">{t('market.upload.noBots')}</span>
        ) : (
          <div className="bh-market-upload-bots" role="list">
            {candidates.map((bot) => (
              <div key={bot.slug} className="bh-market-upload-bot" role="listitem">
                <PersonaBotAvatar
                  personaBotId={bot.slug}
                  name={bot.displayName}
                  src={bot.avatar}
                  appearance={bot.appearance}
                  avatarSeed={bot.avatarSeed}
                  size={28}
                  indicator={false}
                  still
                  t={t}
                />
                <span className="bh-market-upload-name">{bot.displayName}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('market.upload.publishLabel', { name: bot.displayName })}
                  disabled={opening !== undefined}
                  onClick={() => void publish(bot)}
                >
                  {t('market.upload.publish')}
                </Button>
              </div>
            ))}
          </div>
        )}
        {cause === undefined ? null : (
          <Note tone="danger">{t('market.upload.failed', { error: errorMessage(cause) })}</Note>
        )}
      </section>
      <section className="bh-market-upload-section">
        <strong>{t('market.upload.byUrl')}</strong>
        <MarketplaceSubmitField submit={submit} t={t} />
      </section>
    </PanelDialog>
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
  const browse = useMarketplaceBrowse(actions, marketplaceLanguage(t));
  const [flow, setFlow] = useState<MarketplaceFlowStart | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const { list, filters } = browse;
  return (
    <div className="bh-market-panel" ref={browse.mount} data-market-panel>
      <MarketplaceBrowseControls
        browse={browse}
        t={t}
        action={
          <Button variant="primary" onClick={() => setUploading(true)}>
            {t('market.panel.upload')}
          </Button>
        }
      />
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
      {uploading ? (
        <UploadDialog
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
