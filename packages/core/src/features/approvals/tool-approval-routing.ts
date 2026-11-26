import type { Context } from '@deepseek-ai/cordis';
import type { ApprovalOutcome, ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';

export async function requestRequiredToolApproval({
  approval,
  channelApproval,
  ownership,
  request,
  forceChannel,
}: {
  approval: Pick<ApprovalService, 'request'>;
  channelApproval: Pick<ChannelToolApproval, 'ask'>;
  ownership: Pick<SessionOwnership, 'resolve'>;
  request: Parameters<ApprovalService['request']>[0];
  forceChannel: boolean;
}): Promise<ApprovalOutcome> {
  const owner = ownership.resolve(request.agent.session.id);
  if (forceChannel && owner !== undefined && owner.parentSessionId === undefined)
    return (await channelApproval.ask(request)) ?? 'unavailable';
  return approval.request(request);
}

export function registerChannelToolApproval(
  ctx: Context,
  approval: Pick<ChannelToolApproval, 'ask'>,
): void {
  ctx.on('approval/request', async (request, next) => (await approval.ask(request)) ?? next(), {
    global: true,
    prepend: true,
  });
}
