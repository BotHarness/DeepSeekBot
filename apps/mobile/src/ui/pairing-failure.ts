import type { PairingFailure } from '../host/pairing';
import type { PairingMethod } from '../telemetry/schema';
import { t } from './strings';

const LINK_FAULTS = new Set<PairingFailure>([
  'link-invalid',
  'link-expired',
  'offer-invalid',
  'offer-expired',
]);

export function pairingFailureText(code: PairingFailure, method: PairingMethod): string {
  if (method === 'qr' || method === 'account') return t.pairRefused[code];
  const link: Partial<Record<PairingFailure, string>> = t.pairRefusedLink;
  return link[code] ?? t.pairRefused[code];
}

export function clearsPastedLink(code: PairingFailure, method: PairingMethod): boolean {
  return method === 'paste' && LINK_FAULTS.has(code);
}
