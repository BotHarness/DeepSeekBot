import type { InitiatedActivityRequest } from '../../host/live-activity-routing';
import { toggleMessageSelection } from './message-selection';
import type { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { HostClient } from '@botharness/host-client/client';
import { loadModelCatalog } from '@botharness/host-client/model-plans';
import { loadRoutingGroupEngines } from '@botharness/host-client/model-catalog';
import type { TurnTargetCatalog } from '@botharness/host-client/turn-target';
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
  const [cachedCatalog, setMenuCatalog] = useState<
    TurnTargetCatalog & {
      host: HostClient;
    }
  >();
  const menuCatalog = cachedCatalog?.host === client ? cachedCatalog : undefined;
  const timelineTargets = useMemo(() => {
    let models = false;
    let engines = false;
    for (const { turnModelSwitch } of snapshot.messages) {
      if (turnModelSwitch === undefined) continue;
      for (const target of [turnModelSwitch.from, turnModelSwitch.to]) {
        models ||= target.kind === 'dsh';
        engines ||= target.kind === 'engine';
      }
      if (models && engines) break;
    }
    return { models, engines };
  }, [snapshot.messages]);
  const needsModels =
    menuCatalog?.models === undefined &&
    (timelineTargets.models ||
      actionsFor?.message.turnTargets?.some((target) => target.kind === 'dsh'));
  const needsEngines =
    menuCatalog?.engines === undefined &&
    (timelineTargets.engines ||
      actionsFor?.message.turnTargets?.some(
        (target) => target.kind === 'engine' && target.model !== undefined,
      ));
  useLayoutEffect(() => {
    if ((!needsModels && !needsEngines) || client === undefined) return;
    let active = true;
    const keep = (catalog: TurnTargetCatalog) => {
      if (active)
        setMenuCatalog((previous) => ({
          ...(previous?.host === client ? previous : undefined),
          host: client,
          ...catalog,
        }));
    };
    if (needsModels)
      void loadModelCatalog(client).then(
        ({ models }) => keep({ models }),
        () => undefined,
      );
    if (needsEngines)
      void loadRoutingGroupEngines(client).then(
        (engines) => keep({ engines }),
        () => undefined,
      );
    return () => {
      active = false;
    };
  }, [client, needsModels, needsEngines]);
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
    menuCatalog,
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
