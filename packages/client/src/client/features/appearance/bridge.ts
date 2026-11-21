import { asRecord, unwrap, type BridgeCall } from '../../bridge-transport.js';
import type { ChannelSummary } from '../../store.js';
import { parseChannelRecord } from '../channels/bridge.js';

export async function setGroupAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupAvatarSet', { channelId, avatar }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupAvatarSet response');
  return channel;
}
