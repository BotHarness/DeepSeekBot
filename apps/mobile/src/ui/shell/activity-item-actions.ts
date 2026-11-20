import type { HostClient } from '@botharness/host-client/client';
import type { Inbox, InboxSection } from '@botharness/host-client/inbox';
import {
  activityKey,
  type ActivityItem as HumanAttentionItem,
  type ActivitySource,
} from '../../host/activity-sources';
import {
  attentionItemUnread,
  clearAttentionItem,
  markAttentionItemRead,
  restoreAttentionItem,
  SNOOZE_CHOICES,
  snoozeAttentionItem,
  snoozeUntil,
  type SnoozeChoice,
} from '@botharness/host-client/attention-actions';
import { showActionMenu } from '../primitives/app-dialog';
import type { SwipeAction } from '../primitives/swipe-row';
import type { UndoNotice } from '../primitives/undo-bar';
import { ArchiveIcon, CheckIcon, ClockIcon, UndoIcon } from './icons';
import type { useStrings } from '../strings';
import type { ActivityFilter } from './activity-filters';
import type { Dispatch, SetStateAction } from 'react';
import type { HiddenItems } from './activity-feed-rows';

export function activityItemActions({
  setHidden,
  sources,
  client,
  filter,
  t,
  onNotice,
  currentInbox,
}: {
  setHidden: Dispatch<SetStateAction<HiddenItems>>;
  sources: readonly ActivitySource[] | undefined;
  client: HostClient | undefined;
  filter: ActivityFilter;
  t: ReturnType<typeof useStrings>;
  onNotice: ((notice: Omit<UndoNotice, 'id'>) => void) | undefined;
  currentInbox: () => Inbox | undefined;
}) {
  const hide = (item: HumanAttentionItem, on: boolean) =>
    setHidden((current) => {
      const next = new Map(current);
      if (on) next.set(activityKey(item), item.sourceEventId ?? '');
      else if (next.get(activityKey(item)) === (item.sourceEventId ?? ''))
        next.delete(activityKey(item));
      return next;
    });
  const change = async (
    item: HumanAttentionItem,
    apply: () => Promise<void>,
    message: string,
    undo?: () => Promise<void>,
  ) => {
    hide(item, true);
    try {
      if (clientFor(item)?.getSnapshot().connection.status !== 'connected')
        throw new Error('activity-source-unavailable');
      await apply();
      onNotice?.({
        message,
        ...(undo === undefined
          ? {}
          : {
              undoLabel: t.activityUndo,
              undo: () =>
                void Promise.resolve()
                  .then(() => {
                    if (clientFor(item)?.getSnapshot().connection.status !== 'connected')
                      throw new Error('activity-source-unavailable');
                    return undo();
                  })
                  .catch(() => onNotice?.({ message: t.activityChangeFailed }))
                  .finally(() => void currentInbox()?.refresh()),
            }),
      });
      await currentInbox()?.refresh();
    } catch {
      onNotice?.({ message: t.activityChangeFailed });
    } finally {
      hide(item, false);
    }
  };
  const clientFor = (item: HumanAttentionItem) =>
    sources === undefined
      ? client
      : sources.find((source) => source.client === item.activitySource?.client)?.client;
  const snoozeTo = (item: HumanAttentionItem, choice: SnoozeChoice) => {
    const client = clientFor(item);
    if (client === undefined) return;
    const until = snoozeUntil(choice, new Date());
    if (until === undefined) return;
    const time = until.toLocaleString(undefined, {
      weekday: choice === 'week' ? 'short' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
    void change(
      item,
      () => snoozeAttentionItem(client, item, until),
      t.activitySnoozedNotice(t.activitySnoozeChoice[choice](time)),
      () => snoozeAttentionItem(client, item, null),
    );
  };
  const actionsFor = (item: HumanAttentionItem, section: InboxSection): SwipeAction[] => {
    const client = clientFor(item);
    if (client === undefined || section === 'handled') return [];
    if (filter.section === 'cleared')
      return [
        {
          key: 'restore',
          label: t.activityRestore,
          tone: 'accent',
          icon: UndoIcon,
          run: () =>
            void change(
              item,
              () => restoreAttentionItem(client, item),
              t.activityRestoredNotice,
              () => clearAttentionItem(client, item),
            ),
        },
      ];
    if (filter.section === 'snoozed') {
      const until = item.snoozedUntil === undefined ? undefined : new Date(item.snoozedUntil);
      return [
        {
          key: 'unsnooze',
          label: t.activityUnsnooze,
          tone: 'accent',
          icon: UndoIcon,
          run: () =>
            void change(
              item,
              () => snoozeAttentionItem(client, item, null),
              t.activityRestoredNotice,
              until === undefined || until.getTime() <= Date.now()
                ? undefined
                : () => snoozeAttentionItem(client, item, until),
            ),
        },
      ];
    }
    const clear: SwipeAction = {
      key: 'clear',
      label: t.activityClear,
      tone: 'accent',
      icon: ArchiveIcon,
      run: () =>
        void change(
          item,
          () => clearAttentionItem(client, item),
          t.activityClearedNotice,
          () => restoreAttentionItem(client, item),
        ),
    };
    const later: SwipeAction = {
      key: 'snooze',
      label: t.activitySnooze,
      tone: 'neutral',
      icon: ClockIcon,
      run: () =>
        showActionMenu(
          t.activitySnoozeTitle,
          SNOOZE_CHOICES.flatMap((choice) => {
            const until = snoozeUntil(choice, new Date());
            if (until === undefined) return [];
            const time = until.toLocaleString(undefined, {
              weekday: choice === 'week' ? 'short' : undefined,
              hour: '2-digit',
              minute: '2-digit',
            });
            return [
              {
                text: t.activitySnoozeChoice[choice](time),
                icon: 'clock' as const,
                onPress: () => snoozeTo(item, choice),
              },
            ];
          }),
        ),
    };
    const read: SwipeAction = {
      key: 'read',
      label: t.activityMarkRead,
      tone: 'accent',
      icon: CheckIcon,
      run: () =>
        void markAttentionItemRead(client, item)
          .catch(() => onNotice?.({ message: t.activityChangeFailed }))
          .finally(() => void currentInbox()?.refresh()),
    };
    if (section === 'action' && item.kind === 'bot-message-needs-repair') return [clear, later];
    if (section === 'action')
      return [
        {
          key: 'snooze-tomorrow',
          label: t.activitySnoozeTomorrow,
          tone: 'warning',
          icon: ClockIcon,
          run: () => snoozeTo(item, 'tomorrow'),
        },
        later,
      ];
    return attentionItemUnread(item) ? [read, { ...clear, tone: 'neutral' }] : [clear];
  };
  return { actionsFor, clientFor };
}
