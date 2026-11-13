import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
import { PairedDevicesSettings } from './paired-devices.js';

export function ConnectionsDialog({
  t,
  onClose,
  pairPhone = false,
}: {
  t: BotHarnessTranslate;
  onClose(): void;
  pairPhone?: boolean | undefined;
}): ReactElement {
  return <PairedDevicesSettings t={t} standalone initialPairing={pairPhone} onClose={onClose} />;
}
