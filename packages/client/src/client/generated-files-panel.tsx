import {
  IconPaperclipOutlineRegular,
  IconCheckOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import { IconButton } from './ds/icon-button.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { createContext, useContext, useState, type ReactElement } from 'react';
import { attachmentIdentity } from '../../../core/src/attachments/ref.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { MessageAttachment } from './message-attachment.js';
import { useMountedResource } from './mounted-resource.js';
import { store, type ChannelAttachmentRef } from './store.js';
import { createGeneratedFilesHistory, type GeneratedFile } from './generated-files-history.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';

export const GeneratedFilesContext = createContext<
  | {
      attachments: readonly ChannelAttachmentRef[];
      full: boolean;
      disabled: boolean;
      toggle(ref: ChannelAttachmentRef): void;
    }
  | undefined
>(undefined);

export function ChannelFiles({
  channelId,
  actions,
  t,
}: {
  channelId: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const composer = useContext(GeneratedFilesContext);
  const [history, setHistory] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    setHistory([]);
    setError(undefined);
    setLoading(false);
    const controller = new AbortController();
    const cache = createGeneratedFilesHistory();
    const reconcile = (): void => {
      const snapshot = store.getSnapshot();
      const latest = snapshot.channels.find((item) => item.id === channelId)?.latestMessage;
      if (latest !== undefined) cache.accept([latest], 'live');
      if (snapshot.conversation.channel?.id === channelId)
        cache.accept(snapshot.conversation.messages, 'live');
      setHistory(cache.files());
    };
    const unsubscribe = store.subscribe(reconcile);
    const stopRedactions = subscribeMessagingDefaults(
      () => undefined,
      (placements) => {
        cache.purge(
          placements.filter((item) => item.channelId === channelId).map((item) => item.messageId),
        );
        setHistory(cache.files());
      },
    );
    reconcile();
    setLoading(true);
    void (async () => {
      let cursor: string | undefined;
      do {
        const page = await actions.humanInboxContextPage(
          channelId,
          { limit: 200, ...(cursor === undefined ? {} : { direction: 'older', cursor }) },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        cache.accept(page.entries, 'history');
        setHistory(cache.files());
        cursor = page.hasOlder ? (page.olderCursor ?? undefined) : undefined;
      } while (cursor !== undefined);
    })()
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      unsubscribe();
      stopRedactions();
    };
  }, [channelId, actions, retry]);
  const files = new Map<string, GeneratedFile>();
  for (const file of history) {
    const id = attachmentIdentity(file.ref);
    if (!files.has(id)) files.set(id, file);
  }
  const selected = new Set(composer?.attachments.map(attachmentIdentity));
  return (
    <div ref={mount} className="bh-generated-files">
      {loading ? <p role="status">{t('generatedFiles.loading')}</p> : null}
      {error === undefined ? null : (
        <div role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {t('generatedFiles.retry')}
          </button>
        </div>
      )}
      {!loading && error === undefined && files.size === 0 ? (
        <PanelEmptyState icon="file">{t('generatedFiles.empty')}</PanelEmptyState>
      ) : null}
      <ul className="bh-generated-files-list">
        {[...files].map(([id, file]) => (
          <li key={id} className="bh-generated-file">
            <MessageAttachment
              compact
              trailingAction={
                <Tooltip
                  label={
                    selected.has(id) ? t('generatedFiles.release') : t('generatedFiles.reference')
                  }
                  side="bottom"
                  delayMs={500}
                >
                  <IconButton
                    aria-label={`${selected.has(id) ? t('generatedFiles.release') : t('generatedFiles.reference')}: ${file.ref.name}`}
                    data-file-reference=""
                    aria-pressed={selected.has(id)}
                    disabled={
                      composer === undefined ||
                      composer.disabled ||
                      (composer.full && !selected.has(id))
                    }
                    onClick={() => composer?.toggle(file.ref)}
                  >
                    {selected.has(id) ? (
                      <IconCheckOutlineRegular size={16} />
                    ) : (
                      <IconPaperclipOutlineRegular size={16} />
                    )}
                  </IconButton>
                </Tooltip>
              }
              attachment={file.ref}
              channelId={channelId}
              messageId={file.messageId}
              actions={actions}
              t={t}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
