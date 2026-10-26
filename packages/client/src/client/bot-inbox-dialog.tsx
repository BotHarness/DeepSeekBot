import { useRef, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { BotInboxItemRow } from './channel-sidebar-builtins.js';
import { GroupHeading } from './ds/group-heading.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem } from './store.js';
import { SidebarCardList } from './sidebar-card.js';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

type InboxPage =
  | { status: 'loading'; items: BotAttentionItem[]; nextCursor?: string | undefined }
  | { status: 'ready'; items: BotAttentionItem[]; nextCursor?: string | undefined }
  | { status: 'error'; items: BotAttentionItem[]; error: string };

export function BotInboxDialog({
  botSlug,
  botName,
  messageId,
  missing,
  actions,
  t,
  onClose,
}: {
  botSlug: string;
  botName: string;
  messageId: string;
  missing: boolean;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const [page, setPage] = useState<InboxPage>({ status: 'loading', items: [] });
  const request = useRef(0);
  const load = async (cursor?: string): Promise<void> => {
    const current = ++request.current;
    setPage((prior) => ({ status: 'loading', items: cursor === undefined ? [] : prior.items }));
    try {
      const next = await actions.botInboxPage(botSlug, cursor);
      if (current !== request.current) return;
      setPage((prior) => {
        const seen = new Set(prior.items.map((item) => item.id));
        return {
          status: 'ready',
          items: [...prior.items, ...next.items.filter((item) => !seen.has(item.id))],
          nextCursor: next.nextCursor,
        };
      });
    } catch (error) {
      if (current !== request.current) return;
      setPage((prior) => ({
        status: 'error',
        items: prior.items,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };
  const bodyRef = useMountedResource<HTMLDivElement>(() => {
    void load();
    return () => {
      ++request.current;
    };
  }, []);

  const matching = page.items.filter((item) => item.sourceMessageId === messageId);
  const history = page.items.filter((item) => item.sourceMessageId !== messageId);
  const row = (item: BotAttentionItem): ReactElement => (
    <BotInboxItemRow
      key={item.id}
      item={item}
      source={item.externalOrigin?.conversationName ?? item.sourceChannelName}
      actions={actions}
      t={t}
    />
  );
  return (
    <PanelDialog
      size="medium"
      scroll
      title={t('message.delivery.inboxTitle', { name: botName })}
      closeLabel={t('common.close')}
      onClose={onClose}
      data={{ 'data-bot-inbox-dialog': botSlug }}
      bodyRef={bodyRef}
    >
      {missing ? (
        <Note tone="warning">{t('message.delivery.notInInbox', { name: botName })}</Note>
      ) : null}
      {matching.length === 0 ? null : (
        <section data-inbox-match="">
          <GroupHeading
            quiet
            label={t('message.delivery.thisMessage')}
            count={<Tag tone="neutral">{matching.length}</Tag>}
          />
          <SidebarCardList label={t('message.delivery.thisMessage')}>
            {matching.map(row)}
          </SidebarCardList>
        </section>
      )}
      {page.status === 'loading' && page.items.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('inbox.loading')} />
      ) : null}
      {page.status === 'error' ? (
        <div className="bh-error" role="alert">
          {t('inbox.error', { error: page.error })}
          <button type="button" onClick={() => void load()}>
            {t('inbox.retry')}
          </button>
        </div>
      ) : null}
      {page.status === 'ready' && page.items.length === 0 ? (
        <PanelEmptyState icon="inbox">{t('inbox.empty')}</PanelEmptyState>
      ) : null}
      {history.length === 0 ? null : (
        <section data-inbox-history="">
          <GroupHeading
            quiet
            label={t('message.delivery.history')}
            count={<Tag tone="neutral">{history.length}</Tag>}
          />
          <SidebarCardList label={t('message.delivery.history')}>
            {history.map(row)}
          </SidebarCardList>
        </section>
      )}
      {page.status === 'ready' && page.nextCursor !== undefined ? (
        <button
          type="button"
          className="bh-group-manage-button"
          onClick={() => void load(page.nextCursor)}
        >
          {t('inbox.more')}
        </button>
      ) : null}
    </PanelDialog>
  );
}
