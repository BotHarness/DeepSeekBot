import type { LocalHumanIdentity, ComposerRecoveryIdentity } from '../../bridge.js';
import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import {
  readHumanAvatars,
  readHumanIdentity,
  setHumanName,
  setHumanAvatar as writeHumanAvatar,
  finishHumanProfile,
  type HumanAvatarImage,
} from '@botharness/host-client/human-profile';
import * as channels from '@botharness/host-client/channel-management';
import type { ChannelSummary } from '../../store.js';

export async function loadComposerIdentity(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ComposerRecoveryIdentity> {
  const value = asRecord(await unwrap(call, 'composerIdentity', {}, signal));
  if (
    value === undefined ||
    !['hostId', 'profileId', 'humanId'].every(
      (key) => typeof value[key] === 'string' && (value[key] as string).length > 0,
    )
  )
    throw new Error('invalid composer identity');
  return {
    hostId: value['hostId'] as string,
    profileId: value['profileId'] as string,
    humanId: value['humanId'] as string,
  };
}

export async function loadHumanIdentity(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<LocalHumanIdentity> {
  return readHumanIdentity(bridgeHost(call, signal));
}

export async function setHumanDefaultName(
  call: BridgeCall,
  displayName: string | null,
): Promise<LocalHumanIdentity> {
  return setHumanName(bridgeHost(call), displayName);
}

export async function setHumanAvatar(
  call: BridgeCall,
  avatar: string | null,
): Promise<LocalHumanIdentity> {
  return writeHumanAvatar(bridgeHost(call), avatar);
}

export async function finishHumanProfileSetup(call: BridgeCall): Promise<LocalHumanIdentity> {
  return finishHumanProfile(bridgeHost(call));
}

export async function loadHumanAvatars(
  call: BridgeCall,
  humanIds: string[],
): Promise<HumanAvatarImage[]> {
  return readHumanAvatars(bridgeHost(call), humanIds);
}

export function createChannelHumanNameBridge(presentChannel: (value: unknown) => ChannelSummary) {
  return async function setChannelHumanName(
    call: BridgeCall,
    channelId: string,
    nickname: string | null,
  ): Promise<ChannelSummary> {
    const { channel } = await channels.setChannelHumanName(bridgeHost(call), channelId, nickname);
    return presentChannel(channel);
  };
}
