import type { DeviceCompatibility } from '../../../../packages/core/src/devices/compatibility';

export const COMPATIBILITY_PATH = '/api/botharness/devices/compatibility';
export const PHONE_PROTOCOL = 1;

export class ProtocolIncompatible extends Error {
  readonly code = 'protocol-incompatible';
  constructor() {
    super(
      'Update the phone and computer apps to a supported release combination, then retry. Pairing again will not fix this protocol mismatch.',
    );
  }
}

export type Compatibility =
  | { status: 'unverified'; qualification: 'unverified' }
  | (DeviceCompatibility & { status: 'compatible' | 'incompatible'; qualification: 'unverified' });

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function readCompatibility(status: number, body: unknown): Compatibility {
  if (status === 404) return { status: 'unverified', qualification: 'unverified' };
  const value = record(body);
  const protocol = record(value['protocol']);
  const host = record(value['host']);
  const features = record(value['features']);
  if (
    status !== 200 ||
    value['schemaVersion'] !== 1 ||
    !Number.isSafeInteger(protocol['min']) ||
    !Number.isSafeInteger(protocol['max']) ||
    (protocol['min'] as number) < 1 ||
    (protocol['min'] as number) > (protocol['max'] as number) ||
    !['version', 'source', 'platform', 'arch'].every(
      (key) => typeof host[key] === 'string' && host[key] !== '',
    ) ||
    typeof features['push'] !== 'boolean'
  )
    throw new Error(
      'The Host returned invalid compatibility information. Update the computer app or retry.',
    );
  const info = value as unknown as DeviceCompatibility;
  return {
    ...info,
    status:
      PHONE_PROTOCOL >= info.protocol.min && PHONE_PROTOCOL <= info.protocol.max
        ? 'compatible'
        : 'incompatible',
    qualification: 'unverified',
  };
}
