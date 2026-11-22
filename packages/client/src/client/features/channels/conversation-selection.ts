import type { ConversationStateView, ChannelMessage, ChannelSummary } from '../../store.js';
import { useScopedState } from '../../scoped-state.js';
import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { BotHarnessTranslate } from '../../locale.js';
import { buildMessageSnapshot, renderMessageSnapshot } from '../../message-snapshot.js';
import {
  conversationText,
  selectionRange,
  toggleSelection,
  type MessageSelection,
} from '../../message-selection-state.js';
import { text } from '../../ds/tokens.stylex.js';
import { authorLabel } from './message-labels.js';
import type { MessageMenuRequest } from './message-menus.js';

export type SelectedMessages = { channelId: string; ids: readonly string[] };

export function useConversationSelection({
  selectedMessages,
  channelId,
  setMessageMenu,
  setSelectedMessages,
  scopeKey,
  state,
  t,
  channel,
  messages,
  title,
  scrollRef,
}: {
  selectedMessages: SelectedMessages | undefined;
  channelId: string | undefined;
  setMessageMenu: Dispatch<SetStateAction<MessageMenuRequest | undefined>>;
  setSelectedMessages: Dispatch<SetStateAction<SelectedMessages | undefined>>;
  scopeKey: string;
  state: ConversationStateView;
  t: BotHarnessTranslate;
  channel: ChannelSummary | undefined;
  messages: readonly ChannelMessage[];
  title: string;
  scrollRef: { current: HTMLDivElement | null };
}) {
  const selectedIds =
    selectedMessages !== undefined && selectedMessages.channelId === channelId
      ? selectedMessages.ids
      : undefined;
  const messageSelection = useMemo<MessageSelection | undefined>(
    () =>
      channelId === undefined
        ? undefined
        : {
            selected: new Set(selectedIds ?? []),
            active: selectedIds !== undefined,
            begin: (message) => {
              setMessageMenu(undefined);
              setSelectedMessages({
                channelId,
                ids: toggleSelection([], message),
              });
            },
            toggle: (message) =>
              setSelectedMessages((current) =>
                current === undefined || current.channelId !== channelId
                  ? current
                  : { channelId, ids: toggleSelection(current.ids, message) },
              ),
          },
    [channelId, selectedIds],
  );
  const cancelSelection = useCallback(() => setSelectedMessages(undefined), [scopeKey]);
  const [selectionBusy, setSelectionBusy] = useScopedState(scopeKey, false);
  const [selectionImage, setSelectionImage] = useScopedState<Blob | undefined>(scopeKey);
  const snapshotScope = useRef(scopeKey);
  snapshotScope.current = scopeKey;
  const [selectionNotice, setSelectionNotice] = useScopedState<string>(scopeKey);
  const flashSelectionNotice = (notice: string): void => {
    setSelectionNotice(notice);
    window.setTimeout(
      () => setSelectionNotice((current) => (current === notice ? undefined : current)),
      2500,
    );
  };
  const selectionAuthor = (message: ChannelMessage): string =>
    authorLabel(message, state.bots, t, channel);
  const copySelection = async (ids: readonly string[]): Promise<void> => {
    const text = conversationText(ids, messages, {
      title,
      author: selectionAuthor,
      attachment: t('selection.attachment'),
    });
    try {
      await navigator.clipboard.writeText(text);
      flashSelectionNotice(t('selection.copied', { count: String(ids.length) }));
    } catch {
      flashSelectionNotice(t('selection.failed'));
    }
  };
  const exportSelectionImage = async (ids: readonly string[]): Promise<void> => {
    const timeline = scrollRef.current;
    const range = selectionRange(ids, messages);
    if (timeline === null || range === undefined) return;
    const first = messages.find((message) => message.id === range.fromMessageId);
    const last = messages.find(
      (message) => message.id === (range.toMessageId ?? range.fromMessageId),
    );
    const sheet = buildMessageSnapshot(
      timeline,
      ids,
      title,
      [first, last]
        .filter((message) => message !== undefined)
        .map((message) =>
          new Date(message.at).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        )
        .filter((value, index, all) => all.indexOf(value) === index)
        .join(' – '),
    );
    if (sheet === undefined) return;
    setSelectionBusy(true);
    try {
      const blob = await renderMessageSnapshot(timeline, sheet);
      if (blob === undefined) throw new Error('snapshot-empty');
      if (snapshotScope.current === scopeKey) setSelectionImage(blob);
    } catch {
      flashSelectionNotice(t('selection.failed'));
    } finally {
      setSelectionBusy(false);
    }
  };
  return {
    selectedIds,
    messageSelection,
    cancelSelection,
    selectionBusy,
    selectionImage,
    setSelectionImage,
    selectionNotice,
    selectionAuthor,
    copySelection,
    exportSelectionImage,
  };
}
