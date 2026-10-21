import {
  answerQuestion,
  decideApproval,
  decideGrantRequest,
} from '../../../../apps/mobile/src/host/attention-actions.js';
import {
  listHostFolders,
  resolveWorkspaceFolder,
} from '../../../../apps/mobile/src/host/bot-settings.js';
import type { BridgeActions } from './actions.js';
import type { MessageHost } from './message-host.js';
import type { FolderBrowserActions } from './workspace-grants-entry.js';

type RemoteMessageActions = Pick<
  BridgeActions,
  | 'toolApprovalStatus'
  | 'toolApprovalState'
  | 'toolApprovalExecutionState'
  | 'decideToolApproval'
  | 'userQuestionStatus'
  | 'answerUserQuestion'
  | 'privateInputStatus'
  | 'privateInputSubmit'
  | 'privateInputCancel'
  | 'pickWorkspaceFolder'
  | 'resolveWorkspaceGrantRequest'
> &
  FolderBrowserActions;

export function remoteMessageActions(host: MessageHost, botSlug: string): RemoteMessageActions {
  const { client } = host;
  const check = (channelId: string) => {
    if (!host.current(channelId)) throw new Error('The conversation changed.');
  };
  const ref = (channelId: string, messageId: string) => ({ channelId, messageId, botSlug });
  const approvalState: NonNullable<RemoteMessageActions['toolApprovalState']> = async (
    channelId,
    messageId,
  ) => {
    const value = await client.call<{ status: 'pending' | 'expired'; expiresAt?: string }>(
      'toolApprovalStatus',
      { channelId, messageId },
    );
    if (value.status !== 'pending' && value.status !== 'expired')
      throw new Error('Invalid approval status');
    return value;
  };
  return {
    toolApprovalState: approvalState,
    toolApprovalStatus: async (channelId, messageId) =>
      (await approvalState(channelId, messageId)).status,
    toolApprovalExecutionState: async (channelId, messageId) => {
      const value = await client.call<{
        execution?: Awaited<ReturnType<NonNullable<BridgeActions['toolApprovalExecutionState']>>>;
      }>('toolApprovalStatus', { channelId, messageId });
      return value.execution;
    },
    async decideToolApproval(channelId, messageId, outcome) {
      check(channelId);
      const result = await decideApproval(client, ref(channelId, messageId), outcome);
      if (result !== 'accepted') throw new Error('The approval is no longer pending.');
    },
    async userQuestionStatus(channelId, messageId) {
      const value = await client.call<{
        status: Awaited<ReturnType<BridgeActions['userQuestionStatus']>>;
      }>('userQuestionStatus', { channelId, messageId });
      if (!['pending', 'submitted', 'answered', 'expired'].includes(value.status))
        throw new Error('Invalid question status');
      return value.status;
    },
    async answerUserQuestion(channelId, messageId, answers) {
      check(channelId);
      const result = await answerQuestion(client, ref(channelId, messageId), { answers });
      if (result !== 'accepted') throw new Error('The question is no longer pending.');
    },
    async privateInputStatus(channelId, messageId) {
      const value = await client.call<{
        status: Awaited<ReturnType<NonNullable<BridgeActions['privateInputStatus']>>>;
      }>('privateInputStatus', { channelId, messageId });
      if (!['pending', 'configured', 'cancelled', 'expired'].includes(value.status))
        throw new Error('Invalid private input status');
      return value.status;
    },
    async privateInputSubmit(channelId, messageId, values) {
      check(channelId);
      const value = await client.call<{ accepted: boolean }>('privateInputSubmit', {
        channelId,
        messageId,
        values,
      });
      if (value.accepted !== true) throw new Error('Private input was not accepted');
    },
    async privateInputCancel(channelId, messageId) {
      check(channelId);
      const value = await client.call<{ accepted: boolean }>('privateInputCancel', {
        channelId,
        messageId,
      });
      if (value.accepted !== true) throw new Error('Private input cancellation was not accepted');
    },
    listHostFolders: (path) => listHostFolders(client, path),
    pickWorkspaceFolder: async () => null,
    async resolveWorkspaceGrantRequest(slug, messageId, path, _body, channelId) {
      if (slug !== botSlug || channelId === undefined) throw new Error('The conversation changed.');
      check(channelId);
      const workspace = await resolveWorkspaceFolder(client, path);
      check(channelId);
      const { result } = await decideGrantRequest(client, ref(channelId, messageId), workspace.id);
      if (result !== 'accepted') throw new Error('The folder request is no longer pending.');
    },
  };
}
