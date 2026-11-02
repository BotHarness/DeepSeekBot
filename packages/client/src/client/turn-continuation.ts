import { useMemo, useSyncExternalStore } from 'react';
import {
  readSeconds,
  subscribeNever,
  subscribeSeconds,
  turnContinuationFor,
  type TurnContinuationNotice,
} from '../shared/turn-continuation.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { store } from './store.js';
const unavailableOwner = {};

export function useTurnContinuation(
  actions: Pick<BridgeActions, 'retryMessage' | 'stopBot'> | undefined,
  input: Parameters<typeof turnContinuationFor>[1],
) {
  const { channelId, failureMessageId, botSlug, role, requestMessageId } = input;
  const controller = useMemo(
    () =>
      turnContinuationFor(
        actions ?? unavailableOwner,
        {
          channelId,
          failureMessageId,
          botSlug: actions ? botSlug : undefined,
          role,
          requestMessageId,
        },
        {
          continueTurn: (channel, messageId, failure) =>
            actions!.retryMessage(channel, messageId, {
              action: 'continue',
              failureMessageId: failure,
            }),
          stop: (channel, slug) => actions!.stopBot(channel, slug),
        },
      ),
    [actions, channelId, failureMessageId, botSlug, role, requestMessageId],
  );
  return {
    ...controller,
    ...useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot),
  };
}

export function useIsLatestMessage(channelId: string | undefined, messageId: string): boolean {
  const latest = () => {
    const conversation = store.getSnapshot().conversation;
    return (
      channelId !== undefined &&
      conversation.channel?.id === channelId &&
      conversation.messages.at(-1)?.id === messageId
    );
  };
  return useSyncExternalStore(store.subscribe, latest, latest);
}

export function useNow(active: boolean): number {
  return useSyncExternalStore(active ? subscribeSeconds : subscribeNever, readSeconds, readSeconds);
}

export function turnContinuationText(
  notice: TurnContinuationNotice,
  t: BotHarnessTranslate,
): string {
  const keys = {
    busy: 'failure.recoveryBusy',
    changed: 'failure.continueChanged',
    unavailable: 'failure.continueUnavailable',
    failed: 'failure.continueFailed',
    cancelled: 'failure.continueCancelled',
  } as const;
  return t(keys[notice]);
}
