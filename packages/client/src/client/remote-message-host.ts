import { createContext } from 'react';
import { isConnectRoute } from '../../../../apps/mobile/src/host/route.js';

import { MethodRefused, type HostClient } from '../../../../apps/mobile/src/host/client.js';
import type { BridgeActions } from './actions.js';
import type { AttachmentFetch } from './attachment-fetch.js';
import {
  answerUserQuestion,
  cancelPrivateInput,
  decideToolApproval,
  errorMessage,
  loadPrivateInputStatus,
  loadToolApprovalExecutionState,
  loadToolApprovalState,
  loadToolApprovalStatus,
  loadUserQuestionStatus,
  submitPrivateInput,
  type BridgeCall,
} from './bridge.js';

export type MessageCardActions = Pick<
  BridgeActions,
  'toolApprovalStatus' | 'decideToolApproval' | 'userQuestionStatus' | 'answerUserQuestion'
> &
  Partial<
    Pick<
      BridgeActions,
      | 'toolApprovalState'
      | 'toolApprovalExecutionState'
      | 'privateInputStatus'
      | 'privateInputSubmit'
      | 'privateInputCancel'
      | 'privateAccountStatus'
      | 'privateAccountRevoke'
      | 'privateInputReplace'
    >
  >;

export interface RemoteMessageHost {
  actions: MessageCardActions;
  fetch: AttachmentFetch;
  isOpen(channelId: string): boolean;
  secretInputAllowed?(): boolean;
}

export const RemoteMessageHostContext = createContext<RemoteMessageHost | undefined>(undefined);

export function hostBridgeCall(client: Pick<HostClient, 'call'>): BridgeCall {
  return (endpoint, payload) =>
    client.call(endpoint, payload).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({
        ok: false as const,
        error: {
          code: error instanceof MethodRefused ? error.code : 'internal',
          message: errorMessage(error),
          details: {},
        },
      }),
    );
}

export function createRemoteMessageHost(
  client: Pick<HostClient, 'call' | 'resource'>,
  isOpen: (channelId: string) => boolean,
): RemoteMessageHost {
  const call = hostBridgeCall(client);
  return {
    isOpen,
    secretInputAllowed: () => !isConnectRoute(client.resource('/').uri),
    fetch: (path, init) => {
      const source = client.resource(path);
      return fetch(source.uri, {
        signal: init.signal,
        headers: source.headers,
        credentials: 'omit',
        mode: 'cors',
      });
    },
    actions: {
      toolApprovalStatus: (channelId, messageId) =>
        loadToolApprovalStatus(call, channelId, messageId),
      toolApprovalState: (channelId, messageId) =>
        loadToolApprovalState(call, channelId, messageId),
      toolApprovalExecutionState: (channelId, messageId) =>
        loadToolApprovalExecutionState(call, channelId, messageId),
      decideToolApproval: (channelId, messageId, outcome) =>
        decideToolApproval(call, channelId, messageId, outcome),
      userQuestionStatus: (channelId, messageId) =>
        loadUserQuestionStatus(call, channelId, messageId),
      answerUserQuestion: (channelId, messageId, answers) =>
        answerUserQuestion(call, channelId, messageId, answers),
      privateInputStatus: (channelId, messageId) =>
        loadPrivateInputStatus(call, channelId, messageId),
      privateInputSubmit: (channelId, messageId, values) =>
        submitPrivateInput(call, channelId, messageId, values),
      privateInputCancel: (channelId, messageId) => cancelPrivateInput(call, channelId, messageId),
    },
  };
}
