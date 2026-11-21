import { unwrap, type BridgeCall } from '../../bridge-transport.js';

export async function settleTakeover(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  outcome: 'done' | 'failed' | 'cancelled',
): Promise<'done' | 'failed' | 'cancelled' | 'expired' | undefined> {
  const value = await unwrap(
    call,
    outcome === 'cancelled' ? 'takeoverCancel' : 'takeoverComplete',
    outcome === 'cancelled'
      ? { channelId, messageId, surface: 'web' }
      : { channelId, messageId, outcome, surface: 'web' },
  );
  const status = (value as { takeover?: { status?: unknown } } | undefined)?.takeover?.status;
  return status === 'done' || status === 'failed' || status === 'cancelled' || status === 'expired'
    ? status
    : undefined;
}
