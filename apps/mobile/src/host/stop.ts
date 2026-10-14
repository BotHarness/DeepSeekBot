import { MethodRefused, type HostClient } from './client';

export type StopOutcome =
  | { status: 'stopped' }
  | { status: 'not-working' }
  | { status: 'failed'; reason: string };

export async function stopBot(
  client: Pick<HostClient, 'call'>,
  channelId: string,
  botSlug: string,
): Promise<StopOutcome> {
  try {
    await client.call('channelBotStop', { channelId, botSlug });
    return { status: 'stopped' };
  } catch (error) {
    if (error instanceof MethodRefused && error.code === 'not-working')
      return { status: 'not-working' };
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
