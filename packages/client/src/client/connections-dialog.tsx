import type { ReactElement } from 'react';
import type { BridgeCall } from './bridge-transport.js';
import type { BotHarnessTranslate } from './locale.js';
import { AddRemoteHostDialog } from './host-tabs.js';
import { PairedDevicesSettings } from './paired-devices.js';

export function ConnectionsDialog({
  call,
  t,
  onClose,
  pairPhone = false,
  joinComputer = false,
  quickConnect = false,
  pairedDeviceId,
  onDevicePaired,
  onFeedRead,
}: {
  call?: BridgeCall | undefined;
  t: BotHarnessTranslate;
  onClose(): void;
  pairPhone?: boolean | undefined;
  joinComputer?: boolean | undefined;
  quickConnect?: boolean | undefined;
  pairedDeviceId?: string | undefined;
  onDevicePaired?: ((deviceId: string) => void) | undefined;
  onFeedRead?: ((deviceId: string) => void) | undefined;
}): ReactElement {
  if (joinComputer) return <AddRemoteHostDialog t={t} onClose={onClose} />;
  return (
    <PairedDevicesSettings
      ownerPasswordSignInCall={call}
      pairedDeviceId={pairedDeviceId}
      onDevicePaired={onDevicePaired}
      onFeedRead={onFeedRead}
      t={t}
      standalone
      initialPairing={pairPhone}
      initialQuick={quickConnect}
      onClose={onClose}
    />
  );
}

export function ConnectionsPage({
  call,
  t,
  pairPhone = false,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
  pairPhone?: boolean | undefined;
}): ReactElement {
  return (
    <PairedDevicesSettings
      key={String(pairPhone)}
      ownerPasswordSignInCall={call}
      t={t}
      standalone
      page
      initialPairing={pairPhone}
    />
  );
}
