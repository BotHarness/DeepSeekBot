import { useRef, useState, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import { BotInboxItemRow } from './channel-sidebar-builtins.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem } from './store.js';
import { SidebarCardList } from './sidebar-card.js';

type InboxPage =
  | { status: 'loading'; items: BotAttentionItem[]; nextCursor?: string | undefined }
  | { status: 'ready'; items: BotAttentionItem[]; nextCursor?: string | undefined }
  | { status: 'error'; items: BotAttentionItem[]; error: string; cursor?: string | undefined };

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
        cursor,
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

  const items = [
    ...page.items.filter((item) => item.sourceMessageId === messageId),
    ...page.items.filter((item) => item.sourceMessageId !== messageId),
  ];
  const nextCursor = page.status === 'ready' ? page.nextCursor : undefined;
  const sentinelRef = useMountedResource<HTMLDivElement>(
    (sentinel) => {
      if (nextCursor === undefined || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load(nextCursor);
        }
      });
      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [nextCursor],
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
      {page.status === 'loading' && page.items.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('inbox.loading')} />
      ) : null}
      {page.status === 'error' ? (
        <div className="bh-error" role="alert">
          {t('inbox.error', { error: page.error })}
          <button type="button" onClick={() => void load(page.cursor)}>
            {t('inbox.retry')}
          </button>
        </div>
      ) : null}
      {page.status === 'ready' && page.items.length === 0 ? (
        <PanelEmptyState icon="inbox">{t('inbox.empty')}</PanelEmptyState>
      ) : null}
      {items.length === 0 ? null : (
        <SidebarCardList label={t('message.delivery.history')}>
          {items.map((item) => (
            <BotInboxItemRow
              key={item.id}
              item={item}
              source={item.externalOrigin?.conversationName ?? item.sourceChannelName}
              marker={
                item.sourceMessageId === messageId ? t('message.delivery.thisMessage') : undefined
              }
              actions={actions}
              t={t}
            />
          ))}
        </SidebarCardList>
      )}
      {page.status === 'loading' && page.items.length > 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('inbox.loading')} />
      ) : null}
      {nextCursor === undefined ? null : (
        <div ref={sentinelRef} data-inbox-more="">
          <button
            type="button"
            className="bh-group-manage-button"
            onClick={() => void load(nextCursor)}
          >
            {t('inbox.more')}
          </button>
        </div>
      )}
    </PanelDialog>
  );
}
