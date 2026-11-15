import { z } from 'zod';
import { CliLiveError } from './cli-live-error.js';

type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

export async function resolveBotDm(rpc: Rpc, slug: string, displayName?: string): Promise<string> {
  const result = z
    .object({ channel: z.object({ id: z.string().min(1) }) })
    .safeParse(
      await rpc('channelDm', { slug, ...(displayName === undefined ? {} : { displayName }) }),
    );
  if (!result.success) throw new CliLiveError('host-protocol-error', 'host-protocol-error');
  return result.data.channel.id;
}
