import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore } from '../../plugin.js';
import { mountDevicePairing } from '../../devices/mount.js';

type DeviceOptions = Parameters<typeof mountDevicePairing>[1];

export function apply(
  ctx: Context,
  core: Pick<BotHarnessCore, 'live' | 'registry' | 'channels' | 'runtime' | 'operationalDatabase'>,
  options: Pick<
    DeviceOptions,
    'team' | 'calls' | 'telemetry' | 'onAccount' | 'dshHome' | 'packageAnchors' | 'push'
  > & {
    onNetwork: NonNullable<DeviceOptions['botNetwork']>['available'];
  },
) {
  const { onNetwork, ...deviceOptions } = options;
  mountDevicePairing(ctx, {
    ...deviceOptions,
    onDevicesChanged: () => core.live.publishResourceChanged('devices'),
    onAccountChanged: () => core.live.publishResourceChanged('account'),
    botNetwork: {
      registry: core.registry,
      channels: core.channels,
      admitBotDmMessage: (channelId, messageId) =>
        core.runtime.admitBotDmMessage(channelId, messageId),
      withdrawNetworkMembership: (hostId) => core.runtime.withdrawNetworkMembership(hostId),
      available: onNetwork,
    },
    requestStatus: (channelId, messageId) => core.channels.humanSendStatus?.(channelId, messageId),
    database: core.operationalDatabase,
    credentials: () => ctx.get('credentials'),
  });
}
