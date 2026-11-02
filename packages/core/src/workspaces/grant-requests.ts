import { OperationalDatabaseError } from '../database/owner.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ChannelStore } from '../channels/store.js';
import type { ChannelMessage } from '../channels/channel.js';
import type { BotRuntime } from '../runtime/bot-runtime.js';
import { WorkspaceGrantError, type WorkspaceGrantStore, type WorkspaceGrant } from './grants.js';

export interface GrantRequestApproval {
  slug: string;
  channelId: string;
  requestMessageId: string;
  workspaceId: string;
}
export interface GrantRequestApprovalResult {
  grant: WorkspaceGrant;
  message: ChannelMessage;
}

export async function approveGrantRequest(
  deps: {
    registry: PersonaBotRegistry;
    channels: ChannelStore;
    grants: WorkspaceGrantStore;
    runtime?: Pick<BotRuntime, 'admitDmMessage' | 'admitGroupMessage'>;
    toolApproval?: { cancelInvalid(): void };
  },
  input: GrantRequestApproval,
): Promise<GrantRequestApprovalResult> {
  const { slug, channelId, requestMessageId, workspaceId } = input;
  const fail = (message: string): never => {
    throw new WorkspaceGrantError('invalid-grant', message);
  };
  const initialBot = deps.registry.get(slug);
  const validate = (): void => {
    const bot = deps.registry.get(slug);
    const channel = deps.channels.get(channelId);
    const request = deps.channels.message(channelId, requestMessageId);
    if (
      !bot ||
      bot.paused ||
      bot.createdAt !== initialBot?.createdAt ||
      !channel ||
      channel.deletedAt ||
      (channel.type === 'dm' ? channel.botSlug !== slug : !channel.members.includes(slug)) ||
      !request?.grantRequest ||
      request.author.kind !== 'bot' ||
      request.author.slug !== slug ||
      Date.parse(request.at) < Date.parse(bot.createdAt) ||
      (request.grantRequestOwner !== undefined && request.grantRequestOwner !== bot.createdAt)
    )
      fail('Workspace request is no longer available for this Bot');
  };
  const decided = (): GrantRequestApprovalResult | undefined => {
    const resolution = deps.channels.grantRequestResolution?.(channelId, requestMessageId);
    if (!resolution) return;
    const grant = deps.grants.requireActive(slug, resolution.grantRequestResolution!.grantId);
    if (grant.workspaceId !== workspaceId || grant.orchestratorWrite !== true)
      fail('This request was already decided for different or no longer writable authority');
    return { grant, message: resolution };
  };
  validate();
  const previous = decided();
  if (previous) return previous;
  if (!deps.grants.prepareWrite) fail('Writable Workspace authorization is unavailable');
  const prepared = await deps.grants.prepareWrite!(slug, workspaceId, validate);
  validate();
  const winner = decided();
  if (winner) return winner;
  const message: ChannelMessage = {
    id: 'grant-resolution-' + requestMessageId,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: `I authorized workspace “${prepared.grant.workspaceTitle}” for read/write. Continue the original task.`,
    replyTo: requestMessageId,
    grantRequestResolution: { requestMessageId, grantId: prepared.grant.id },
  };
  const result = await deps.channels
    .appendMessageOnce(channelId, message, undefined, undefined, prepared.commit)
    .catch((error: unknown) => {
      if (error instanceof OperationalDatabaseError && error.cause instanceof WorkspaceGrantError)
        throw error.cause;
      throw error;
    });
  if (result.status !== 'appended' && result.status !== 'existing')
    return fail('Workspace authorization could not be committed');
  const grant = deps.grants.requireActive(slug, result.message.grantRequestResolution!.grantId);
  if (!grant.orchestratorWrite) fail('Workspace write authorization could not be confirmed');
  deps.toolApproval?.cancelInvalid();
  if (result.status === 'appended') {
    if (deps.channels.get(channelId)?.type === 'group')
      deps.runtime?.admitGroupMessage(channelId, result.message.id);
    else
      deps.runtime?.admitDmMessage({
        channelId,
        messageId: result.message.id,
        body: result.message.body,
      });
  }
  return { grant, message: result.message };
}
