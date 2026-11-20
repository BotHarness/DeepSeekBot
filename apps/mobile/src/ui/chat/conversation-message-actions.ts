import type { InitiatedActivityRequest } from '../../host/live-activity-routing';
import { toggleMessageSelection } from './message-selection';
import type { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { loadModelCatalog } from '@botharness/host-client/model-plans';
import type { ModelCatalogEntry } from '@botharness/host-client/model-catalog';
import {
  type ConversationMessage,
  type MessageAttachment,
} from '@botharness/host-client/conversation';
import { shareAttachment } from '../../host/share-attachment';
import { retainHostActivity } from '../../host/host-session';
import { type BubbleGroup } from './bubble-shape';
import { type MessageMenuTarget } from './message-actions';
import { useMessageSourceState } from './message-source-state';
import type { Rect } from './menu-placement';
import type { useConversationSource } from './conversation-source';

export function useConversationMessageState({
  focused,
  source,
}: {
  focused: boolean;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'client' | 'saved' | 'activeChannel' | 'snapshot'
  >;
}) {
  const { client, saved, activeChannel, snapshot } = source;
  const [shareError, setShareError] = useState(false);
  const [viewing, setViewing] = useState<MessageAttachment>();
  const [actionsFor, setActionsFor] = useState<MessageMenuTarget>();
  const [menuCatalog, setMenuCatalog] = useState<{
    host: HostClient;
    models: ModelCatalogEntry[];
  }>();
  const menuModels = menuCatalog?.host === client ? menuCatalog?.models : undefined;
  const needsMenuCatalog =
    menuModels === undefined &&
    actionsFor?.message.turnTargets?.some((target) => target.kind === 'dsh');
  useLayoutEffect(() => {
    if (!needsMenuCatalog || client === undefined) return;
    let active = true;
    void loadModelCatalog(client).then(
      ({ models }) => {
        if (active) setMenuCatalog({ host: client, models });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [client, needsMenuCatalog]);
  const [initiatedRequest, setInitiatedRequest] = useState<InitiatedActivityRequest>();
  const selectionScope = (saved?.hostId ?? '') + ':' + (activeChannel ?? '');
  const {
    message: sourceMessage,
    select: selectSource,
    close: closeSource,
  } = useMessageSourceState(selectionScope, focused, snapshot.messages);
  const [picked, setPicked] = useState<{ scope: string; ids: readonly string[] }>();
  const selected = picked?.scope === selectionScope ? picked.ids : undefined;
  const [replying, setReplying] = useState<{ scope: string; message: ConversationMessage }>();
  const replyTarget = replying?.scope === selectionScope ? replying.message : undefined;
  const [imageSelection, setImageSelection] = useState<{
    scope: string;
    messages: ConversationMessage[];
  }>();
  useLayoutEffect(() => {
    setPicked(undefined);
    setImageSelection(undefined);
    setActionsFor(undefined);
  }, [selectionScope, focused]);
  const togglePicked = useCallback(
    (message: ConversationMessage) => {
      setPicked((current) => ({
        scope: selectionScope,
        ids: toggleMessageSelection(current?.scope === selectionScope ? current.ids : [], message),
      }));
    },
    [selectionScope],
  );

  const [reactError, setReactError] = useState(false);
  return {
    shareError,
    setShareError,
    viewing,
    setViewing,
    actionsFor,
    setActionsFor,
    menuModels,
    initiatedRequest,
    setInitiatedRequest,
    selectionScope,
    sourceMessage,
    selectSource,
    closeSource,
    setPicked,
    selected,
    setReplying,
    replyTarget,
    imageSelection,
    setImageSelection,
    togglePicked,
    reactError,
    setReactError,
  };
}

export function useConversationMessageActions({
  router,
  source,
  messageState,
}: {
  router: ReturnType<typeof useRouter>;
  source: Pick<
    ReturnType<typeof useConversationSource>,
    'client' | 'saved' | 'conversation' | 'activeChannel'
  >;
  messageState: ReturnType<typeof useConversationMessageState>;
}) {
  const { client, saved, conversation, activeChannel } = source;
  const {
    setShareError,
    setActionsFor,
    selectionScope,
    setPicked,
    selected,
    togglePicked,
    setReactError,
  } = messageState;
  const share = useCallback(
    (attachment: MessageAttachment): Promise<void> => {
      setShareError(false);
      return shareAttachment(
        attachment,
        undefined,
        client === undefined ? undefined : () => retainHostActivity(client),
      ).catch(() => setShareError(true));
    },
    [client],
  );

  const retry = useCallback((id: string) => conversation?.retry(id), [conversation]);

  const reportingActions = useCallback(
    (message: ConversationMessage) =>
      activeChannel && saved
        ? {
            feedback: () =>
              router.push({
                pathname: '/message-feedback',
                params: {
                  hostId: saved.hostId,
                  channelId: activeChannel,
                  messageId: message.id,
                },
              }),
            select: () => setPicked({ scope: selectionScope, ids: [message.id] }),
          }
        : undefined,
    [activeChannel, saved, router, selectionScope],
  );
  const openActions = useCallback(
    (message: ConversationMessage, anchor: Rect, group: BubbleGroup) => {
      if (selected !== undefined) {
        togglePicked(message);
        return;
      }
      const actions = reportingActions(message);
      setActionsFor({
        message,
        anchor,
        group,
        ...(actions ? { actions } : {}),
      });
    },
    [selected, togglePicked, reportingActions],
  );
  const selectMessage = useCallback(
    (message: ConversationMessage) => {
      if (selected !== undefined) {
        togglePicked(message);
        return;
      }
      const ids = toggleMessageSelection([], message);
      if (ids.length > 0) setPicked({ scope: selectionScope, ids });
    },
    [selected, togglePicked, selectionScope],
  );

  const react = useCallback(
    (messageId: string, emoji: string, active: boolean): void => {
      setReactError(false);
      void conversation?.react(messageId, emoji, active).catch(() => setReactError(true));
    },
    [conversation],
  );
  return { share, retry, reportingActions, openActions, selectMessage, react };
}
