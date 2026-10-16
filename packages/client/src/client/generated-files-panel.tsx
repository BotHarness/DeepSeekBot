import { createContext, useContext, useState, type ReactElement } from 'react';
import { attachmentIdentity } from '../../../core/src/attachments/ref.js';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import type { BotHarnessTranslate } from './locale.js';
import { MessageAttachment } from './message-attachment.js';
import { useMountedResource } from './mounted-resource.js';
import { store, type ChannelAttachmentRef } from './store.js';
import { createGeneratedFilesHistory, type GeneratedFile } from './generated-files-history.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import type { DockPanel, DockPanelProps } from './dock-panels.js';
import { Select } from './ds/select.js';

export const GeneratedFilesContext = createContext<
  | {
      attachments: readonly ChannelAttachmentRef[];
      full: boolean;
      disabled: boolean;
      toggle(ref: ChannelAttachmentRef): void;
    }
  | undefined
>(undefined);

function GeneratedFilesPanel({
  channel,
  actions,
  t,
}: DockPanelProps & { actions: BridgeActions; t: BotHarnessTranslate }): ReactElement {
  const state = useClientState();
  const composer = useContext(GeneratedFilesContext);
  const [selectedBot, setSelectedBot] = useState('');
  const botSlug = channel?.botSlug ?? selectedBot;
  const channelId = channel?.id;
  const members = state.channels.find((item) => item.id === channelId)?.members ?? [];
  const [history, setHistory] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    setHistory([]);
    setError(undefined);
    setLoading(false);
    if (channelId === undefined || !botSlug) return;
    const controller = new AbortController();
    const cache = createGeneratedFilesHistory(botSlug);
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
  }, [channelId, botSlug, actions, retry]);
  const files = new Map<string, GeneratedFile>();
  for (const file of history) {
    const id = attachmentIdentity(file.ref);
    if (!files.has(id)) files.set(id, file);
  }
  const selected = new Set(composer?.attachments.map(attachmentIdentity));
  return (
    <div ref={mount} className="bh-generated-files">
      {channel?.type === 'group' ? (
        <Select
          label={t('generatedFiles.bot')}
          value={selectedBot}
          onChange={setSelectedBot}
          options={[
            { value: '', label: t('generatedFiles.bot') },
            ...members.map((slug) => ({
              value: slug,
              label: state.bots.find((bot) => bot.slug === slug)?.displayName ?? slug,
            })),
          ]}
        />
      ) : null}
      {loading ? <p role="status">{t('generatedFiles.loading')}</p> : null}
      {error === undefined ? null : (
        <div role="alert">
          {error}{' '}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            {t('generatedFiles.retry')}
          </button>
        </div>
      )}
      {botSlug && !loading && error === undefined && files.size === 0 ? (
        <p className="bh-generated-files-empty">{t('generatedFiles.empty')}</p>
      ) : null}
      <ul className="bh-generated-files-list">
        {[...files].map(([id, file]) => (
          <li key={id} className="bh-generated-file">
            <MessageAttachment
              attachment={file.ref}
              channelId={channelId}
              messageId={file.messageId}
              actions={actions}
              t={t}
            />
            <button
              type="button"
              className="bh-generated-file-reference"
              data-mounted={selected.has(id) ? 'true' : undefined}
              aria-pressed={selected.has(id)}
              disabled={
                composer === undefined || composer.disabled || (composer.full && !selected.has(id))
              }
              onClick={() => composer?.toggle(file.ref)}
            >
              {selected.has(id) ? t('generatedFiles.release') : t('generatedFiles.reference')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function createGeneratedFilesPanel(
  actions: BridgeActions,
  t: BotHarnessTranslate,
): DockPanel {
  return {
    id: 'generated-files',
    title: t('generatedFiles.title'),
    icon: 'archive',
    scope: 'channel',
    order: -90,
    defaultPosition: { zone: 'right' },
    component: ({ channel }) => (
      <GeneratedFilesPanel key={channel?.id} channel={channel} actions={actions} t={t} />
    ),
  };
}
