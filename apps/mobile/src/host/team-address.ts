import { noiseFingerprint } from '@botharness/host-protocol/noise/xk';
import { keyBytes } from '@botharness/host-client/encrypted-carrier';
import type { SavedHost } from '@botharness/host-client/hosts';

export function teamAddressRoute(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function pinnedFingerprint(hosts: readonly SavedHost[], hostId: string): string | undefined {
  const saved = hosts.find((host) => host.hostId === hostId);
  if (saved === undefined) return undefined;
  return (
    saved.member?.fingerprint ??
    (saved.encryption ? noiseFingerprint(keyBytes(saved.encryption.hostKey)) : undefined)
  );
}
