import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import { PairedDevicesSettings } from './paired-devices.js';

export function ConnectionsDialog({
  t,
  onClose,
  pairPhone = false,
  joinComputer = false,
  pairedDeviceId,
  onDevicePaired,
  onFeedRead,
}: {
  t: BotHarnessTranslate;
  onClose(): void;
  pairPhone?: boolean | undefined;
  joinComputer?: boolean | undefined;
  pairedDeviceId?: string | undefined;
  onDevicePaired?: ((deviceId: string) => void) | undefined;
  onFeedRead?: ((deviceId: string) => void) | undefined;
}): ReactElement {
  return (
    <PairedDevicesSettings
      pairedDeviceId={pairedDeviceId}
      onDevicePaired={onDevicePaired}
      onFeedRead={onFeedRead}
      t={t}
      standalone
      initialPairing={pairPhone}
      initialRemote={joinComputer}
      onClose={onClose}
    />
  );
}
