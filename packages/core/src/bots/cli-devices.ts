import { existsSync, writeFileSync } from 'node:fs';

import { CliLiveError } from './cli-live-error.js';

export const DEVICES_COMMANDS = [
  {
    command: 'devices',
    description: 'list paired devices with this Host identity and its phone routes',
  },
  {
    command: 'device-offer',
    description:
      'open a pairing offer and write its link only to a new private --out file; prints a receipt',
  },
  {
    command: 'device-offer-status',
    description: 'show whether the offer behind a receipt is pending, redeemed or expired',
  },
  {
    command: 'device-revoke',
    description: 'revoke one paired device and close its open streams (needs --confirm)',
  },
] as const;

const DEVICES = '/api/botharness/devices';

const absolute = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value);

export function isDevicesCommand(command: string): boolean {
  return DEVICES_COMMANDS.some((entry) => entry.command === command);
}

export async function runDevicesCommand(
  command: string,
  rest: string[],
  values: { confirm?: boolean; out?: string },
  connect: () => Promise<{
    http(path: string, body?: Record<string, unknown>): Promise<{ bytes: Uint8Array }>;
  }>,
  write: (path: string, text: string) => void = (path, text) =>
    writeFileSync(path, `${text}\n`, { flag: 'wx', mode: 0o600 }),
  exists: (path: string) => boolean = existsSync,
): Promise<unknown> {
  const takes = command === 'device-offer-status' || command === 'device-revoke' ? 1 : 0;
  if (rest.length !== takes)
    throw new CliLiveError(
      'usage',
      takes === 0
        ? `${command} takes no arguments.`
        : `${command} takes exactly one ${command === 'device-revoke' ? '<device-id>' : '<receipt>'}.`,
    );
  if (values.out !== undefined && command !== 'device-offer')
    throw new CliLiveError('usage', '--out requires device-offer.');
  if (command === 'device-offer') {
    if (values.out === undefined)
      throw new CliLiveError(
        'out-required',
        'device-offer writes the pairing link only to a file. Pass --out with a new absolute path, or show the QR code from Bot settings → Devices.',
      );
    if (!absolute(values.out))
      throw new CliLiveError('usage', '--out must be an absolute file path.');
    if (exists(values.out))
      throw new CliLiveError(
        'output-exists',
        'The output already exists; choose a new --out path.',
      );
  }
  if (command === 'device-revoke' && values.confirm !== true)
    throw new CliLiveError(
      'confirm-required',
      'device-revoke signs the device out at once and it must pair again. Pass --confirm.',
    );
  const host = await connect();
  const decode = (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  if (command === 'devices') {
    const snapshot = decode((await host.http(DEVICES)).bytes);
    return {
      host: snapshot['host'],
      devices: snapshot['devices'],
      routes: snapshot['routes'],
    };
  }
  if (command === 'device-offer-status')
    return decode((await host.http(`${DEVICES}/offer-status`, { receipt: rest[0] })).bytes);
  if (command === 'device-revoke')
    return decode((await host.http(`${DEVICES}/revoke`, { deviceId: rest[0] })).bytes);
  const view = decode((await host.http(`${DEVICES}/offer`, {})).bytes);
  const receipt = { receipt: view['receipt'], expiresAt: view['expiresAt'] };
  try {
    write(values.out!, String(view['link']));
  } catch (error) {
    const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
    throw new CliLiveError(
      exists ? 'output-exists' : 'output-unavailable',
      `${
        exists
          ? 'The output already exists; choose a new --out path.'
          : 'Could not write the output file.'
      } Offer ${String(view['receipt'])} was opened but not delivered; it expires at ${String(view['expiresAt'])}.`,
    );
  }
  return {
    ...receipt,
    routes: view['routes'],
    reachable: view['reachable'],
    link: { path: values.out },
  };
}
