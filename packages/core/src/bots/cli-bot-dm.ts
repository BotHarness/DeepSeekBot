import { openBotDm } from '@botharness/host-client/channel-management';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { CliLiveError } from './cli-live-error.js';

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

export async function resolveBotDm(rpc: Rpc, slug: string, displayName?: string): Promise<string> {
  try {
    const channel = await openBotDm(
      { call: (method, args = {}) => rpc(method, args) },
      { slug, ...(displayName === undefined ? {} : { displayName }) },
    );
    return channel.id;
  } catch (error) {
    if (error instanceof HostAnswerInvalid)
      throw new CliLiveError('host-protocol-error', 'host-protocol-error');
    throw error;
  }
}
